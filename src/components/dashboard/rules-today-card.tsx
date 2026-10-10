import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/app-page-header";
import { MetricCard, MetricCardSkeleton } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { QueryKey } from "@/lib/query-keys";
import type { RuleToday } from "@/lib/risk-rule-compliance";
import { RuleOutcome, type RuleResult } from "@/lib/risk-rule-evaluation";
import { formatRuleDay, formatRuleTime, plural } from "@/lib/risk-rule-format";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import { getRuleToday } from "@/server/riskRuleActions";

const LINK_CLASS =
	"inline-flex min-h-11 items-center text-sm underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0";

function RulesLink({ text }: { text: string }) {
	return (
		<Link to="/settings" className={LINK_CLASS}>
			{text}
		</Link>
	);
}

function LossCard({
	result,
	currency,
}: {
	result: RuleResult;
	currency: string;
}) {
	const { limit, actual } = result;
	if (result.outcome === RuleOutcome.Unknown || limit === null)
		return (
			<MetricCard
				label="Loss left today"
				value="Unknown"
				sub={`${result.reason ?? "No limit"}. Realized only.`}
			/>
		);
	const left = Math.max(0, limit - (actual ?? 0));
	return (
		<MetricCard
			label="Loss left today"
			value={`${formatMoney(left, currency)} of ${formatMoney(limit, currency)}`}
			sub={
				result.outcome === RuleOutcome.Violated
					? "Limit reached. Realized only."
					: "Realized only."
			}
		/>
	);
}

function cooldownValue(result: RuleResult, timeZone: string) {
	if (result.outcome === RuleOutcome.Unknown) return "Unknown";
	if (result.until) return `Until ${formatRuleTime(result.until, timeZone)}`;
	return "No cooldown";
}

function TodayCards({
	today,
	currency,
}: {
	today: RuleToday;
	currency: string;
}) {
	const { dailyLoss, trades, cooldown, openRisk } = today;
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{dailyLoss && <LossCard result={dailyLoss} currency={currency} />}
			{trades && (
				<MetricCard
					label="Trades left"
					value={`${Math.max(0, trades.limit - trades.entered)} of ${trades.limit}`}
					sub={`${plural(trades.entered, "trade")} entered today`}
				/>
			)}
			{cooldown && (
				<MetricCard
					label="Cooldown"
					value={cooldownValue(cooldown, today.timezone)}
					sub={
						cooldown.reason ??
						`Wait ${cooldown.limit} min after ${plural(cooldown.actual ?? 0, "loss", "losses")} in a row`
					}
				/>
			)}
			<MetricCard
				label="Open initial risk"
				value={formatMoney(openRisk.amount, currency)}
				sub={[
					`Across ${plural(openRisk.count, "open trade")}`,
					openRisk.unknownCount > 0 &&
						`${plural(openRisk.unknownCount, "open trade")} with unknown risk`,
				]
					.filter(Boolean)
					.join(" · ")}
			/>
		</div>
	);
}

export function RulesTodayCard() {
	const { activeAccount } = useAccounts();
	const currency = useCurrency();
	const portfolioId = activeAccount?.id;
	const query = useQuery({
		queryKey: [QueryKey.RuleToday, portfolioId],
		queryFn: () =>
			getRuleToday({ data: { portfolioId: portfolioId as number } }),
		enabled: portfolioId !== undefined,
	});

	if (query.isError)
		return (
			<section className="mt-6 space-y-3 sm:mt-8">
				<SectionHeading title="Rules today" />
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<p role="alert">Could not load the rules.</p>
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
	if (!query.data)
		return (
			<section className="mt-6 space-y-3 sm:mt-8">
				<SectionHeading
					title="Rules today"
					detail={query.isPending ? undefined : "No rules for this account."}
					actions={!query.isPending && <RulesLink text="Set rules" />}
				/>
				{query.isPending && (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<MetricCardSkeleton />
						<MetricCardSkeleton />
					</div>
				)}
			</section>
		);
	const today = query.data;
	return (
		<section aria-label="Rules today" className="mt-6 space-y-3 sm:mt-8">
			<SectionHeading
				title="Rules today"
				detail={`${activeAccount?.name ?? "Account"} · ${formatRuleDay(today.dayKey)}, ${today.timezone} · Rules v${today.version}`}
				actions={<RulesLink text="Edit rules" />}
			/>
			<TodayCards today={today} currency={currency} />
			<p role="note" className="text-xs text-muted-foreground">
				{RULES_DISCLAIMER}
			</p>
		</section>
	);
}
