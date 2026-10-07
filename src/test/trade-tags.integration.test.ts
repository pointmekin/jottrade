import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Pool } from "pg";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { BULK_EDIT_STALE_MESSAGE } from "@/db/trade-bulk-edit";
import { ImportKind } from "@/lib/import-batch";
import { TradeConfidence } from "@/lib/trade";
import {
	BulkTradeAction,
	type BulkTradeChange,
	TagMatch,
} from "@/lib/trade-tag";
import { getTrades } from "@/server/getTrades";
import {
	commitImport,
	stageImport,
	undoImportBatch,
} from "@/server/importActions";
import {
	bulkEditTrades,
	createTag,
	deleteTag,
	updateTag,
} from "@/server/tagActions";
import { checkTarget } from "../../scripts/db/target";
import {
	resetIntegrationDatabase,
	transportPool,
} from "./feature-integration-fixture";
import { tradeCsv } from "./import-sql-fixture";

const transport = vi.hoisted(() => ({
	query: vi.fn(),
	transaction: vi.fn(),
	userId: "fixture-user",
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
vi.mock("@/lib/auth", () => ({ requireUserId: async () => transport.userId }));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		let schema: { parse: (data: unknown) => unknown } | undefined;
		const builder = {
			validator: (value: typeof schema) => {
				schema = value;
				return builder;
			},
			handler:
				(handler: (context: { data: unknown }) => unknown) =>
				(context: { data: unknown } = { data: undefined }) =>
					handler({ data: schema ? schema.parse(context.data) : undefined }),
		};
		return builder;
	},
}));

/** A local jottrade_test_* database: `npm run db:reset` rules, and the tests drop its schema. */
const url = process.env.TAGS_TEST_DATABASE_URL;
function requireDisposable(value: string) {
	const target = checkTarget({ DATABASE_URL: value });
	if (!target.ok || !target.database.startsWith("jottrade_test_"))
		throw new Error(
			"TAGS_TEST_DATABASE_URL must be a local jottrade_test_* database.",
		);
	return value;
}

const OWNER = "fixture-user";
const OTHER = "other-user";

describe.skipIf(!url)("trade tags on migrated PostgreSQL", () => {
	let pool: Pool;
	const rows = async (text: string, values: unknown[] = []) =>
		(await pool.query(text, values)).rows;
	const insertTrade = async (userId: string, portfolioId: number) =>
		(
			await rows(
				"insert into trades(user_id,portfolio_id,symbol,side,entry_date) values($1,$2,'EURUSD','LONG','2026-09-01') returning id",
				[userId, portfolioId],
			)
		)[0].id as number;
	const insertTag = async (userId: string, name: string) =>
		(
			await rows("insert into tags(user_id,name) values($1,$2) returning id", [
				userId,
				name,
			])
		)[0].id as number;
	const tagLinks = () =>
		rows("select trade_id, tag_id from trade_tags order by trade_id, tag_id");
	const bulk = (tradeIds: number[], change: BulkTradeChange) =>
		bulkEditTrades({ data: { portfolioId: 1, tradeIds, change } });

	beforeAll(() => {
		pool = transportPool(transport, requireDisposable(url ?? ""));
	});
	beforeEach(async () => {
		transport.userId = OWNER;
		await resetIntegrationDatabase(pool);
	});
	afterAll(async () => {
		await pool?.end();
	});

	describe("ownership", () => {
		it("refuses another user's trade", async () => {
			const foreign = await insertTrade(OTHER, 3);
			const tag = await insertTag(OWNER, "FOMO");
			await expect(
				bulk([foreign], { action: BulkTradeAction.AddTags, tagIds: [tag] }),
			).rejects.toThrow(
				"1 of 1 selected trades were deleted or are not in this account",
			);
			expect(await tagLinks()).toEqual([]);
		});

		it("changes nothing when a list mixes owned and foreign trades", async () => {
			const own = await insertTrade(OWNER, 1);
			const foreign = await insertTrade(OTHER, 3);
			const tag = await insertTag(OWNER, "FOMO");
			await expect(
				bulk([own, foreign], {
					action: BulkTradeAction.AddTags,
					tagIds: [tag],
				}),
			).rejects.toThrow("Nothing was changed");
			await expect(
				bulk([own, foreign], {
					action: BulkTradeAction.SetConfidence,
					confidence: TradeConfidence.Low,
				}),
			).rejects.toThrow("Nothing was changed");
			expect(await tagLinks()).toEqual([]);
			expect(
				await rows("select confidence, edit_revision from trades where id=$1", [
					own,
				]),
			).toEqual([{ confidence: null, edit_revision: 0 }]);
		});

		it("refuses a trade from the user's other account", async () => {
			const otherAccount = await insertTrade(OWNER, 2);
			await expect(
				bulk([otherAccount], { action: BulkTradeAction.MarkReviewed }),
			).rejects.toThrow("are not in this account");
		});

		it("refuses another user's tag and strategy", async () => {
			const own = await insertTrade(OWNER, 1);
			const foreignTag = await insertTag(OTHER, "Theirs");
			const [{ id: foreignStrategy }] = await rows(
				"insert into strategies(user_id,name) values($1,'Theirs') returning id",
				[OTHER],
			);
			await expect(
				bulk([own], { action: BulkTradeAction.AddTags, tagIds: [foreignTag] }),
			).rejects.toThrow("tag no longer exists");
			await expect(
				bulk([own], {
					action: BulkTradeAction.SetStrategy,
					setupId: foreignStrategy,
				}),
			).rejects.toThrow("strategy no longer exists");
			expect(await tagLinks()).toEqual([]);
		});

		it("does not rename or delete another user's tag", async () => {
			const foreign = await insertTag(OTHER, "Theirs");
			await expect(
				updateTag({ data: { id: foreign, name: "Mine" } }),
			).rejects.toThrow("Tag not found");
			await expect(deleteTag({ data: { id: foreign } })).rejects.toThrow(
				"Tag not found",
			);
			expect(await rows("select name from tags")).toEqual([{ name: "Theirs" }]);
		});
	});

	it("rolls back the whole statement when a selected trade disappears after the check", async () => {
		const first = await insertTrade(OWNER, 1);
		const second = await insertTrade(OWNER, 1);
		const tag = await insertTag(OWNER, "FOMO");
		const query = transport.query.getMockImplementation();
		transport.query.mockImplementation((text: string, ...rest: unknown[]) => {
			const request = query?.(text, ...rest);
			if (!text.startsWith("WITH owned")) return request;
			return {
				...request,
				execute: async (client: unknown) => {
					await pool.query("delete from trades where id=$1", [second]);
					return request.execute(client);
				},
			};
		});
		try {
			await expect(
				bulk([first, second], {
					action: BulkTradeAction.AddTags,
					tagIds: [tag],
				}),
			).rejects.toThrow(BULK_EDIT_STALE_MESSAGE);
		} finally {
			transport.query.mockImplementation(query as never);
		}
		expect(await tagLinks()).toEqual([]);
		expect(
			await rows("select edit_revision from trades where id=$1", [first]),
		).toEqual([{ edit_revision: 0 }]);
	});

	it("adds and removes tags, counts only real changes, and bumps the edit revision", async () => {
		const first = await insertTrade(OWNER, 1);
		const second = await insertTrade(OWNER, 1);
		const fomo = await insertTag(OWNER, "FOMO");
		const news = await insertTag(OWNER, "News");
		await bulk([first], { action: BulkTradeAction.AddTags, tagIds: [fomo] });
		expect(
			await bulk([first, second], {
				action: BulkTradeAction.AddTags,
				tagIds: [fomo, news],
			}),
		).toEqual({ selected: 2, changed: 2 });
		expect(await tagLinks()).toHaveLength(4);
		expect(
			await bulk([first, second], {
				action: BulkTradeAction.RemoveTags,
				tagIds: [news],
			}),
		).toEqual({ selected: 2, changed: 2 });
		expect(
			await bulk([first], {
				action: BulkTradeAction.RemoveTags,
				tagIds: [news],
			}),
		).toEqual({ selected: 1, changed: 0 });
		expect(
			await rows("select id, edit_revision from trades order by id"),
		).toEqual([
			{ id: first, edit_revision: 3 },
			{ id: second, edit_revision: 2 },
		]);
	});

	it("marks trades reviewed once and sets strategy and confidence", async () => {
		const trade = await insertTrade(OWNER, 1);
		expect(
			await bulk([trade], { action: BulkTradeAction.MarkReviewed }),
		).toEqual({ selected: 1, changed: 1 });
		expect(
			await bulk([trade], { action: BulkTradeAction.MarkReviewed }),
		).toEqual({ selected: 1, changed: 0 });
		const [{ id: strategy }] = await rows(
			"insert into strategies(user_id,name) values($1,'Breakout') returning id",
			[OWNER],
		);
		await bulk([trade], {
			action: BulkTradeAction.SetStrategy,
			setupId: strategy,
		});
		await bulk([trade], {
			action: BulkTradeAction.SetConfidence,
			confidence: TradeConfidence.High,
		});
		const [row] = await rows("select * from trades where id=$1", [trade]);
		expect(row).toMatchObject({
			setup_id: strategy,
			confidence: TradeConfidence.High,
			annotation_revision: 1,
		});
		expect(row.reviewed_at).not.toBeNull();
		expect(row.reviewed_execution_fingerprint).toMatch(/^review-v2:/);
	});

	it("treats tag names case-insensitively per user", async () => {
		const created = await createTag({ data: { name: "  Late   entry " } });
		expect(created.name).toBe("Late entry");
		expect((await createTag({ data: { name: "LATE ENTRY" } })).id).toBe(
			created.id,
		);
		const other = await createTag({ data: { name: "Early exit" } });
		await expect(
			updateTag({ data: { id: other.id, name: "late entry" } }),
		).rejects.toThrow("already exists");
		transport.userId = OTHER;
		expect((await createTag({ data: { name: "Late entry" } })).id).not.toBe(
			created.id,
		);
	});

	it("filters the journal by any or all tags and returns each trade's tags", async () => {
		const both = await insertTrade(OWNER, 1);
		const onlyFomo = await insertTrade(OWNER, 1);
		await insertTrade(OWNER, 1);
		const fomo = await insertTag(OWNER, "FOMO");
		const news = await insertTag(OWNER, "News");
		await bulk([both, onlyFomo], {
			action: BulkTradeAction.AddTags,
			tagIds: [fomo],
		});
		await bulk([both], { action: BulkTradeAction.AddTags, tagIds: [news] });
		const ids = async (tagMatch: TagMatch) =>
			(
				await getTrades({
					data: { portfolioId: 1, tagIds: [fomo, news], tagMatch },
				})
			).trades
				.map((trade) => trade.id)
				.sort((a, b) => a - b);
		expect(await ids(TagMatch.Any)).toEqual([both, onlyFomo]);
		expect(await ids(TagMatch.All)).toEqual([both]);
		const page = await getTrades({ data: { portfolioId: 1 } });
		expect(page.trades.find((trade) => trade.id === both)?.tags).toEqual([
			{ id: fomo, name: "FOMO", color: "gray" },
			{ id: news, name: "News", color: "gray" },
		]);
	});

	it("deleting a tag removes it from trades and keeps the trades", async () => {
		const trade = await insertTrade(OWNER, 1);
		const tag = await insertTag(OWNER, "FOMO");
		await bulk([trade], { action: BulkTradeAction.AddTags, tagIds: [tag] });
		await deleteTag({ data: { id: tag } });
		expect(await tagLinks()).toEqual([]);
		expect(await rows("select id from trades")).toEqual([{ id: trade }]);
	});

	it("protects an imported trade from undo after the user tags it", async () => {
		const batch = await stageImport({
			data: {
				portfolioId: 1,
				kind: ImportKind.Trades,
				csv: tradeCsv,
				fileName: "synthetic.csv",
				sourceCurrency: "USD",
			},
		});
		const committed = await commitImport({
			data: { batchId: batch.id, revision: batch.revision, decisions: [] },
		});
		const [{ id }] = await rows("select id from trades");
		const tag = await insertTag(OWNER, "Imported");
		await bulk([id], { action: BulkTradeAction.AddTags, tagIds: [tag] });
		const undone = await undoImportBatch({ data: { batchId: committed.id } });
		expect(undone.state).toBe("partially-undone");
		expect(undone.outcomes[0].undoState).toBe("protected");
		expect(await tagLinks()).toEqual([{ trade_id: id, tag_id: tag }]);
	});
});
