import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SectionHeading } from "@/components/app-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import type { AnalysisScope } from "@/lib/analysis-scope";
import { formatMoney } from "@/lib/currency";
import { PeriodPreset } from "@/lib/period";
import { QueryKey } from "@/lib/query-keys";
import {
	ComplianceUnit,
	type RuleTally,
	type RuleViolation,
} from "@/lib/risk-rule-compliance";
import { RiskRuleKind } from "@/lib/risk-rule-evaluation";
import { formatRuleDay, plural, RULE_LABEL } from "@/lib/risk-rule-format";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import { TradeStatus } from "@/lib/trade";
import { getRuleCompliance } from "@/server/riskRuleActions";

const PAGE_SIZE = 20;

const versionLabel = (version: number) => `v${version}`;

const versionsText = (versions: number[]) =>
	versions.map(versionLabel).join(", ") || "No versions used";

const LINK_CLASS =
	"inline-flex min-h-11 items-center rounded-sm underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0";

function tallyText({ kind, unit, pass, violated, unknown }: RuleTally) {
	const checked = pass + violated + unknown;
	const item = unit === ComplianceUnit.Day ? "day" : "trade";
	return `${RULE_LABEL[kind]}: ${plural(checked, item)} checked · ${pass} pass · ${violated} violated · ${unknown} unknown`;
}

function violationDetail(violation: RuleViolation, currency: string) {
	const { actual, limit } = violation;
	switch (violation.kind) {
		case RiskRuleKind.TradeRiskAmount:
		case RiskRuleKind.DailyLoss:
			return `${formatMoney(actual ?? 0, currency)} of ${formatMoney(limit ?? 0, currency)}`;
		case RiskRuleKind.TradeRiskPercent:
			return `${(actual ?? 0).toFixed(2)}% of ${limit}%`;
		case RiskRuleKind.DailyTradeCount:
			return `${actual} of ${limit}`;
		case RiskRuleKind.Cooldown:
			return `entry inside the ${limit} min wait`;
	}
}

function ViolationItem({
	violation,
	currency,
}: {
	violation: RuleViolation;
	currency: string;
}) {
	return (
		<li className="surface space-y-1 p-3 text-sm">
			<p className="flex flex-wrap items-center gap-2">
				<span className="font-medium">
					{`${RULE_LABEL[violation.kind]}: ${violationDetail(violation, currency)}`}
				</span>
				{violation.imported && <Badge variant="outline">Imported</Badge>}
			</p>
			<p className="text-xs text-muted-foreground">
				{`${formatRuleDay(violation.dayKey)} · Rules v${violation.version}`}
			</p>
			<p className="flex flex-wrap gap-x-3">
				{violation.sourceTradeIds.map((id) => (
					<Link
						key={id}
						to="/journal/$tradeId"
						params={{ tradeId: String(id) }}
						className={LINK_CLASS}
					>
						{`Open trade #${id}`}
					</Link>
				))}
				{violation.kind === RiskRuleKind.DailyLoss && (
					<Link
						to="/journal"
						search={{
							status: TradeStatus.Closed,
							period: PeriodPreset.Custom,
							dateFrom: violation.dayKey,
							dateTo: violation.dayKey,
						}}
						className={LINK_CLASS}
					>
						Open the day in the journal
					</Link>
				)}
			</p>
		</li>
	);
}

function ViolationList({ violations }: { violations: RuleViolation[] }) {
	const currency = useCurrency();
	const [shown, setShown] = useState(PAGE_SIZE);
	if (violations.length === 0)
		return <p className="text-sm">No violations in this period.</p>;
	return (
		<>
			<ul aria-label="Rule violations" className="space-y-2">
				{violations.slice(0, shown).map((violation) => (
					<ViolationItem
						key={`${violation.kind}-${violation.dayKey}-${violation.tradeId}`}
						violation={violation}
						currency={currency}
					/>
				))}
			</ul>
			{shown < violations.length && (
				<Button
					variant="outline"
					size="sm"
					className="max-sm:h-11"
					onClick={() => setShown(shown + PAGE_SIZE)}
				>
					Show more
				</Button>
			)}
		</>
	);
}

export function RulesComplianceSection({
	scope,
	periodLabel,
}: {
	scope: AnalysisScope;
	periodLabel: string;
}) {
	const { activeAccount } = useAccounts();
	const query = useQuery({
		queryKey: [QueryKey.RuleCompliance, scope],
		queryFn: () => getRuleCompliance({ data: scope }),
		enabled: scope.portfolioId !== undefined,
	});

	if (query.isError)
		return (
			<section className="mt-6 space-y-3 sm:mt-8">
				<SectionHeading title="Rule compliance" />
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<p role="alert">Could not load rule compliance.</p>
					<Button
						variant="outline"
						size="sm"
						className="max-sm:h-11"
						onClick={() => query.refetch()}
					>
						Retry
					</Button>
				</div>
			</section>
		);
	if (query.isPending) return <Skeleton className="mt-6 h-32 w-full sm:mt-8" />;
	const compliance = query.data;
	if (!compliance) return null;
	return (
		<section aria-label="Rule compliance" className="mt-6 space-y-3 sm:mt-8">
			<SectionHeading title="Rule compliance" detail={periodLabel} />
			{compliance.scopeIgnored && (
				<p className="text-sm text-muted-foreground">
					Rules use the account and the period only.
				</p>
			)}
			{compliance.tallies.length === 0 ? (
				<p className="text-sm">
					No days or trades under the rules in this period.
				</p>
			) : (
				<ul className="space-y-1 text-sm">
					{compliance.tallies.map((tally) => (
						<li key={tally.kind}>{tallyText(tally)}</li>
					))}
				</ul>
			)}
			<ViolationList violations={compliance.violations} />
			<p className="text-xs text-muted-foreground">
				{[
					activeAccount?.name ?? "Account",
					compliance.timezones.join(", ") || "No timezone",
					versionsText(compliance.versions),
				].join(" · ")}
			</p>
			<p role="note" className="text-xs text-muted-foreground">
				{RULES_DISCLAIMER}
			</p>
		</section>
	);
}
