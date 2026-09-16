import type { AccountEntryKind } from "@/lib/account-entry";

export type TradeParams = {
	symbol?: string;
	side?: "LONG" | "SHORT";
	entryPrice?: string;
	quantity?: string;
	targetPrice?: string;
};
export type AccountEntryParams = {
	kind: Exclude<AccountEntryKind, "ADJUSTMENT">;
	amount?: string;
	currency?: string;
};
export type WriteIntent =
	| { type: "trade"; params: TradeParams }
	| { type: "account-entry"; params: AccountEntryParams };
export type CommandIntent =
	| WriteIntent
	| { type: "navigation"; path: string }
	| { type: "theme"; theme: "dark" | "light" | "system" };
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
