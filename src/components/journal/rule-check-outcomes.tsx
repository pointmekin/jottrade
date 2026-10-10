import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import { RuleOutcome, type RuleResult } from "@/lib/risk-rule-evaluation";
import {
	RULE_STATUS_TEXT,
	ruleLineOf,
	setOutcomes,
} from "@/lib/rule-check-text";

const ICON = {
	[RuleOutcome.Pass]: CircleCheck,
	[RuleOutcome.Violated]: TriangleAlert,
	[RuleOutcome.Unknown]: CircleHelp,
	[RuleOutcome.NotSet]: CircleHelp,
};

export function RuleOutcomeList({
	outcomes,
	currency,
	timeZone,
}: {
	outcomes: RuleResult[];
	currency: string;
	timeZone: string;
}) {
	return (
		<ul aria-live="polite" className="space-y-1 text-sm">
			{setOutcomes(outcomes).map((result) => {
				const Icon = ICON[result.outcome];
				return (
					<li key={result.kind} className="flex items-start gap-2">
						<Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
						<span className="flex flex-wrap gap-x-1">
							<span>{ruleLineOf(result, currency, timeZone)}</span>{" "}
							<span className="font-medium">{`· ${RULE_STATUS_TEXT[result.outcome]}`}</span>
						</span>
					</li>
				);
			})}
		</ul>
	);
}
