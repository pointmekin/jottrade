import { z } from "zod";
import { AccountEntryKind } from "@/lib/account-entry";
import { navItems } from "@/lib/nav-items";
import { resolveCommandSymbol } from "./aliases";
import type { CommandCandidate } from "./types";

export const INTENT_TYPES = [
	"trade",
	"account-entry",
	"navigation",
	"theme",
	"unknown",
] as const;
const THEMES = ["dark", "light", "system"] as const;
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
	side: z.enum(["LONG", "SHORT"]).optional(),
	entryPrice: decimal.optional(),
	quantity: decimal.optional(),
	targetPrice: decimal.optional(),
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
	theme: z.enum(THEMES).optional(),
});
export type ExtractedIntent = z.infer<typeof extractedIntentSchema>;

/** Sent to the model so the accepted values cannot drift from the schema above. */
export const intentJsonSchema = {
	type: "object",
	properties: {
		intent: { type: "string", enum: [...INTENT_TYPES] },
		symbol: { type: "string" },
		side: { type: "string", enum: ["LONG", "SHORT"] },
		entryPrice: { type: "string" },
		quantity: { type: "string" },
		targetPrice: { type: "string" },
		kind: { type: "string", enum: [...ENTRY_KINDS] },
		amount: { type: "string" },
		currency: { type: "string" },
		path: { type: "string", enum: NAV_PATHS },
		theme: { type: "string", enum: [...THEMES] },
	},
	required: ["intent"],
};

const AI_WARNING =
	"Interpreted from your words by Gemini. Check every field before saving.";

export function toCommandCandidate(
	extracted: ExtractedIntent,
): CommandCandidate | null {
	if (extracted.intent === "navigation")
		return extracted.path
			? {
					id: `nav:${extracted.path}`,
					title: `Go to ${extracted.path}`,
					intent: { type: "navigation", path: extracted.path },
					confidence: 0.9,
				}
			: null;
	if (extracted.intent === "theme")
		return extracted.theme
			? {
					id: `theme:${extracted.theme}`,
					title:
						extracted.theme === "system"
							? "System theme"
							: `${extracted.theme === "dark" ? "Dark" : "Light"} mode`,
					intent: { type: "theme", theme: extracted.theme },
					confidence: 0.9,
				}
			: null;
	if (extracted.intent === "account-entry") {
		if (!extracted.kind) return null;
		const deposit = extracted.kind === AccountEntryKind.Deposit;
		return {
			id: deposit ? "deposit" : "withdrawal",
			title: deposit ? "Add deposit" : "Add withdrawal",
			intent: {
				type: "account-entry",
				params: {
					kind: extracted.kind,
					amount: extracted.amount,
					currency: extracted.currency?.toUpperCase(),
				},
			},
			confidence: 0.9,
			warning: AI_WARNING,
		};
	}
	if (extracted.intent === "trade") {
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
				type: "trade",
				params: {
					symbol,
					side: extracted.side,
					entryPrice: extracted.entryPrice,
					quantity: extracted.quantity,
					targetPrice: extracted.targetPrice,
				},
			},
			confidence: 0.9,
			warning: AI_WARNING,
		};
	}
	return null;
}
