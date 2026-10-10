import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { localDateTimeToIso } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import {
	evaluateEntry,
	RULES_UNREADABLE,
	type RuleCheck,
	ruleEntryOf,
	type StoredRuleCheck,
} from "@/lib/risk-rule-evaluation";
import { ruleOutcomeText } from "@/lib/rule-check-text";
import type { TradeCaptureValues } from "@/lib/trade-capture";
import { getRuleContext } from "@/server/riskRuleActions";

function toIso(value: string | undefined) {
	if (!value || !Number.isFinite(Date.parse(value))) return undefined;
	return localDateTimeToIso(value);
}

const outcomeKey = (check: Pick<RuleCheck, "outcomes"> | null | undefined) =>
	JSON.stringify(check?.outcomes ?? []);

/** The entry check of the form values, from the cached account day facts. */
export function useRuleCheck(
	values: TradeCaptureValues,
	portfolioId: number | undefined,
) {
	const entryDate = toIso(values.entryDate);
	const query = useQuery({
		queryKey: [QueryKey.RuleContext, portfolioId, entryDate],
		queryFn: () =>
			getRuleContext({
				data: { portfolioId: portfolioId ?? 0, entryDate: entryDate ?? "" },
			}),
		enabled: Boolean(entryDate && portfolioId),
		placeholderData: keepPreviousData,
	});
	const context = query.data;
	const check =
		context &&
		evaluateEntry(
			context,
			ruleEntryOf(
				{
					...values,
					entryDate: entryDate ?? "",
					exitDate: toIso(values.exitDate),
				},
				context.currency,
			),
		);
	const preview = check?.version ? check : null;
	// The server result is the stored truth, for example after a save in another tab.
	const notifyStored = (stored: StoredRuleCheck | null | undefined) => {
		if (!context || outcomeKey(preview) === outcomeKey(stored)) return;
		const description = stored?.reason
			? `Unknown: ${RULES_UNREADABLE.toLowerCase()}`
			: ruleOutcomeText(
					stored?.outcomes ?? [],
					context.currency,
					stored?.timezone ?? "UTC",
				);
		toast.warning("The saved rule check is different from the preview.", {
			description: description || "No rules for this account.",
		});
	};
	return { entryDate, query, check, notifyStored };
}
