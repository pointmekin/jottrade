import type { StoredRuleCheck } from "@/lib/risk-rule-evaluation";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import { formatDay, lowerFirst } from "@/lib/rule-check-text";
import { RuleOutcomeList } from "./rule-check-outcomes";

function StoredOutcomes({
	check,
	currency,
}: {
	check: StoredRuleCheck;
	currency: string;
}) {
	if (check.reason || !check.version || !check.timezone || !check.dayKey)
		return (
			<p className="text-sm">{`Unknown: ${lowerFirst(check.reason ?? "")}`}</p>
		);
	return (
		<>
			<RuleOutcomeList
				outcomes={check.outcomes}
				currency={currency}
				timeZone={check.timezone}
			/>
			<p className="text-xs text-muted-foreground">
				{`Rules v${check.version} · ${formatDay(check.dayKey)}, ${check.timezone}`}
			</p>
		</>
	);
}

export function TradeRuleCheck({
	check,
	currency,
}: {
	check: StoredRuleCheck | null | undefined;
	currency: string;
}) {
	return (
		<section aria-label="Rule check at entry" className="space-y-2">
			<h3 className="text-sm font-medium">Rule check at entry</h3>
			{check ? (
				<StoredOutcomes check={check} currency={currency} />
			) : (
				<p className="text-sm text-muted-foreground">
					Logged before rules, or imported.
				</p>
			)}
			{check?.note && (
				<dl className="text-sm">
					<dt className="text-muted-foreground">Why did you take it?</dt>
					<dd className="whitespace-pre-wrap break-words">{check.note}</dd>
				</dl>
			)}
			{check && (
				<p role="note" className="text-xs text-muted-foreground">
					{RULES_DISCLAIMER}
				</p>
			)}
		</section>
	);
}
