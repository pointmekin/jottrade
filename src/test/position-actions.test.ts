import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { ExecutionKind, type executionInputSchema } from "@/lib/position";
import { TradeSide, TradeStatus } from "@/lib/trade";
import {
	addExecution,
	deleteExecution,
	getPositionExecutions,
} from "@/server/positionActions";
import { updateTrade } from "@/server/tradeActions";
import { correctTradeInitialRisk } from "@/server/tradeRiskActions";

const mocks = vi.hoisted(() => ({
	rows: vi.fn(),
	values: vi.fn(),
	set: vi.fn(),
	batch: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => "user1" }));
vi.mock("@/db", () => {
	const where = () => {
		const rows = mocks.rows();
		return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
	};
	return {
		db: {
			select: () => ({ from: () => ({ where }) }),
			insert: () => ({ values: mocks.values }),
			delete: () => ({ where: vi.fn() }),
			update: () => ({
				set: (values: unknown) => {
					mocks.set(values);
					return { where: () => ({ returning: async () => [{ id: 2 }] }) };
				},
			}),
			execute: vi.fn(),
			batch: mocks.batch,
		},
	};
});

const at = (hour: number) => new Date(Date.UTC(2026, 9, 1, hour));
const legacyTrade = (overrides = {}) => ({
	id: 2,
	userId: "user1",
	portfolioId: 7,
	symbol: "EURUSD",
	side: TradeSide.Long,
	status: TradeStatus.Open,
	entryDate: at(1),
	entryPrice: "1.1000",
	quantity: "1",
	exitDate: null as Date | null,
	exitPrice: null as string | null,
	exitQuoteToAccountRate: null,
	fees: "0",
	netPnl: null as string | null,
	returnPercent: null,
	pnlCalculationSnapshot: null,
	importHash: null as string | null,
	brokerSource: null as string | null,
	initialRiskSnapshot: null,
	editRevision: 3,
	annotationRevision: 0,
	executionCount: 0,
	setupId: null,
	...overrides,
});
const closedTrade = (netPnl = "100.00") =>
	legacyTrade({
		status: TradeStatus.Closed,
		exitDate: at(5),
		exitPrice: "1.1010",
		netPnl,
	});
const ACCOUNT = { id: 7, name: "Main", currency: "USD" };
const entryAt = (hour: number, quantity = "1", price = "1.0950") => ({
	kind: ExecutionKind.Entry,
	executedAt: at(hour).toISOString(),
	price,
	quantity,
});
const exitAt = (hour: number, quantity: string, price = "1.1050") => ({
	kind: ExecutionKind.Exit,
	executedAt: at(hour).toISOString(),
	price,
	quantity,
});
const add = (fill: z.input<typeof executionInputSchema>) =>
	addExecution({ data: { tradeId: 2, expectedRevision: 3, ...fill } });

function givenTrade(
	trade: ReturnType<typeof legacyTrade>,
	fills: object[] = [],
) {
	mocks.rows
		.mockReturnValueOnce([trade])
		.mockReturnValueOnce([ACCOUNT])
		.mockReturnValueOnce(fills);
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.batch.mockImplementation((statements: unknown[]) =>
		Promise.all(statements),
	);
});

describe("first fill on a legacy manual trade", () => {
	it("writes the implicit entry, then the new exit, and the open totals", async () => {
		givenTrade(legacyTrade());

		await add(exitAt(2, "0.4"));

		expect(mocks.values.mock.calls[0][0]).toMatchObject([
			{
				kind: ExecutionKind.Entry,
				price: "1.1000",
				quantity: "1",
				sequence: 1,
			},
			{ kind: ExecutionKind.Exit, quantity: "0.4", realizedPnl: "200.00" },
		]);
		expect(mocks.set.mock.calls[0][0]).toMatchObject({
			executionCount: 2,
			quantity: "1",
			status: TradeStatus.Open,
			netPnl: null,
		});
	});

	it("keeps the fees of a closed trade on its implicit exit", async () => {
		givenTrade({ ...closedTrade("97.00"), fees: "3" });

		await add(entryAt(2));

		const written = mocks.values.mock.calls[0][0];
		expect(written.map((row: { fees: string }) => row.fees)).toEqual([
			"0",
			"0",
			"3",
		]);
		expect(mocks.set.mock.calls[0][0]).toMatchObject({
			executionCount: 3,
			quantity: "2",
			status: TradeStatus.Open,
		});
	});

	it("refuses a closed trade whose saved P&L differs from the replay", async () => {
		givenTrade(closedTrade("100.40"));

		await expect(add(entryAt(2))).rejects.toThrow(
			"The recalculated P&L differs from the saved P&L by $0.40. Edit the trade first.",
		);
		expect(mocks.batch).not.toHaveBeenCalled();
	});

	it.each([{ importHash: "abc" }, { brokerSource: "exness" }])(
		"refuses an imported trade (%o)",
		async (imported) => {
			givenTrade(legacyTrade(imported));

			await expect(add(entryAt(2))).rejects.toThrow(
				"Broker rows cannot get manual fills. Group imported rows instead.",
			);
			expect(mocks.batch).not.toHaveBeenCalled();
		},
	);

	it("reads a legacy closed trade as one entry and one exit with no write", async () => {
		givenTrade(closedTrade());

		const result = await getPositionExecutions({ data: { tradeId: 2 } });

		expect(result.fills.map((fill) => fill.kind)).toEqual([
			ExecutionKind.Entry,
			ExecutionKind.Exit,
		]);
		expect(result.replay).toMatchObject({ ok: true });
		expect(mocks.batch).not.toHaveBeenCalled();
	});
});

describe("invalid fills", () => {
	it("refuses an over-close with the open quantity", async () => {
		givenTrade(legacyTrade());

		await expect(add(exitAt(2, "1.5"))).rejects.toThrow(
			"You can close up to 1.",
		);
		expect(mocks.batch).not.toHaveBeenCalled();
	});

	it("refuses an exit before the first entry", async () => {
		givenTrade(legacyTrade());

		await expect(add(exitAt(0, "0.5"))).rejects.toThrow(
			"An exit cannot come before the first entry.",
		);
		expect(mocks.batch).not.toHaveBeenCalled();
	});

	it("refuses a zero quantity before it reads the trade", async () => {
		await expect(add(exitAt(2, "0"))).rejects.toThrow();
		expect(mocks.rows).not.toHaveBeenCalled();
	});

	it("refuses a stale revision", async () => {
		givenTrade(legacyTrade({ editRevision: 4 }));

		await expect(add(entryAt(2))).rejects.toThrow("Trade changed");
		expect(mocks.batch).not.toHaveBeenCalled();
	});

	it("refuses to delete the last entry fill", async () => {
		givenTrade(legacyTrade({ executionCount: 1 }), [
			{
				id: 9,
				kind: ExecutionKind.Entry,
				executedAt: at(1),
				price: "1.1",
				quantity: "1",
				fees: "0",
				exitQuoteToAccountRate: null,
				sourceTradeId: null,
			},
		]);

		await expect(
			deleteExecution({
				data: { tradeId: 2, executionId: 9, expectedRevision: 3 },
			}),
		).rejects.toThrow("A position needs at least one entry fill.");
		expect(mocks.batch).not.toHaveBeenCalled();
	});
});

describe("updateTrade on a trade with fills", () => {
	const multiFill = () =>
		legacyTrade({ executionCount: 2, quantity: "2", entryPrice: "1.0975" });

	it.each([
		{ quantity: "3" },
		{ entryPrice: "1.2" },
		{ fees: "4" },
		{ exitPrice: "1.2" },
		{ entryDate: at(2).toISOString() },
		{ exitDate: at(6).toISOString() },
		{ status: TradeStatus.Closed },
	])("rejects a change to %o", async (change) => {
		mocks.rows.mockReturnValueOnce([multiFill()]);

		await expect(
			updateTrade({ data: { id: 2, expectedRevision: 3, ...change } }),
		).rejects.toThrow("Edit the fills instead.");
		expect(mocks.set).not.toHaveBeenCalled();
	});

	it("saves annotations when the fill fields are sent unchanged", async () => {
		mocks.rows
			.mockReturnValueOnce([multiFill()])
			.mockReturnValueOnce([ACCOUNT]);

		await updateTrade({
			data: {
				id: 2,
				expectedRevision: 3,
				entryPrice: "1.0975",
				quantity: "2",
				fees: "",
				exitPrice: "",
				mistake: "Late entry",
			},
		});

		expect(mocks.set.mock.calls[0][0]).toMatchObject({ mistake: "Late entry" });
		expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("netPnl");
	});

	it("rejects an execution correction of the original plan", async () => {
		mocks.rows.mockReturnValueOnce([multiFill()]);

		await expect(
			correctTradeInitialRisk({
				data: {
					id: 2,
					expectedRevision: 3,
					reason: "Wrong side",
					correctExecutionInputs: true,
					symbol: "EURUSD",
					side: TradeSide.Short,
					entryDate: at(1).toISOString(),
					entryPrice: "1.0975",
					quantity: "2",
				},
			}),
		).rejects.toThrow("Edit the fills instead.");
		expect(mocks.set).not.toHaveBeenCalled();
	});
});
