import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { tradeConditions } from "@/db/trade-filter";
import { AccountEntryKind } from "@/lib/account-entry";
import {
	analysisScopeSchema,
	isTradeAttributeFiltered,
	toDateRange,
} from "@/lib/analysis-scope";
import { closedTradesInRange, summarizeScope } from "@/lib/analytics";
import { TradeStatus } from "@/lib/trade";

vi.mock("@/db", () => ({ db: {} }));

const FEBRUARY = {
	dateFrom: "2026-02-01T00:00:00.000Z",
	dateTo: "2026-02-28T23:59:59.999Z",
};
const EDGE_TRADE = {
	status: TradeStatus.Closed,
	entryDate: new Date("2026-01-31T22:00:00.000Z"),
	exitDate: new Date("2026-02-01T02:00:00.000Z"),
	netPnl: 40,
};

describe("analysis scope schema", () => {
	it("defaults the timezone to UTC", () => {
		expect(analysisScopeSchema.parse({ portfolioId: 1 }).timeZone).toBe("UTC");
	});

	it("rejects a bound that is not an ISO instant and an unknown timezone", () => {
		expect(
			analysisScopeSchema.safeParse({ portfolioId: 1, dateFrom: "January" })
				.success,
		).toBe(false);
		expect(
			analysisScopeSchema.safeParse({ portfolioId: 1, timeZone: "Mars/Base" })
				.success,
		).toBe(false);
	});

	it("treats the account and the period as no trade attribute filter", () => {
		expect(isTradeAttributeFiltered({ portfolioId: 1, ...FEBRUARY })).toBe(
			false,
		);
		expect(isTradeAttributeFiltered({ portfolioId: 1, confidence: [] })).toBe(
			false,
		);
		expect(isTradeAttributeFiltered({ portfolioId: 1, setupId: "none" })).toBe(
			true,
		);
		expect(isTradeAttributeFiltered({ portfolioId: 1, tagIds: [2] })).toBe(
			true,
		);
	});
});

describe("scope date", () => {
	it("filters the journal by coalesce(exit, entry) with UTC bounds", () => {
		const { sql, params } = new PgDialect().sqlToQuery(
			tradeConditions("user-a", { portfolioId: 7, ...FEBRUARY }) as never,
		);

		expect(sql).toContain(
			'coalesce("trades"."exit_date", "trades"."entry_date") >= $3',
		);
		expect(params).toEqual(["user-a", 7, FEBRUARY.dateFrom, FEBRUARY.dateTo]);
	});

	it("puts a trade opened on 31 Jan and closed on 1 Feb in February", () => {
		const january = toDateRange({
			dateFrom: "2026-01-01T00:00:00.000Z",
			dateTo: "2026-01-31T23:59:59.999Z",
		});

		expect(closedTradesInRange([EDGE_TRADE], january)).toEqual([]);
		expect(
			closedTradesInRange([EDGE_TRADE], toDateRange(FEBRUARY)),
		).toHaveLength(1);
	});
});

describe("summarizeScope", () => {
	const loss = { ...EDGE_TRADE, netPnl: -10 };
	const history = {
		trades: [EDGE_TRADE, loss],
		cashFlows: [
			{
				occurredAt: new Date("2026-01-01T00:00:00.000Z"),
				amount: 1000,
				kind: AccountEntryKind.Deposit,
			},
			{
				occurredAt: new Date("2026-02-03T00:00:00.000Z"),
				amount: -5,
				kind: AccountEntryKind.Adjustment,
			},
		],
	};
	const range = toDateRange(FEBRUARY);

	it("adds adjustments to the P&L without a trade filter", () => {
		const { stats, scope } = summarizeScope(history, undefined, range);

		expect(stats.totalPnL).toBe(25);
		expect(scope).toEqual({ isFiltered: false, excludedAdjustments: 0 });
	});

	it("reads only matching trades and keeps the balance account-wide under a filter", () => {
		const { stats, scope, equityCurve } = summarizeScope(
			history,
			[EDGE_TRADE],
			range,
		);

		expect(stats).toMatchObject({
			totalTrades: 1,
			totalPnL: 40,
			winRate: 100,
			openingBalance: 1000,
			totalBalance: 1025,
		});
		expect(equityCurve.at(-1)?.balance).toBe(1025);
		expect(scope).toEqual({ isFiltered: true, excludedAdjustments: 1 });
	});
});
