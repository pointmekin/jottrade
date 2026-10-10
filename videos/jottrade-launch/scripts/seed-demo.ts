// Adds one fictional "Demo Trader" to the local dev database for the launch video.
// Run from the repository root: npx tsx --env-file=.env videos/jottrade-launch/scripts/seed-demo.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { AccountKind } from "@/lib/account";
import { AccountEntryKind } from "@/lib/account-entry";
import { calculateInstrumentPnL } from "@/lib/finance";
import { PlaybookCriterionKind } from "@/lib/playbook";
import { buildPlaybookCheck, CriterionResult } from "@/lib/playbook-check";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";
import { TagColor } from "@/lib/trade-tag";
import { withClient } from "../../../scripts/db/database";
import { seedPasswordHash } from "../../../scripts/db/seed-data";
import { requireTarget } from "../../../scripts/db/target";

const USER_ID = "demo-trader";
const EMAIL = "demo@jottrade.test";
const CREATED = new Date("2026-06-28T09:00:00Z");

type TradeRow = typeof schema.trades.$inferInsert;

function generator(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const INSTRUMENTS = [
	{
		symbol: "XAUUSD",
		price: 2380,
		drift: 1.6,
		contract: 100,
		digits: 2,
		lots: [0.2, 0.3, 0.5],
	},
	{
		symbol: "EURUSD",
		price: 1.0842,
		drift: 0.0004,
		contract: 100_000,
		digits: 5,
		lots: [0.5, 1, 1.5],
	},
	{
		symbol: "GBPUSD",
		price: 1.2731,
		drift: 0.0005,
		contract: 100_000,
		digits: 5,
		lots: [0.5, 1],
	},
	{
		symbol: "AUDUSD",
		price: 0.6644,
		drift: 0.0003,
		contract: 100_000,
		digits: 5,
		lots: [1, 1.5],
	},
];

type Random = () => number;

function dayTradeCount(random: Random) {
	if (random() < 0.25) return 2;
	return random() < 0.85 ? 1 : 0;
}

function closedTrade(
	random: Random,
	prices: number[],
	index: number,
	date: Date,
	slot: number,
): { row: Omit<TradeRow, "portfolioId">; isWin: boolean } {
	const spec = INSTRUMENTS[index];
	prices[index] += (random() - 0.45) * spec.drift * 6;
	const lots = spec.lots[Math.floor(random() * spec.lots.length)];
	const isWin = random() < (date.getUTCDay() === 5 ? 0.45 : 0.6);
	const targetPnl = isWin ? 70 + random() * 160 : -(70 + random() * 130);
	const side = random() < 0.6 ? TradeSide.Long : TradeSide.Short;
	const direction = side === TradeSide.Long ? 1 : -1;
	const entryPrice = Number(prices[index].toFixed(spec.digits));
	const exitPrice = Number(
		(entryPrice + (direction * targetPnl) / (lots * spec.contract)).toFixed(
			spec.digits,
		),
	);
	const fees = Number((lots * 7).toFixed(2));
	const ymd = date.toISOString().slice(0, 10);
	const hour = 7 + slot * 5 + Math.floor(random() * 3);
	const pnl = calculateInstrumentPnL({
		symbol: spec.symbol,
		accountCurrency: "USD",
		side,
		entryPrice,
		exitPrice,
		quantity: lots,
		feesAccount: fees,
	});
	return {
		isWin,
		row: {
			userId: USER_ID,
			symbol: spec.symbol,
			side,
			status: TradeStatus.Closed,
			entryDate: new Date(`${ymd}T${String(hour).padStart(2, "0")}:15:00Z`),
			exitDate: new Date(`${ymd}T${String(hour + 2).padStart(2, "0")}:40:00Z`),
			entryPrice: String(entryPrice),
			exitPrice: String(exitPrice),
			quantity: String(lots),
			fees: fees.toFixed(2),
			netPnl: pnl.netPnl,
			returnPercent: pnl.returnPercent,
		},
	};
}

function buildTrades(portfolioId: number, strategyIds: number[]): TradeRow[] {
	const random = generator(42);
	const rows: TradeRow[] = [];
	const prices = INSTRUMENTS.map((i) => i.price);
	for (let day = 0; day < 101; day++) {
		const date = new Date(Date.UTC(2026, 6, 1 + day));
		const weekday = date.getUTCDay();
		if (weekday === 0 || weekday === 6) continue;
		const count = dayTradeCount(random);
		for (let slot = 0; slot < count; slot++) {
			const n = rows.length;
			const { row, isWin } = closedTrade(
				random,
				prices,
				n % INSTRUMENTS.length,
				date,
				slot,
			);
			rows.push({
				...row,
				portfolioId,
				setupId: strategyIds[n % strategyIds.length],
				confidence: Object.values(TradeConfidence)[n % 3],
				mistake: !isWin && n % 3 === 0 ? "Chased entry" : null,
			});
		}
	}
	rows.push({
		portfolioId,
		userId: USER_ID,
		symbol: "XAUUSD",
		side: TradeSide.Long,
		status: TradeStatus.Open,
		entryDate: new Date("2026-10-09T13:20:00Z"),
		entryPrice: prices[0].toFixed(2),
		quantity: "0.3",
		setupId: strategyIds[0],
	});
	return rows;
}

const CHECKS_BEFORE = new Date("2026-10-01T00:00:00Z");

/** Older London Breakout trades carry a check; most winners followed the plan. */
function withPlaybookChecks(
	rows: TradeRow[],
	strategy: typeof schema.strategies.$inferSelect,
): TradeRow[] {
	let n = 0;
	return rows.map((row) => {
		if (
			row.setupId !== strategy.id ||
			!row.exitDate ||
			row.entryDate >= CHECKS_BEFORE
		)
			return row;
		n++;
		const isWin = Number(row.netPnl) > 0;
		const isFollowed = isWin ? n % 6 !== 0 : n % 3 === 0;
		const results = Object.fromEntries(
			strategy.criteria.map((c, i) => [
				c.id,
				!isFollowed && i === n % 2
					? CriterionResult.Broke
					: CriterionResult.Followed,
			]),
		);
		return {
			...row,
			playbookCheck: buildPlaybookCheck(strategy, results, row.exitDate),
		};
	});
}

const target = requireTarget();
await withClient(target.url.toString(), async (client) => {
	const db = drizzle(client, { schema });
	await client.query("begin");
	try {
		await db
			.delete(schema.reviewPeriods)
			.where(eq(schema.reviewPeriods.userId, USER_ID));
		await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
		await db.insert(schema.user).values({
			id: USER_ID,
			name: "Demo Trader",
			email: EMAIL,
			emailVerified: true,
			createdAt: CREATED,
			updatedAt: CREATED,
		});
		await db.insert(schema.account).values({
			id: `${USER_ID}-credential`,
			accountId: USER_ID,
			providerId: "credential",
			userId: USER_ID,
			password: seedPasswordHash(EMAIL),
			createdAt: CREATED,
			updatedAt: CREATED,
		});
		const [portfolio] = await db
			.insert(schema.portfolios)
			.values({
				userId: USER_ID,
				name: "Exness Pro",
				kind: AccountKind.Real,
				currency: "USD",
				isDefault: true,
				reviewTimezone: "UTC",
				reviewWeekStartsOn: 1,
				createdAt: CREATED,
			})
			.returning();
		const strategies = await db
			.insert(schema.strategies)
			.values([
				{
					userId: USER_ID,
					name: "London Breakout",
					description: "Trade the break of the Asian range at the London open.",
					criteria: [
						{
							id: "lb-range",
							kind: PlaybookCriterionKind.Entry,
							text: "Price closes outside the Asian range.",
							required: true,
						},
						{
							id: "lb-trend",
							kind: PlaybookCriterionKind.Entry,
							text: "The break agrees with the H4 trend.",
							required: true,
						},
						{
							id: "lb-news",
							kind: PlaybookCriterionKind.Entry,
							text: "No red-folder news in the next hour.",
							required: false,
						},
						{
							id: "lb-fail",
							kind: PlaybookCriterionKind.Invalidation,
							text: "Price closes back inside the range.",
							required: true,
						},
					],
					riskGuidance: "Risk 1% of the account or less.",
				},
				{
					userId: USER_ID,
					name: "Trend Pullback",
					description: "Buy the first pullback to the 20 EMA in a clean trend.",
					criteria: [
						{
							id: "tp-ema",
							kind: PlaybookCriterionKind.Entry,
							text: "Price touches the 20 EMA.",
							required: true,
						},
						{
							id: "tp-structure",
							kind: PlaybookCriterionKind.Entry,
							text: "Higher high and higher low on H1.",
							required: true,
						},
					],
				},
				{
					userId: USER_ID,
					name: "Range Fade",
					description: "Fade the edges of a clear daily range.",
				},
			])
			.returning();
		await db.insert(schema.tags).values([
			{
				userId: USER_ID,
				name: "A+ setup",
				color: TagColor.Teal,
				createdAt: CREATED,
			},
			{
				userId: USER_ID,
				name: "Late entry",
				color: TagColor.Amber,
				createdAt: CREATED,
			},
			{
				userId: USER_ID,
				name: "News",
				color: TagColor.Blue,
				createdAt: CREATED,
			},
		]);
		await db.insert(schema.cashFlows).values({
			userId: USER_ID,
			portfolioId: portfolio.id,
			occurredAt: new Date("2026-07-01T06:00:00Z"),
			createdAt: new Date("2026-07-01T06:00:00Z"),
			amount: "10000.00",
			kind: AccountEntryKind.Deposit,
			note: "Initial funding",
		});
		const rows = withPlaybookChecks(
			buildTrades(
				portfolio.id,
				strategies.map((s) => s.id),
			),
			strategies[0],
		);
		await db.insert(schema.trades).values(rows);
		await client.query("commit");
		const net = rows.reduce((sum, row) => sum + Number(row.netPnl ?? 0), 0);
		process.stdout.write(
			`Seeded ${EMAIL}: ${rows.length} trades, net ${net.toFixed(2)} USD
`,
		);
	} catch (cause) {
		await client.query("rollback");
		throw cause;
	}
});
