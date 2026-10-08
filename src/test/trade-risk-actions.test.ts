import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	calculateManualPnl,
	type PnlCalculationSnapshot,
} from "@/lib/pnl-context";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { tradeCaptureSchema } from "@/lib/trade-capture";
import { calculateInitialRisk } from "@/lib/trade-risk";
import { createTrade, updateTrade } from "@/server/tradeActions";
import { correctTradeInitialRisk } from "@/server/tradeRiskActions";

const mocks = vi.hoisted(() => ({
	values: vi.fn(),
	where: vi.fn(),
	set: vi.fn(),
	condition: vi.fn(),
	returning: vi.fn(),
	user: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/auth", () => ({ requireUserId: () => mocks.user() }));
vi.mock("@/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: mocks.where }) }),
		insert: () => ({ values: mocks.values }),
		update: () => ({ set: mocks.set }),
	},
}));
const capture = {
	symbol: "EURUSD",
	side: TradeSide.Long,
	entryPrice: "1.1",
	quantity: "0.2",
	initialStopPrice: "1.095",
	targetPrice: "1.11",
	portfolioId: 7,
	entryDate: "2026-10-01T10:00:00Z",
	balanceAccount: "10000",
};
const riskCapture = tradeCaptureSchema.parse(capture);
const stored = () => ({
	...capture,
	...calculateInitialRisk({ ...capture, accountCurrency: "USD" }),
	id: 2,
	userId: "user1",
	entryDate: new Date(capture.entryDate),
	exitDate: new Date("2026-10-01T12:00:00Z"),
	exitPrice: "1.11",
	fees: "5",
	netPnl: "195.00",
	returnPercent: "0.91",
	status: TradeStatus.Closed,
	importHash: null as string | null,
	editRevision: 4,
	riskCorrectionHistory: null,
	exitQuoteToAccountRate: null as string | null,
	pnlCalculationSnapshot: null as PnlCalculationSnapshot | null,
	managementStopPrice: "1.095",
});
beforeEach(() => {
	vi.resetAllMocks();
	mocks.user.mockResolvedValue("user1");
	mocks.returning.mockResolvedValue([{ id: 2 }]);
	mocks.condition.mockReturnValue({ returning: mocks.returning });
	mocks.set.mockReturnValue({ where: mocks.condition });
	mocks.where.mockResolvedValue([{ currency: "USD", id: 7 }]);
});
function selectExisting(row = stored()) {
	mocks.where.mockResolvedValueOnce([row]);
}

describe("captured risk persistence", () => {
	it("computes the server snapshot and distinct manual exit rate", async () => {
		await createTrade({
			data: {
				...capture,
				symbol: "EURJPY",
				entryPrice: "169",
				initialStopPrice: "168",
				quantity: "0.15",
				entryQuoteToAccountRate: String(1 / 150),
				exitPrice: "171",
				exitDate: "2026-10-01T12:00:00Z",
				exitQuoteToAccountRate: "0.00625",
				fees: "5",
			},
		});
		const saved = mocks.values.mock.calls[0][0];
		expect(Number(saved.initialRiskAmount)).toBeCloseTo(100, 8);
		expect(saved.netPnl).toBe("182.50");
		expect(saved.exitQuoteToAccountRate).toBe("0.00625");
		expect(saved.initialRiskSnapshot.quoteToAccountRate).not.toBe(
			saved.exitQuoteToAccountRate,
		);
		expect(saved.status).toBe(TradeStatus.Closed);
	});
	it("allows unavailable risk on an open trade and preserves target semantics", async () => {
		await createTrade({
			data: { ...capture, initialStopPrice: "", symbol: "EURJPY" },
		});
		expect(mocks.values).toHaveBeenCalledWith(
			expect.objectContaining({
				initialRiskAmount: null,
				initialRiskPercent: null,
				status: TradeStatus.Open,
				netPnl: undefined,
				targetPrice: "1.11",
			}),
		);
	});
	it("validates auth, account ownership and wrong-side stops before writes", async () => {
		mocks.user.mockRejectedValueOnce(new Error("Unauthorized"));
		await expect(createTrade({ data: capture })).rejects.toThrow(
			"Unauthorized",
		);
		mocks.where.mockResolvedValueOnce([]);
		await expect(createTrade({ data: capture })).rejects.toThrow(
			"Account not found",
		);
		await expect(
			createTrade({ data: { ...capture, initialStopPrice: "1.2" } }),
		).rejects.toThrow("Initial stop");
		expect(mocks.values).not.toHaveBeenCalled();
	});
});

describe("management and corrections", () => {
	it("same numeric execution values preserve saved P&L context", async () => {
		selectExisting({
			...stored(),
			...calculateManualPnl({
				...capture,
				accountCurrency: "USD",
				exitPrice: "1.11",
				fees: "5",
			}),
		});
		await updateTrade({
			data: {
				id: 2,
				entryPrice: "1.1000",
				quantity: "0.2000",
				exitPrice: "1.1100",
				fees: "5.00",
				exitDate: "2026-10-01T12:00:00.000Z",
				managementStopPrice: "1.105",
				confirmedUnitQuoteCurrency: "",
			},
		});
		expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("netPnl");
	});
	it("original-plan correction rejects exit inputs instead of changing the P&L basis", async () => {
		await expect(
			correctTradeInitialRisk({
				data: {
					...riskCapture,
					id: 2,
					expectedRevision: 4,
					reason: "Correction",
					correctExecutionInputs: true,
					exitPrice: "1.2",
				} as never,
			}),
		).rejects.toThrow();
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it("execution correction cannot reuse exit FX for a different quote currency", async () => {
		const pnl = calculateManualPnl({
			symbol: "EURJPY",
			side: TradeSide.Long,
			entryPrice: "169",
			exitPrice: "171",
			exitDate: "2026-10-01T12:00:00Z",
			quantity: "0.15",
			accountCurrency: "USD",
			exitQuoteToAccountRate: "0.00625",
		});
		selectExisting({
			...stored(),
			...pnl,
			symbol: "EURJPY",
			entryPrice: "169",
			exitPrice: "171",
		});
		await expect(
			correctTradeInitialRisk({
				data: {
					...riskCapture,
					id: 2,
					expectedRevision: 4,
					reason: "Wrong instrument",
					correctExecutionInputs: true,
					symbol: "EURGBP",
				},
			}),
		).rejects.toThrow("quote currency");
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it("management stop, target and current quantity changes never write original risk", async () => {
		selectExisting();
		await updateTrade({
			data: {
				id: 2,
				expectedRevision: 4,
				managementStopPrice: "1.105",
				targetPrice: "1.12",
				quantity: "0.1",
			},
		});
		const patch = mocks.set.mock.calls[0][0];
		expect(patch.managementStopPrice).toBe("1.105");
		expect(patch.netPnl).toBe("95.00");
		expect(patch).not.toHaveProperty("initialRiskAmount");
		expect(patch).not.toHaveProperty("initialRiskSnapshot");
	});
	it("same-value entry payloads work, changed initial facts require correction", async () => {
		selectExisting();
		await updateTrade({
			data: {
				id: 2,
				expectedRevision: 4,
				entryPrice: "1.1",
				targetPrice: "1.12",
			},
		});
		selectExisting();
		await expect(
			updateTrade({ data: { id: 2, entryPrice: "1.09" } }),
		).rejects.toThrow("Correct original plan");
	});
	it("rejects initial plan injection through generic update", async () => {
		await expect(
			updateTrade({ data: { id: 2, initialRiskAmount: "5" } as never }),
		).rejects.toThrow();
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it("risk-only correction appends before/after history and CAS without recalculating broker money", async () => {
		selectExisting({
			...stored(),
			importHash: "broker-hash",
			netPnl: "123.45",
		});
		await correctTradeInitialRisk({
			data: {
				...riskCapture,
				id: 2,
				expectedRevision: 4,
				reason: "Original quantity typo",
				quantity: "0.1",
			},
		});
		const patch = mocks.set.mock.calls[0][0];
		expect(Number(patch.initialRiskAmount)).toBeCloseTo(50, 8);
		expect(patch).not.toHaveProperty("netPnl");
		expect(patch).not.toHaveProperty("importHash");
		const dialect = new PgDialect();
		const historyQuery = dialect.sqlToQuery(patch.riskCorrectionHistory);
		const correction = JSON.parse(String(historyQuery.params[0]))[0];
		expect(Number(correction.previous.initialRiskAmount)).toBeCloseTo(100, 8);
		expect(Number(correction.replacement.initialRiskAmount)).toBeCloseTo(50, 8);
		expect(correction.reason).toBe("Original quantity typo");
		const where = dialect.sqlToQuery(mocks.condition.mock.calls[0][0]);
		expect(where.sql).toContain('"edit_revision" =');
		expect(where.params).toContain(4);
	});
	it("execution correction recalculates manual P&L and rejects imported execution changes", async () => {
		selectExisting();
		await correctTradeInitialRisk({
			data: {
				...riskCapture,
				id: 2,
				expectedRevision: 4,
				reason: "Quantity typo",
				quantity: "0.1",
				correctExecutionInputs: true,
			},
		});
		expect(mocks.set.mock.calls[0][0].netPnl).toBe("95.00");
		expect(mocks.set.mock.calls[0][0].quantity).toBe("0.1");
		selectExisting({ ...stored(), importHash: "broker-hash" });
		await expect(
			correctTradeInitialRisk({
				data: {
					...riskCapture,
					id: 2,
					expectedRevision: 4,
					reason: "Quantity typo",
					quantity: "0.1",
					correctExecutionInputs: true,
				},
			}),
		).rejects.toThrow("import reconciliation");
		expect(mocks.set).toHaveBeenCalledOnce();
	});
	it("legacy attestation retains a null previous risk and does not guess it", async () => {
		selectExisting({
			...stored(),
			initialRiskAmount: null,
			initialRiskSnapshot: null,
			initialStopPrice: null,
			initialTargetPrice: null,
			initialRiskPercent: null,
		});
		await correctTradeInitialRisk({
			data: {
				...riskCapture,
				id: 2,
				expectedRevision: 4,
				reason: "Entered original plan from journal",
			},
		});
		const query = new PgDialect().sqlToQuery(
			mocks.set.mock.calls[0][0].riskCorrectionHistory,
		);
		expect(
			JSON.parse(String(query.params[0]))[0].previous.initialRiskAmount,
		).toBeNull();
	});
	it("stale reads and zero-row CAS are conflicts, without success or a second write", async () => {
		selectExisting();
		await expect(
			correctTradeInitialRisk({
				data: {
					...riskCapture,
					id: 2,
					expectedRevision: 3,
					reason: "Correction",
				},
			}),
		).rejects.toThrow("Trade changed");
		expect(mocks.set).not.toHaveBeenCalled();
		selectExisting();
		mocks.returning.mockResolvedValueOnce([]);
		await expect(
			correctTradeInitialRisk({
				data: {
					...riskCapture,
					id: 2,
					expectedRevision: 4,
					reason: "Correction",
				},
			}),
		).rejects.toThrow("Trade changed");
		expect(mocks.set).toHaveBeenCalledOnce();
	});
	it("notes do not recalculate manual P&L and imported execution edits preserve reported P&L", async () => {
		selectExisting();
		await updateTrade({
			data: { id: 2, notes: "review", expectedRevision: 4 },
		});
		expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("netPnl");
		selectExisting({ ...stored(), importHash: "broker-hash" });
		await updateTrade({ data: { id: 2, quantity: "0.1", fees: "9" } });
		expect(mocks.set.mock.calls[1][0]).not.toHaveProperty("netPnl");
	});
});
