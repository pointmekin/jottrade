import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ViolationItem } from "@/components/dashboard/rules-compliance-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { zonedDayBounds } from "@/lib/date";
import { PeriodPreset } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import { ReviewKind } from "@/lib/review";
import { RULE_COMPLIANCE_ID, RULE_LABEL } from "@/lib/risk-rule-format";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import {
	getRuleCompliance,
	type RuleComplianceResult,
} from "@/server/riskRuleActions";

type ReviewWindow = {
	periodStart: string;
	periodEndExclusive: string;
	timezoneSnapshot: string;
};

function DayViolations({ compliance }: { compliance: RuleComplianceResult }) {
	const currency = useCurrency();
	const { violations } = compliance;
	return (
		<>
			<h2 className="font-semibold">{`Rule violations this day (${violations.length})`}</h2>
			{violations.length === 0 ? (
				<p className="text-sm">No violations.</p>
			) : (
				<ul className="space-y-2">
					{violations.map((violation) => (
						<ViolationItem
							key={`${violation.kind}-${violation.dayKey}-${violation.tradeId}`}
							violation={violation}
							currency={currency}
						/>
					))}
				</ul>
			)}
		</>
	);
}

function WeekViolations({
	compliance,
	bounds,
}: {
	compliance: RuleComplianceResult;
	bounds: { dateFrom: string; dateTo: string };
}) {
	return (
		<>
			<h2 className="font-semibold">{`Rule violations this week (${compliance.violations.length})`}</h2>
			{compliance.tallies.length === 0 ? (
				<p className="text-sm">No violations.</p>
			) : (
				<ul className="space-y-1 text-sm">
					{compliance.tallies.map((tally) => (
						<li
							key={tally.kind}
						>{`${RULE_LABEL[tally.kind]}: ${tally.violated} violated`}</li>
					))}
				</ul>
			)}
			<Link
				to="/dashboard"
				search={{ period: PeriodPreset.Custom, ...bounds }}
				hash={RULE_COMPLIANCE_ID}
				className="inline-flex min-h-11 items-center rounded-sm text-sm underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
			>
				Open the week in the dashboard
			</Link>
		</>
	);
}

/** Reads today's rule compliance for the review window; the saved review snapshot does not include it. */
export function ReviewRuleViolations({
	portfolioId,
	kind,
	window,
}: {
	portfolioId: number;
	kind: ReviewKind;
	window: ReviewWindow;
}) {
	const bounds = zonedDayBounds(
		window.periodStart,
		window.periodEndExclusive,
		window.timezoneSnapshot,
	);
	const scope = { portfolioId, timeZone: window.timezoneSnapshot, ...bounds };
	const query = useQuery({
		queryKey: [QueryKey.RuleCompliance, scope],
		queryFn: () => getRuleCompliance({ data: scope }),
	});
	if (query.isPending) return <Skeleton className="h-20 w-full" />;
	if (query.isError)
		return (
			<section className="surface flex flex-wrap items-center gap-2 p-4 text-sm">
				<p role="alert">Could not load rule violations.</p>
				<Button
					variant="outline"
					size="sm"
					className="max-sm:h-11"
					onClick={() => query.refetch()}
				>
					Retry
				</Button>
			</section>
		);
	if (!query.data) return null;
	return (
		<section aria-label="Rule violations" className="surface space-y-3 p-4">
			{kind === ReviewKind.Weekly ? (
				<WeekViolations compliance={query.data} bounds={bounds} />
			) : (
				<DayViolations compliance={query.data} />
			)}
			<p role="note" className="text-xs text-muted-foreground">
				{RULES_DISCLAIMER}
			</p>
		</section>
	);
}
