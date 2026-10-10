import {
	type RuleCheck,
	RuleOutcome,
	type StoredRuleCheck,
} from "@/lib/risk-rule-evaluation";
import { formatRuleDay } from "@/lib/risk-rule-format";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import {
	lowerFirst,
	RULE_STATUS_TEXT,
	setOutcomes,
} from "@/lib/rule-check-text";
import { RuleOutcomeList } from "./rule-check-outcomes";

function outcomeOf(check: Pick<RuleCheck, "outcomes">) {
	const outcomes = setOutcomes(check.outcomes).map((item) => item.outcome);
	if (outcomes.includes(RuleOutcome.Violated)) return RuleOutcome.Violated;
	if (outcomes.includes(RuleOutcome.Unknown)) return RuleOutcome.Unknown;
	return outcomes.length ? RuleOutcome.Pass : RuleOutcome.NotSet;
}

function nowText(stored: StoredRuleCheck, now: RuleCheck | null | undefined) {
	if (!now?.version) return null;
	const outcome = outcomeOf(now);
	const storedOutcome = stored.reason ? RuleOutcome.Unknown : outcomeOf(stored);
	if (outcome === storedOutcome && now.version === stored.version) return null;
	return `Now: ${RULE_STATUS_TEXT[outcome]} (v${now.version})`;
}

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
				{`Rules v${check.version} · ${formatRuleDay(check.dayKey)}, ${check.timezone}`}
			</p>
		</>
	);
}

export function TradeRuleCheck({
	check,
	now,
	currency,
}: {
	check: StoredRuleCheck | null | undefined;
	now?: RuleCheck | null;
	currency: string;
}) {
	const today = check && nowText(check, now);
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
			{today && <p className="text-sm font-medium">{today}</p>}
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
