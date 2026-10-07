import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeSide, TradeStatus } from "@/lib/trade";
import { calculateInitialRisk } from "@/lib/trade-risk";
import { blankDecimalsToNull } from "@/lib/trade-update";
import { createTrade, updateTrade } from "@/server/tradeActions";

const mocks = vi.hoisted(() => ({
	values: vi.fn(),
	where: vi.fn(),
	set: vi.fn(),
	condition: vi.fn(),
	returning: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => "user1" }));
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
};
const openTrade = () => ({
	...capture,
	...calculateInitialRisk({ ...capture, accountCurrency: "USD" }),
	id: 2,
	userId: "user1",
	entryDate: new Date(capture.entryDate),
	exitDate: null,
	exitPrice: null as string | null,
	exitQuoteToAccountRate: null,
	fees: "0",
	netPnl: null,
	returnPercent: null,
	pnlCalculationSnapshot: null,
	status: TradeStatus.Open,
	importHash: null,
	editRevision: 4,
	annotationRevision: 0,
	managementStopPrice: "1.095",
	setupId: null,
});
const overviewSave = {
	id: 2,
	expectedRevision: 4,
	entryPrice: "1.1",
	targetPrice: "1.11",
	exitPrice: "",
	exitQuoteToAccountRate: "",
	managementStopPrice: "1.098",
	quantity: "0.2",
	fees: "",
	setupId: null,
};
const decimalColumns = [
	"entryPrice",
	"targetPrice",
	"exitPrice",
	"exitQuoteToAccountRate",
	"managementStopPrice",
	"quantity",
	"fees",
	"initialStopPrice",
	"entryQuoteToAccountRate",
];

beforeEach(() => {
	vi.resetAllMocks();
	mocks.returning.mockResolvedValue([{ id: 2 }]);
	mocks.condition.mockReturnValue({ returning: mocks.returning });
	mocks.set.mockReturnValue({ where: mocks.condition });
	mocks.where.mockResolvedValue([{ currency: "USD", id: 7 }]);
});

describe("blank decimal normalisation", () => {
	it("stores blank optional decimals as null and blank fees as zero", () => {
		expect(
			blankDecimalsToNull({
				targetPrice: "",
				exitPrice: "",
				exitQuoteToAccountRate: "",
				managementStopPrice: "",
				initialStopPrice: "",
				entryQuoteToAccountRate: "",
				fees: "",
				notes: "",
			}),
		).toEqual({
			targetPrice: null,
			exitPrice: null,
			exitQuoteToAccountRate: null,
			managementStopPrice: null,
			initialStopPrice: null,
			entryQuoteToAccountRate: null,
			fees: "0",
			notes: "",
		});
	});
	it("keeps entered and omitted values", () => {
		const values = { exitPrice: "1.2", fees: "5", targetPrice: null };
		expect(blankDecimalsToNull(values)).toEqual(values);
		expect(blankDecimalsToNull({})).not.toHaveProperty("exitPrice");
	});
});

describe("overview save of an open trade", () => {
	it("writes no blank string to a numeric column and keeps the trade open", async () => {
		mocks.where.mockResolvedValueOnce([openTrade()]);
		await updateTrade({ data: overviewSave });
		const written = mocks.set.mock.calls[0][0];
		for (const column of decimalColumns) expect(written[column]).not.toBe("");
		expect(written).toMatchObject({
			exitPrice: null,
			exitQuoteToAccountRate: null,
			fees: "0",
			managementStopPrice: "1.098",
			status: TradeStatus.Open,
		});
		expect(written).not.toHaveProperty("netPnl");
	});
	it("still closes the trade and calculates P&L when an exit is entered", async () => {
		mocks.where.mockResolvedValueOnce([openTrade()]);
		await updateTrade({
			data: {
				...overviewSave,
				exitPrice: "1.11",
				exitDate: "2026-10-01T12:00:00Z",
			},
		});
		const written = mocks.set.mock.calls[0][0];
		expect(written).toMatchObject({
			exitPrice: "1.11",
			status: TradeStatus.Closed,
			netPnl: "200.00",
		});
		expect(written.exitQuoteToAccountRate).not.toBe("");
	});
	it("refuses to clear the exit price of a closed trade", async () => {
		mocks.where.mockResolvedValueOnce([
			{ ...openTrade(), exitPrice: "1.11", status: TradeStatus.Closed },
		]);
		await expect(updateTrade({ data: overviewSave })).rejects.toThrow(
			"keeps its exit price",
		);
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it("keeps the original plan guard for a management stop edit", async () => {
		mocks.where.mockResolvedValueOnce([openTrade()]);
		await expect(
			updateTrade({ data: { ...overviewSave, entryPrice: "1.2" } }),
		).rejects.toThrow("Correct original plan");
		expect(mocks.set).not.toHaveBeenCalled();
	});
});

describe("create with blank optional decimals", () => {
	it("writes no blank string to a numeric column", async () => {
		await createTrade({
			data: {
				...capture,
				initialStopPrice: "",
				targetPrice: "",
				exitPrice: "",
				exitQuoteToAccountRate: "",
				entryQuoteToAccountRate: "",
				fees: "",
			},
		});
		const written = mocks.values.mock.calls[0][0];
		for (const column of decimalColumns) expect(written[column]).not.toBe("");
		expect(written).toMatchObject({
			exitPrice: null,
			targetPrice: null,
			fees: "0",
			status: TradeStatus.Open,
		});
	});
});
