import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { formatMoney } from "@/lib/currency";
import { localDateTimeToIso } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import {
	evaluateEntry,
	RiskRuleKind,
	RuleOutcome,
	type RuleResult,
	ruleEntryOf,
} from "@/lib/risk-rule-evaluation";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import type { TradeCaptureValues } from "@/lib/trade-capture";
import { getRuleContext } from "@/server/riskRuleActions";

const LABEL: Record<RiskRuleKind, string> = {
	[RiskRuleKind.TradeRiskAmount]: "Risk per trade",
	[RiskRuleKind.TradeRiskPercent]: "Risk % per trade",
	[RiskRuleKind.DailyLoss]: "Loss today",
	[RiskRuleKind.DailyTradeCount]: "Trades today",
	[RiskRuleKind.Cooldown]: "Cooldown",
};

const STATUS = {
	[RuleOutcome.Pass]: { text: "Pass", Icon: CircleCheck },
	[RuleOutcome.Violated]: { text: "Violated", Icon: TriangleAlert },
	[RuleOutcome.Unknown]: { text: "Unknown", Icon: CircleHelp },
	[RuleOutcome.NotSet]: { text: "Not set", Icon: CircleHelp },
};

function toIso(value: string | undefined) {
	if (!value || !Number.isFinite(Date.parse(value))) return undefined;
	return localDateTimeToIso(value);
}

const lowerFirst = (text: string) =>
	text.charAt(0).toLowerCase() + text.slice(1);

const formatTime = (iso: string, timeZone: string) =>
	new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
	timeZone: "UTC",
	weekday: "short",
	day: "numeric",
	month: "short",
});

const formatDay = (dayKey: string) =>
	DAY_FORMAT.format(new Date(`${dayKey}T00:00:00Z`));

function cooldownDetail(result: RuleResult, timeZone: string) {
	const losses = `${result.actual} ${result.actual === 1 ? "loss" : "losses"}`;
	const wait = result.until
		? `wait until ${formatTime(result.until, timeZone)}`
		: "no wait";
	return `after ${losses}: ${wait}`;
}

function detailOf(result: RuleResult, currency: string, timeZone: string) {
	if (result.reason) return lowerFirst(result.reason);
	const { actual, limit } = result;
	switch (result.kind) {
		case RiskRuleKind.TradeRiskAmount:
		case RiskRuleKind.DailyLoss:
			return `${formatMoney(actual ?? 0, currency)} of ${formatMoney(limit ?? 0, currency)}`;
		case RiskRuleKind.TradeRiskPercent:
			return `${(actual ?? 0).toFixed(2)}% of ${limit}%`;
		case RiskRuleKind.DailyTradeCount:
			return `${actual} of ${limit}`;
		case RiskRuleKind.Cooldown:
			return cooldownDetail(result, timeZone);
	}
}

export function RuleCheckPreview({
	values,
	portfolioId,
}: {
	values: TradeCaptureValues;
	portfolioId: number;
}) {
	const { accounts } = useAccounts();
	const account = accounts.find((item) => item.id === portfolioId);
	const entryDate = toIso(values.entryDate);
	const query = useQuery({
		queryKey: [QueryKey.RuleContext, portfolioId, entryDate],
		queryFn: () =>
			getRuleContext({ data: { portfolioId, entryDate: entryDate ?? "" } }),
		enabled: Boolean(entryDate),
		placeholderData: keepPreviousData,
	});
	if (!entryDate) return null;
	if (query.isPending)
		return (
			<Skeleton className="h-5 w-full">
				<span className="sr-only">Checking rules…</span>
			</Skeleton>
		);
	if (query.isError)
		return (
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<p role="alert">Could not check rules. You can still log the trade.</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="max-sm:h-11"
					onClick={() => query.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	const context = query.data;
	const check = evaluateEntry(
		context,
		ruleEntryOf(
			{ ...values, entryDate, exitDate: toIso(values.exitDate) },
			context.currency,
		),
	);
	if (check.version === null || !check.timezone || !check.dayKey)
		return (
			<p className="text-sm text-muted-foreground">
				No rules for this account.{" "}
				<Link
					to="/settings"
					className="inline-flex min-h-11 items-center text-foreground underline sm:min-h-0"
				>
					Set rules
				</Link>
			</p>
		);
	const { timezone } = check;
	return (
		<section
			aria-label="Rule check"
			className="space-y-2 rounded-md border p-3"
		>
			<ul aria-live="polite" className="space-y-1 text-sm">
				{check.outcomes
					.filter((result) => result.outcome !== RuleOutcome.NotSet)
					.map((result) => {
						const { text, Icon } = STATUS[result.outcome];
						return (
							<li key={result.kind} className="flex items-start gap-2">
								<Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
								<span className="flex flex-wrap gap-x-1">
									<span>
										{`${LABEL[result.kind]}: ${detailOf(result, context.currency, timezone)}`}
									</span>{" "}
									<span className="font-medium">{`· ${text}`}</span>
								</span>
							</li>
						);
					})}
			</ul>
			<p className="text-xs text-muted-foreground">
				{`${account?.name ?? "Account"} · ${formatDay(check.dayKey)}, ${timezone} · Rules v${check.version}`}
			</p>
			<p role="note" className="text-xs text-muted-foreground">
				{RULES_DISCLAIMER}
			</p>
		</section>
	);
}
