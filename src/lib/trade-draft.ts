import { z } from "zod";
import type { DraftStorage } from "./review-autosave";
import { TradeSide } from "./trade";
import { RiskCaptureSource } from "./trade-risk-schema";

export const TRADE_DRAFT_PREFIX = "jottrade.trade-draft.v1:";
export const TRADE_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const TRADE_DRAFT_SAVE_DELAY_MS = 500;

// A draft keeps partial input, so the text fields are not validated as prices here.
const draftText = z.string().max(20_000).optional();
const tradeDraftSchema = z.object({
	v: z.literal(1),
	draftId: z.uuid(),
	savedAt: z.iso.datetime(),
	values: z.object({
		symbol: draftText,
		side: z.enum(TradeSide).optional(),
		entryDate: draftText,
		entryPrice: draftText,
		quantity: draftText,
		targetPrice: draftText.nullable(),
		initialStopPrice: draftText,
		entryQuoteToAccountRate: draftText,
		balanceAccount: draftText,
		confirmedUnitQuoteCurrency: draftText,
		captureSource: z.enum(RiskCaptureSource).optional(),
		exitPrice: draftText,
		exitDate: draftText,
		exitQuoteToAccountRate: draftText,
		fees: draftText,
		notes: draftText,
		ruleNote: draftText,
		setupId: z.number().int().positive().nullable().optional(),
	}),
});
export type TradeDraft = z.infer<typeof tradeDraftSchema>;
export type TradeDraftValues = TradeDraft["values"];

export const TradeDraftStatus = {
	None: "none",
	Ready: "ready",
	Unreadable: "unreadable",
} as const;
export type StoredTradeDraft =
	| { status: typeof TradeDraftStatus.None }
	| { status: typeof TradeDraftStatus.Ready; draft: TradeDraft }
	| { status: typeof TradeDraftStatus.Unreadable };

export function tradeDraftKey(userId: string, portfolioId: number): string {
	return `${TRADE_DRAFT_PREFIX}${encodeURIComponent(userId)}:${portfolioId}`;
}

export function readTradeDraft(
	storage: DraftStorage,
	key: string,
	now = Date.now(),
): StoredTradeDraft {
	const text = storage.getItem(key);
	if (text === null) return { status: TradeDraftStatus.None };
	let parsed: ReturnType<typeof tradeDraftSchema.safeParse>;
	try {
		parsed = tradeDraftSchema.safeParse(JSON.parse(text));
	} catch {
		return { status: TradeDraftStatus.Unreadable };
	}
	if (!parsed.success) return { status: TradeDraftStatus.Unreadable };
	if (now - Date.parse(parsed.data.savedAt) > TRADE_DRAFT_MAX_AGE_MS) {
		storage.removeItem(key);
		return { status: TradeDraftStatus.None };
	}
	return { status: TradeDraftStatus.Ready, draft: parsed.data };
}

export function writeTradeDraft(
	storage: DraftStorage,
	key: string,
	draft: TradeDraft,
): void {
	storage.setItem(key, JSON.stringify(draft));
}

export function clearAccountTradeDraft(
	userId: string,
	portfolioId: number,
): void {
	localStorage.removeItem(tradeDraftKey(userId, portfolioId));
}
