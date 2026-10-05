import type { trades } from "@/db/schema";
import { calculateInstrumentPnL } from "@/lib/finance";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";
import { at, CURRENCY, OWNER } from "./seed-accounts";

type TradeRow = typeof trades.$inferInsert;

/** Mulberry32: a small seeded generator, so "random" trades never change. */
function generator(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type TradeSpec = {
	portfolioId: number;
	symbol: string;
	side: TradeSide;
	entry: string;
	exit?: string;
	entryPrice: number;
	exitPrice?: number;
	quantity: number;
	fees?: number;
	status?: TradeStatus;
	setupId?: number | null;
	extra?: Partial<TradeRow>;
};

function toTrade(spec: TradeSpec): TradeRow {
	const fees = spec.fees ?? 0;
	const closed = spec.exitPrice !== undefined && spec.exit !== undefined;
	const pnl = closed
		? calculateInstrumentPnL({
				symbol: spec.symbol,
				accountCurrency: CURRENCY[spec.portfolioId],
				side: spec.side,
				entryPrice: spec.entryPrice,
				exitPrice: spec.exitPrice as number,
				quantity: spec.quantity,
				feesAccount: fees,
			})
		: undefined;
	return {
		portfolioId: spec.portfolioId,
		userId: OWNER[spec.portfolioId],
		symbol: spec.symbol,
		side: spec.side,
		status: spec.status ?? (closed ? TradeStatus.Closed : TradeStatus.Open),
		entryDate: at(spec.entry),
		exitDate: spec.exit ? at(spec.exit) : null,
		entryPrice: String(spec.entryPrice),
		exitPrice: closed ? String(spec.exitPrice) : null,
		quantity: String(spec.quantity),
		fees: fees.toFixed(2),
		netPnl: pnl?.netPnl ?? null,
		returnPercent: pnl?.returnPercent ?? null,
		setupId: spec.setupId ?? null,
		...spec.extra,
	};
}

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY", "TSLA"];
const CONFIDENCE = Object.values(TradeConfidence);
const MISTAKES = [null, null, null, "Moved stop", "Chased entry", "Oversized"];

/** Six weeks of ordinary trades, one each weekday from 5 January 2026. */
function generatedTrades(): TradeSpec[] {
	const random = generator(29);
	const specs: TradeSpec[] = [];
	for (let day = 0; day < 42; day++) {
		const date = new Date(Date.UTC(2026, 0, 5 + day));
		if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
		const ymd = date.toISOString().slice(0, 10);
		const entryPrice = Math.round((50 + random() * 400) * 100) / 100;
		const move = (random() * 9 - 4) / 100;
		const n = specs.length;
		specs.push({
			portfolioId: 1,
			symbol: SYMBOLS[n % SYMBOLS.length],
			side: random() < 0.7 ? TradeSide.Long : TradeSide.Short,
			entry: `${ymd}T14:${String(30 + (n % 20)).padStart(2, "0")}:00`,
			exit: `${ymd}T19:${String(n % 60).padStart(2, "0")}:00`,
			entryPrice,
			exitPrice: Math.round(entryPrice * (1 + move) * 100) / 100,
			quantity: 1 + Math.floor(random() * 100),
			fees: Math.round(random() * 500) / 100,
			setupId: [1, 2, null][n % 3],
			extra: {
				confidence: CONFIDENCE[n % CONFIDENCE.length],
				mistake: MISTAKES[n % MISTAKES.length],
				notes: n % 4 === 0 ? `Seeded trade ${n + 1}.` : null,
			},
		});
	}
	return specs;
}

/** Each row is a case a reviewer would otherwise build by hand. */
const EDGE_TRADES: TradeSpec[] = [
	{
		portfolioId: 1,
		symbol: "SPY",
		side: TradeSide.Long,
		entry: "2026-03-02T15:00:00",
		exit: "2026-03-02T16:00:00",
		entryPrice: 500,
		exitPrice: 500,
		quantity: 10,
		extra: { notes: "Breakeven: zero P&L, zero fees." },
	},
	{
		portfolioId: 1,
		symbol: "NVDA",
		side: TradeSide.Long,
		entry: "2026-03-20T14:30:00",
		entryPrice: 120.5,
		quantity: 15,
		setupId: 1,
		extra: { notes: "Still open: no exit." },
	},
	{
		portfolioId: 1,
		symbol: "MSFT",
		side: TradeSide.Short,
		entry: "2026-03-23T14:30:00",
		entryPrice: 410,
		quantity: 5,
		status: TradeStatus.Pending,
		extra: { notes: "Pending order." },
	},
	{
		portfolioId: 1,
		symbol: "AAPL",
		side: TradeSide.Long,
		entry: "2026-03-06T20:00:00",
		exit: "2026-03-09T14:00:00",
		entryPrice: 230,
		exitPrice: 236.4,
		quantity: 20,
		fees: 1.5,
		extra: { notes: "Held over the US DST change on 8 March." },
	},
	{
		portfolioId: 1,
		symbol: "TSLA",
		side: TradeSide.Short,
		entry: "2024-02-29T15:00:00",
		exit: "2024-02-29T18:00:00",
		entryPrice: 200,
		exitPrice: 190,
		quantity: 3,
		extra: { notes: "Leap day, two years before the rest." },
	},
	{
		portfolioId: 1,
		symbol: "PENNY",
		side: TradeSide.Long,
		entry: "2026-03-10T15:00:00",
		exit: "2026-03-11T15:00:00",
		entryPrice: 0.0001,
		exitPrice: 0.00015,
		quantity: 1_000_000,
		extra: { notes: "Sub-cent price, large quantity." },
	},
	{
		portfolioId: 1,
		symbol: "VERYLONGSYMBOLNAME.EXCHANGE",
		side: TradeSide.Long,
		entry: "2026-03-12T15:00:00",
		exit: "2026-03-12T16:00:00",
		entryPrice: 12.34,
		exitPrice: 12.3,
		quantity: 7,
		fees: 0.07,
		extra: { notes: "บันทึก 📈 — naïve café; long symbol, unicode notes." },
	},
	{
		portfolioId: 1,
		symbol: "AAPL",
		side: TradeSide.Long,
		entry: "2026-03-13T15:00:00",
		exit: "2026-03-13T17:00:00",
		entryPrice: 231,
		exitPrice: 233,
		quantity: 10,
		fees: 0.7,
		extra: {
			importHash: "seed-import-0001",
			brokerSource: "seed-broker",
			brokerTicket: "T-0001",
			brokerProfit: "20.00",
			brokerCommission: "-0.70",
			brokerSwap: "0.00",
			brokerCloseReason: "TP",
		},
	},
	{
		portfolioId: 2,
		symbol: "XAUUSD",
		side: TradeSide.Long,
		entry: "2026-02-02T08:00:00",
		exit: "2026-02-02T09:00:00",
		entryPrice: 2050,
		exitPrice: 2040,
		quantity: 1,
		fees: 7,
	},
	{
		portfolioId: 2,
		symbol: "XAUUSD",
		side: TradeSide.Short,
		entry: "2026-02-03T08:00:00",
		exit: "2026-02-03T09:00:00",
		entryPrice: 2040,
		exitPrice: 2049.5,
		quantity: 1,
		fees: 7,
	},
	{
		portfolioId: 2,
		symbol: "EURUSD",
		side: TradeSide.Long,
		entry: "2026-02-04T08:00:00",
		exit: "2026-02-04T12:00:00",
		entryPrice: 1.085,
		exitPrice: 1.081,
		quantity: 2,
		fees: 14,
		extra: { mistake: "Revenge trade" },
	},
	{
		portfolioId: 2,
		symbol: "EURUSD",
		side: TradeSide.Short,
		entry: "2026-02-05T08:00:00",
		exit: "2026-02-05T20:00:00",
		entryPrice: 1.079,
		exitPrice: 1.1,
		quantity: 5,
		fees: 35,
		extra: { mistake: "No stop", notes: "The account-breaking loss." },
	},
	{
		portfolioId: 3,
		symbol: "EURUSD",
		side: TradeSide.Long,
		entry: "2026-01-12T07:00:00",
		exit: "2026-01-16T15:00:00",
		entryPrice: 1.091,
		exitPrice: 1.0985,
		quantity: 0.5,
		fees: 3.5,
		setupId: 2,
	},
	{
		portfolioId: 3,
		symbol: "EURGBP",
		side: TradeSide.Short,
		entry: "2026-01-19T07:00:00",
		exit: "2026-01-23T15:00:00",
		entryPrice: 0.861,
		exitPrice: 0.8575,
		quantity: 0.3,
		fees: 2.1,
		setupId: 1,
	},
	{
		portfolioId: 3,
		symbol: "EURUSD",
		side: TradeSide.Short,
		entry: "2026-01-26T07:00:00",
		exit: "2026-01-30T15:00:00",
		entryPrice: 1.1,
		exitPrice: 1.104,
		quantity: 0.5,
		fees: 3.5,
	},
	{
		portfolioId: 4,
		symbol: "SPY",
		side: TradeSide.Long,
		entry: "2026-02-09T15:00:00",
		exit: "2026-02-10T15:00:00",
		entryPrice: 505,
		exitPrice: 509.2,
		quantity: 4,
		fees: 1,
		setupId: 4,
	},
	{
		portfolioId: 4,
		symbol: "QQQ",
		side: TradeSide.Short,
		entry: "2026-02-11T15:00:00",
		exit: "2026-02-11T19:00:00",
		entryPrice: 440,
		exitPrice: 443,
		quantity: 6,
		fees: 1,
	},
	{
		portfolioId: 5,
		symbol: "BTCUSD",
		side: TradeSide.Long,
		entry: "2026-02-14T00:00:00",
		exit: "2026-02-15T23:59:59",
		entryPrice: 61000,
		exitPrice: 63500,
		quantity: 0.00012,
		fees: 0.25,
	},
	{
		portfolioId: 5,
		symbol: "BTCUSD",
		side: TradeSide.Short,
		entry: "2026-02-20T23:30:00",
		exit: "2026-02-21T00:30:00",
		entryPrice: 64000,
		exitPrice: 64010,
		quantity: 0.05,
		fees: 3,
	},
];

export function seedTrades(): TradeRow[] {
	return [...generatedTrades(), ...EDGE_TRADES].map(toTrade);
}
