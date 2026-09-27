import type { AccountEntryKind } from "@/lib/account-entry";
import type { TradeSide } from "@/lib/trade";

export const IntentType = {
	Trade: "trade",
	AccountEntry: "account-entry",
	Navigation: "navigation",
	Theme: "theme",
} as const;

export type TradeParams = {
	symbol?: string;
	side?: TradeSide;
	entryPrice?: string;
	quantity?: string;
	targetPrice?: string;
};
export type AccountEntryParams = {
	kind: Exclude<AccountEntryKind, typeof AccountEntryKind.Adjustment>;
	amount?: string;
	currency?: string;
};
export type WriteIntent =
	| { type: typeof IntentType.Trade; params: TradeParams }
	| { type: typeof IntentType.AccountEntry; params: AccountEntryParams };
export type CommandIntent =
	| WriteIntent
	| { type: typeof IntentType.Navigation; path: string }
	| { type: typeof IntentType.Theme; theme: "dark" | "light" | "system" };
export type CommandCandidate = {
	id: string;
	title: string;
	intent: CommandIntent;
	confidence: number;
	warning?: string;
};
export type RegisteredCommand = Omit<CommandCandidate, "confidence"> & {
	aliases: string[];
};
