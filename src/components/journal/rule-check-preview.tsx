import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/hooks/use-accounts";
import { useRuleCheck } from "@/hooks/use-rule-check";
import { hasViolation } from "@/lib/risk-rule-evaluation";
import { RULES_DISCLAIMER } from "@/lib/risk-rules";
import { formatDay } from "@/lib/rule-check-text";
import type { TradeCaptureValues } from "@/lib/trade-capture";
import { RuleOutcomeList } from "./rule-check-outcomes";

export function RuleCheckPreview({
	values,
	portfolioId,
	onNoteChange,
}: {
	values: TradeCaptureValues;
	portfolioId: number;
	onNoteChange: (ruleNote: string) => void;
}) {
	const noteId = useId();
	const { accounts } = useAccounts();
	const account = accounts.find((item) => item.id === portfolioId);
	const { entryDate, query, check } = useRuleCheck(values, portfolioId);
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
	if (!check?.version || !check.timezone || !check.dayKey)
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
			<RuleOutcomeList
				outcomes={check.outcomes}
				currency={query.data.currency}
				timeZone={timezone}
			/>
			{hasViolation(check) && (
				<div className="space-y-1.5">
					<Label htmlFor={noteId}>Why did you take it? (optional)</Label>
					<Textarea
						id={noteId}
						maxLength={500}
						value={values.ruleNote ?? ""}
						onChange={(event) => onNoteChange(event.target.value)}
					/>
				</div>
			)}
			<p className="text-xs text-muted-foreground">
				{`${account?.name ?? "Account"} · ${formatDay(check.dayKey)}, ${timezone} · Rules v${check.version}`}
			</p>
			<p role="note" className="text-xs text-muted-foreground">
				{RULES_DISCLAIMER}
			</p>
		</section>
	);
}
