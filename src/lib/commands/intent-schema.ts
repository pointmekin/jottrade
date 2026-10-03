import { z } from "zod";
import { AccountEntryKind } from "@/lib/account-entry";
import { navItems } from "@/lib/nav-items";
import { TradeSide } from "@/lib/trade";
import { resolveCommandSymbol } from "./aliases";
import {
	type CommandCandidate,
	CommandTheme,
	IntentType,
	THEME_TITLES,
} from "./types";

export const INTENT_TYPES = [
	IntentType.Trade,
	IntentType.AccountEntry,
	IntentType.Navigation,
	IntentType.Theme,
	"unknown",
] as const;
const THEMES = Object.values(CommandTheme);
const SIDES = Object.values(TradeSide);
const ENTRY_KINDS = [
	AccountEntryKind.Deposit,
	AccountEntryKind.Withdrawal,
] as const;
const NAV_PATHS = navItems.map((item) => item.url);

const decimal = z.string().regex(/^(?:\d+(?:\.\d+)?|\.\d+)$/);

export const extractedIntentSchema = z.object({
	intent: z.enum(INTENT_TYPES),
	symbol: z
		.string()
		.regex(/^[A-Za-z][A-Za-z0-9./_-]{0,39}$/)
		.optional(),
	side: z.enum(TradeSide).optional(),
	entryPrice: decimal.optional(),
	quantity: decimal.optional(),
	targetPrice: decimal.optional(),
	initialStopPrice: decimal.optional(),
	kind: z.enum(ENTRY_KINDS).optional(),
	amount: decimal.optional(),
	currency: z
		.string()
		.regex(/^[A-Za-z]{3}$/)
		.optional(),
	path: z
		.string()
		.refine((value) => NAV_PATHS.includes(value))
		.optional(),
	theme: z.enum(CommandTheme).optional(),
});
export type ExtractedIntent = z.infer<typeof extractedIntentSchema>;

/** Sent to the model so the accepted values cannot drift from the schema above. */
export const intentJsonSchema = {
	type: "object",
	properties: {
		intent: { type: "string", enum: [...INTENT_TYPES] },
		symbol: { type: "string" },
		side: { type: "string", enum: SIDES },
		entryPrice: { type: "string" },
		quantity: { type: "string" },
		targetPrice: { type: "string" },
		initialStopPrice: { type: "string" },
		kind: { type: "string", enum: [...ENTRY_KINDS] },
		amount: { type: "string" },
		currency: { type: "string" },
		path: { type: "string", enum: NAV_PATHS },
		theme: { type: "string", enum: THEMES },
	},
	required: ["intent"],
};

const AI_CONFIDENCE = 0.9;
const AI_WARNING =
	"Interpreted from your words by Gemini. Check every field before saving.";

function navigationCandidate(
	path: string | undefined,
): CommandCandidate | null {
	if (!path) return null;
	return {
		id: `nav:${path}`,
		title: `Go to ${path}`,
		intent: { type: IntentType.Navigation, path },
		confidence: AI_CONFIDENCE,
	};
}

function themeCandidate(
	theme: CommandTheme | undefined,
): CommandCandidate | null {
	if (!theme) return null;
	return {
		id: `theme:${theme}`,
		title: THEME_TITLES[theme],
		intent: { type: IntentType.Theme, theme },
		confidence: AI_CONFIDENCE,
	};
}

function accountEntryCandidate(
	extracted: ExtractedIntent,
): CommandCandidate | null {
	if (!extracted.kind) return null;
	const deposit = extracted.kind === AccountEntryKind.Deposit;
	return {
		id: deposit ? "deposit" : "withdrawal",
		title: deposit ? "Add deposit" : "Add withdrawal",
		intent: {
			type: IntentType.AccountEntry,
			params: {
				kind: extracted.kind,
				amount: extracted.amount,
				currency: extracted.currency?.toUpperCase(),
			},
		},
		confidence: AI_CONFIDENCE,
		warning: AI_WARNING,
	};
}

function tradeCandidate(extracted: ExtractedIntent): CommandCandidate {
	const symbol = extracted.symbol
		? resolveCommandSymbol(extracted.symbol)
		: undefined;
	return {
		id: "trade",
		title:
			`Log ${extracted.side?.toLowerCase() ?? ""} ${symbol ?? ""} trade`.replace(
				/ +/g,
				" ",
			),
		intent: {
			type: IntentType.Trade,
			params: {
				symbol,
				side: extracted.side,
				entryPrice: extracted.entryPrice,
				quantity: extracted.quantity,
				targetPrice: extracted.targetPrice,
				initialStopPrice: extracted.initialStopPrice,
			},
		},
		confidence: AI_CONFIDENCE,
		warning: AI_WARNING,
	};
}

export function toCommandCandidate(
	extracted: ExtractedIntent,
): CommandCandidate | null {
	switch (extracted.intent) {
		case IntentType.Navigation:
			return navigationCandidate(extracted.path);
		case IntentType.Theme:
			return themeCandidate(extracted.theme);
		case IntentType.AccountEntry:
			return accountEntryCandidate(extracted);
		case IntentType.Trade:
			return tradeCandidate(extracted);
		default:
			return null;
	}
}
