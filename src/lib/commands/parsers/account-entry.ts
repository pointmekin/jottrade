import { AccountEntryKind } from "@/lib/account-entry";
import type { CommandCandidate } from "../types";

export function parseAccountEntry(query: string): CommandCandidate | null {
	if (!/\b(deposit|withdraw|withdrawal)\b/.test(query)) return null;
	const kind = /\b(withdraw|withdrawal)\b/.test(query)
		? AccountEntryKind.Withdrawal
		: AccountEntryKind.Deposit;
	const match =
		/^(?:add\s+)?(?:(?:deposit|withdraw|withdrawal)\s+\$?(\d+(?:\.\d{1,2})?)(?:\s+([a-z]{3}))?|(\d+(?:\.\d{1,2})?)\s+([a-z]{3})\s+deposit)$/.exec(
			query,
		);
	const amount = match?.[1] ?? match?.[3];
	const currency =
		match?.[2] ?? match?.[4] ?? (query.includes("$") ? "USD" : undefined);
	return {
		id: kind === AccountEntryKind.Deposit ? "deposit" : "withdrawal",
		title: kind === AccountEntryKind.Deposit ? "Add deposit" : "Add withdrawal",
		intent: {
			type: "account-entry",
			params: { kind, amount, currency: currency?.toUpperCase() },
		},
		confidence: amount && Number(amount) > 0 ? 0.95 : 0.75,
		...(!match
			? { warning: "Enter the amount and review the account before saving." }
			: {}),
	};
}
