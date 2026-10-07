import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tradeConditions } from "@/db/trade-filter";
import { buildArchive } from "@/lib/archive";
import { exportTradesCsv } from "@/server/exportActions";

const mocks = vi.hoisted(() => ({
	user: "user-a",
	requireOwnedPortfolio: vi.fn(),
	tradeWhere: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		let schema: { parse: (data: unknown) => unknown };
		const builder = {
			validator: (value: typeof schema) => {
				schema = value;
				return builder;
			},
			handler:
				(fn: (ctx: { data: unknown }) => unknown) =>
				async (ctx: { data: unknown }) =>
					fn({ data: schema.parse(ctx.data) }),
		};
		return builder;
	},
}));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => mocks.user }));
vi.mock("@/db/portfolios", () => ({
	requireOwnedPortfolio: mocks.requireOwnedPortfolio,
}));
vi.mock("@/db/journal-archive", () => ({ loadArchiveTables: vi.fn() }));
vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					mocks.tradeWhere(condition);
					return Object.assign(Promise.resolve([]), {
						orderBy: async () => [],
					});
				},
			}),
		}),
	},
}));

const sqlOf = (condition: Parameters<PgDialect["sqlToQuery"]>[0]) =>
	new PgDialect().sqlToQuery(condition);

describe("trade export query", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.user = "user-a";
	});

	it("always scopes by user and account", () => {
		const condition = tradeConditions("user-a", { portfolioId: 7 });
		const { sql, params } = sqlOf(condition as never);
		expect(sql).toContain('"user_id"');
		expect(sql).toContain('"portfolio_id"');
		expect(params).toEqual(["user-a", 7]);
	});

	it("applies the same filters as the journal table", () => {
		const { sql, params } = sqlOf(
			tradeConditions("user-a", {
				portfolioId: 7,
				symbol: "EUR",
				status: "CLOSED",
				dateFrom: "2026-10-01T00:00:00.000Z",
			}) as never,
		);
		expect(sql).toContain("like");
		expect(params).toContain("%EUR%");
		expect(params).toContain("CLOSED");
	});

	it("does not query trades when the account belongs to another user", async () => {
		mocks.requireOwnedPortfolio.mockRejectedValue(
			new Error("Account not found."),
		);
		await expect(
			exportTradesCsv({ data: { portfolioId: 99 } } as never),
		).rejects.toThrow("Account not found.");
		expect(mocks.requireOwnedPortfolio).toHaveBeenCalledWith("user-a", 99);
		expect(mocks.tradeWhere).not.toHaveBeenCalled();
	});

	it("filters the export query by the session user", async () => {
		mocks.requireOwnedPortfolio.mockResolvedValue({
			id: 7,
			name: "Main",
			currency: "USD",
		});
		const result = await exportTradesCsv({ data: { portfolioId: 7 } } as never);
		expect(result.rowCount).toBe(0);
		expect(sqlOf(mocks.tradeWhere.mock.calls[0][0]).params).toEqual([
			"user-a",
			7,
		]);
	});
});

describe("buildArchive", () => {
	it("lists attachments by trade and reports counts and version", () => {
		const archive = buildArchive(
			{
				accounts: [{ id: 1 }],
				trades: [
					{ id: 5, screenshots: ["https://x/a.png", "https://x/b.png"] },
					{ id: 6, screenshots: null },
				],
				cashFlows: [],
				strategies: [],
				reviews: [],
				reviewSourceTrades: [],
				reviewSourceCashFlows: [],
			},
			new Date("2026-10-08T00:00:00Z"),
		);
		expect(archive.schemaVersion).toBe(1);
		expect(archive.exportedAt).toBe("2026-10-08T00:00:00.000Z");
		expect(archive.counts).toMatchObject({
			accounts: 1,
			trades: 2,
			attachments: 2,
		});
		expect(archive.attachments[1]).toEqual({
			tradeId: 5,
			url: "https://x/b.png",
		});
	});
});
