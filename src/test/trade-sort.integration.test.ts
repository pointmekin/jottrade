import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Trade } from "@/lib/trade";
import {
	SortDirection,
	type TradeSort,
	TradeSortField,
} from "@/lib/trade-sort";
import { exportTradesCsv } from "@/server/exportActions";
import { getTradeIds, getTrades } from "@/server/getTrades";
import { checkTarget } from "../../scripts/db/target";
import {
	resetIntegrationDatabase,
	transportPool,
} from "./feature-integration-fixture";

const transport = vi.hoisted(() => ({
	query: vi.fn(),
	transaction: vi.fn(),
}));
vi.mock("@/db", async () => {
	const { drizzle } = await import("drizzle-orm/neon-http");
	const schema = await import("@/db/schema");
	return {
		db: drizzle(transport as unknown as NeonQueryFunction<false, false>, {
			schema,
		}),
	};
});
vi.mock("@/lib/auth", () => ({ requireUserId: async () => "fixture-user" }));
vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));

/** A local jottrade_test_* database: `npm run db:reset` rules, and the tests drop its schema. */
const url = process.env.SORT_TEST_DATABASE_URL;
function requireDisposable(value: string) {
	const target = checkTarget({ DATABASE_URL: value });
	if (!target.ok || !target.database.startsWith("jottrade_test_"))
		throw new Error(
			"SORT_TEST_DATABASE_URL must be a local jottrade_test_* database.",
		);
	return value;
}

const TRADE_COUNT = 120;

/** Every trade has the same timestamps, and P&L, return and symbol repeat, so only the id can break ties. */
const SEED_TRADES = `
insert into trades(user_id,portfolio_id,symbol,side,status,entry_date,exit_date,net_pnl,return_percent)
select 'fixture-user', 1, (array['AAA','BBB','CCC'])[1 + i % 3], 'LONG',
	case when i % 6 = 0 then 'OPEN' else 'CLOSED' end,
	'2026-02-10 10:00:00',
	case when i % 6 = 0 then null else timestamp '2026-02-10 12:00:00' end,
	case when i % 6 = 0 then null else (i % 5) * 10 end,
	case when i % 4 = 0 then null else i % 3 end
from generate_series(1, ${TRADE_COUNT}) i;
insert into trades(user_id,portfolio_id,symbol,side,status,entry_date,net_pnl)
values('other-user', 3, 'AAA', 'LONG', 'CLOSED', '2026-02-10 10:00:00', 999);`;

const SORTS: TradeSort[] = Object.values(TradeSortField).flatMap((sort) =>
	Object.values(SortDirection).map((dir) => ({ sort, dir })),
);

function sortValue(trade: Trade, sort: TradeSortField) {
	if (sort === TradeSortField.Symbol) return trade.symbol;
	if (sort === TradeSortField.NetPnl)
		return trade.netPnl === null ? null : Number(trade.netPnl);
	if (sort === TradeSortField.ReturnPercent)
		return trade.returnPercent === null ? null : Number(trade.returnPercent);
	const date =
		sort === TradeSortField.ScopeDate && trade.status === "CLOSED"
			? (trade.exitDate ?? trade.entryDate)
			: trade.entryDate;
	return new Date(date).getTime();
}

/** The expected order: nulls last in both directions, then the id in the same direction. */
function expectedIds(rows: Trade[], { sort, dir }: TradeSort) {
	const sign = dir === SortDirection.Asc ? 1 : -1;
	return [...rows]
		.sort((a, b) => {
			const left = sortValue(a, sort);
			const right = sortValue(b, sort);
			if (left === null || right === null)
				return (left === null ? 1 : 0) - (right === null ? 1 : 0);
			if (left !== right) return (left < right ? -1 : 1) * sign;
			return (a.id - b.id) * sign;
		})
		.map((trade) => trade.id);
}

describe.skipIf(!url)("server sort on migrated PostgreSQL", () => {
	let pool: Pool;

	async function allPages(order: TradeSort) {
		const rows: Trade[] = [];
		for (let page = 1; ; page++) {
			const result = await getTrades({
				data: { portfolioId: 1, ...order, page },
			});
			rows.push(...result.trades);
			if (page * result.pageSize >= result.total) return rows;
		}
	}

	beforeAll(async () => {
		pool = transportPool(transport, requireDisposable(url ?? ""));
		await resetIntegrationDatabase(pool);
		await pool.query(SEED_TRADES);
	});
	afterAll(async () => {
		await pool?.end();
	});

	it.each(SORTS)(
		"pages through every row exactly once: $sort $dir",
		async (order) => {
			const rows = await allPages(order);
			const ids = rows.map((trade) => trade.id);

			expect(ids).toHaveLength(TRADE_COUNT);
			expect(new Set(ids).size).toBe(TRADE_COUNT);
			expect(ids).toEqual(expectedIds(rows, order));
			expect(await getTradeIds({ data: { portfolioId: 1, ...order } })).toEqual(
				ids,
			);
		},
	);

	it("puts null P&L last in both directions", async () => {
		for (const dir of Object.values(SortDirection)) {
			const rows = await allPages({ sort: TradeSortField.NetPnl, dir });
			const firstNull = rows.findIndex((trade) => trade.netPnl === null);
			expect(firstNull).toBeGreaterThan(0);
			expect(rows.slice(firstNull).every((t) => t.netPnl === null)).toBe(true);
		}
	});

	it("exports the trades in the same order as the journal", async () => {
		const order = { sort: TradeSortField.NetPnl, dir: SortDirection.Desc };
		const [rows, file] = await Promise.all([
			allPages(order),
			exportTradesCsv({ data: { portfolioId: 1, ...order } }),
		]);
		const exportedIds = file.csv
			.split("\r\n")
			.slice(1)
			.map((line) => Number(line.split(",")[0]));

		expect(exportedIds).toEqual(rows.map((trade) => trade.id));
	});
});
