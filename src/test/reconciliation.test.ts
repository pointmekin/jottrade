import { describe, expect, it } from "vitest";
import {
	type ReconcileTrade,
	reconcileAccount,
	type SqlTotals,
} from "@/lib/reconciliation";

const trade = (
	setupId: number | null,
	netPnl: number,
	overrides: Partial<ReconcileTrade> = {},
): ReconcileTrade => ({
	status: "CLOSED",
	entryDate: new Date("2025-01-06T09:00:00Z"),
	exitDate: new Date("2025-01-06T15:00:00Z"),
	netPnl,
	setupId,
	side: "LONG",
	entryPrice: 100,
	exitPrice: 101,
	returnPercent: 1,
	...overrides,
});

const trades = [
	trade(1, 120),
	trade(1, -40),
	trade(2, 0),
	trade(null, 55.5, { exitDate: null }),
	trade(1, 300, { status: "OPEN", exitDate: null }),
];
const flows = [
	{ occurredAt: new Date("2025-01-01T00:00:00Z"), amount: 5000 },
	{
		occurredAt: new Date("2025-01-07T00:00:00Z"),
		amount: -12.25,
		kind: "ADJUSTMENT",
	},
];
const sql: SqlTotals = {
	strategies: [
		{ setupId: 1, count: 2, pnl: 80 },
		{ setupId: 2, count: 1, pnl: 0 },
		{ setupId: null, count: 1, pnl: 55.5 },
	],
	cashFlowTotal: 4987.75,
	positions: [],
};

describe("reconcileAccount", () => {
	it("finds no discrepancy when every screen agrees with the database", () => {
		expect(reconcileAccount(trades, flows, sql)).toEqual({
			closedTrades: 4,
			positions: { total: 0, matching: 0 },
			discrepancies: [],
			legacyReturnRows: 0,
		});
	});

	it("reports a strategy total that differs from the database", () => {
		const drifted: SqlTotals = {
			...sql,
			strategies: [
				{ ...sql.strategies[0], count: 3 },
				...sql.strategies.slice(1),
			],
		};
		const { discrepancies } = reconcileAccount(trades, flows, drifted);
		expect(discrepancies.map((d) => d.check)).toEqual([
			"headline-count",
			"strategy-count",
		]);
	});

	it("reports a headline balance that differs from the database", () => {
		const { discrepancies } = reconcileAccount(trades, flows, {
			...sql,
			cashFlowTotal: 5000,
		});
		expect(discrepancies.map((d) => d.check)).toEqual(["headline-balance"]);
	});

	it("counts closed trades that still store a notional return", () => {
		const legacy = trade(2, 50, { returnPercent: 0.05 });
		const { legacyReturnRows, discrepancies } = reconcileAccount(
			[...trades, legacy],
			flows,
			{
				...sql,
				strategies: [
					sql.strategies[0],
					{ setupId: 2, count: 2, pnl: 50 },
					sql.strategies[2],
				],
			},
		);
		expect(legacyReturnRows).toBe(1);
		expect(discrepancies).toEqual([]);
	});

	describe("positions with fills", () => {
		const position = {
			tradeId: 9,
			status: "CLOSED",
			netPnl: 100,
			executionCount: 4,
			fillCount: 4,
			exitPnl: 100,
		};
		const partial = {
			...position,
			tradeId: 10,
			status: "OPEN",
			netPnl: null,
			executionCount: 2,
			fillCount: 2,
			exitPnl: 40,
		};
		const openWithExit = trade(1, 0, {
			status: "OPEN",
			exitDate: null,
			realizations: [{ at: new Date("2025-01-06T12:00:00Z"), amount: 40 }],
		});

		it("adds the partial exits of open positions to the balance", () => {
			const result = reconcileAccount([...trades, openWithExit], flows, {
				...sql,
				positions: [position, partial],
			});
			expect(result.positions).toEqual({ total: 2, matching: 2 });
			expect(result.discrepancies).toEqual([]);
		});

		it("reports fill rows that do not match the stored totals", () => {
			const { positions, discrepancies } = reconcileAccount(
				[...trades, openWithExit],
				flows,
				{
					...sql,
					positions: [
						{ ...position, exitPnl: 100.01 },
						{ ...partial, fillCount: 1 },
					],
				},
			);
			expect(positions).toEqual({ total: 2, matching: 0 });
			expect(discrepancies.map((d) => d.check)).toEqual([
				"position-fills",
				"position-fills",
			]);
		});
	});
});
