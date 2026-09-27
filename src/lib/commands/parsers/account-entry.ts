import { AccountEntryKind } from "@/lib/account-entry";
import { type CommandCandidate, IntentType } from "../types";

const kindFirst =
	/^(?:add\s+)?(?:deposit|withdraw(?:al)?)\s+\$?(\d+(?:\.\d{1,2})?)(?:\s+([a-z]{3}))?$/;
const amountFirst = /^(?:add\s+)?(\d+(?:\.\d{1,2})?)\s+([a-z]{3})\s+deposit$/;

export function parseAccountEntry(query: string): CommandCandidate | null {
	if (!/\b(deposit|withdraw|withdrawal)\b/.test(query)) return null;
	const kind = /\b(withdraw|withdrawal)\b/.test(query)
		? AccountEntryKind.Withdrawal
		: AccountEntryKind.Deposit;
	const match = kindFirst.exec(query) ?? amountFirst.exec(query);
	const amount = match?.[1];
	const currency = match?.[2] ?? (query.includes("$") ? "USD" : undefined);
	return {
		id: kind === AccountEntryKind.Deposit ? "deposit" : "withdrawal",
		title: kind === AccountEntryKind.Deposit ? "Add deposit" : "Add withdrawal",
		intent: {
			type: IntentType.AccountEntry,
			params: { kind, amount, currency: currency?.toUpperCase() },
		},
		confidence: amount && Number(amount) > 0 ? 0.95 : 0.75,
		...(!match
			? { warning: "Enter the amount and review the account before saving." }
			: {}),
	};
}
