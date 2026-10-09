import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import {
	CriterionResult,
	PlanAdherence,
	type PlaybookCheck,
} from "@/lib/playbook-check";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
	getPlaybookCheck,
	savePlaybookCheck,
} from "@/server/playbookCheckActions";

type Loaded = Awaited<ReturnType<typeof getPlaybookCheck>>;
type Answers = Record<string, CriterionResult>;

const RESULT_LABELS: Record<CriterionResult, string> = {
	[CriterionResult.Followed]: "Followed",
	[CriterionResult.Broke]: "Broke",
};

export function TradePlaybookCheck({ tradeId }: { tradeId: number }) {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const portfolioId = activeAccount?.id;
	const userId = session?.user.id;
	const query = useQuery({
		queryKey: [QueryKey.PlaybookCheck, userId, portfolioId, tradeId],
		queryFn: () =>
			getPlaybookCheck({
				data: { portfolioId: portfolioId as number, id: tradeId },
			}),
		enabled: !!userId && portfolioId !== undefined,
	});
	if (query.isError)
		return (
			<p role="alert">
				The playbook check could not be loaded.{" "}
				<Button variant="outline" onClick={() => query.refetch()}>
					Retry
				</Button>
			</p>
		);
	if (!query.data || !portfolioId)
		return (
			<p className="text-sm text-muted-foreground">Loading playbook check...</p>
		);
	return (
		<section className="space-y-3" aria-label="Playbook check">
			<h3 className="field-label">Playbook check</h3>
			<CheckPanel
				data={query.data}
				portfolioId={portfolioId}
				tradeId={tradeId}
				reload={() => query.refetch()}
			/>
		</section>
	);
}

function CheckPanel({
	data,
	portfolioId,
	tradeId,
	reload,
}: {
	data: Loaded;
	portfolioId: number;
	tradeId: number;
	reload: () => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const { strategy, check, isStale } = data;
	const saved = check && (
		<CheckSummary
			check={check}
			notice={isStale ? staleNotice(check, strategy) : undefined}
		/>
	);
	if (!strategy?.criteria.length)
		return (
			<>
				{saved}
				<MissingPlaybook hasStrategy={!!strategy} />
			</>
		);
	if (check && !isEditing)
		return (
			<>
				{saved}
				<Button
					variant="outline"
					className="min-h-11 sm:min-h-9"
					onClick={() => setIsEditing(true)}
				>
					Check again
				</Button>
			</>
		);
	return (
		<>
			{saved}
			<CheckForm
				data={data}
				portfolioId={portfolioId}
				tradeId={tradeId}
				initial={check && !isStale ? answersOf(check) : {}}
				onDone={() => setIsEditing(false)}
				onCancel={check ? () => setIsEditing(false) : undefined}
				reload={reload}
			/>
		</>
	);
}

function MissingPlaybook({ hasStrategy }: { hasStrategy: boolean }) {
	if (!hasStrategy)
		return (
			<p className="text-sm text-muted-foreground">
				Assign a strategy to check this trade against its playbook.
			</p>
		);
	return (
		<p className="text-sm text-muted-foreground">
			This playbook has no criteria yet.{" "}
			<Link to="/strategies" className="underline underline-offset-4">
				Add criteria
			</Link>
		</p>
	);
}

function CheckSummary({
	check,
	notice,
}: {
	check: PlaybookCheck;
	notice?: string;
}) {
	const followed = check.items.filter(
		(item) => item.result === CriterionResult.Followed,
	).length;
	const isFollowed = check.result === PlanAdherence.Followed;
	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={isFollowed ? "secondary" : "destructive"}>
					{isFollowed ? "Followed plan" : "Broke plan"}
				</Badge>
				<span className="text-xs text-muted-foreground">
					{followed} of {check.items.length} followed ·{" "}
					{format(new Date(check.checkedAt), "MMM d, yyyy")}
				</span>
			</div>
			<ul className="space-y-1 text-sm">
				{check.items.map((item) => (
					<li key={item.id} className="flex justify-between gap-3">
						<span>{item.text}</span>
						<span className="shrink-0 text-muted-foreground">
							{item.result
								? `You marked ${RESULT_LABELS[item.result]}`
								: "No answer"}
						</span>
					</li>
				))}
			</ul>
			{notice && (
				<p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>
			)}
		</div>
	);
}

function CheckForm({
	data,
	portfolioId,
	tradeId,
	initial,
	onDone,
	onCancel,
	reload,
}: {
	data: Loaded;
	portfolioId: number;
	tradeId: number;
	initial: Answers;
	onDone: () => void;
	onCancel?: () => void;
	reload: () => void;
}) {
	const queryClient = useQueryClient();
	const [answers, setAnswers] = useState<Answers>(initial);
	const strategy = data.strategy as NonNullable<Loaded["strategy"]>;
	const isComplete = strategy.criteria.every(
		(criterion) => !criterion.required || answers[criterion.id],
	);
	const save = useMutation({
		mutationFn: () =>
			savePlaybookCheck({
				data: {
					portfolioId,
					id: tradeId,
					expectedRevision: data.revision,
					criteriaVersion: strategy.criteriaVersion,
					results: answers,
				},
			}),
		onSuccess: async () => {
			await invalidateTradeQueries(queryClient);
			onDone();
		},
	});
	return (
		<div className="space-y-3">
			<div className="space-y-3">
				{strategy.criteria.map((criterion) => (
					<div
						key={criterion.id}
						role="radiogroup"
						aria-label={criterion.text}
						className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<span className="text-sm">
							{criterion.text}
							{!criterion.required && (
								<span className="text-muted-foreground"> (optional)</span>
							)}
						</span>
						<div className="flex shrink-0 gap-2">
							{Object.values(CriterionResult).map((result) => (
								<label
									key={result}
									className={cn(
										"flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-md border px-3 text-sm sm:min-h-9",
										"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
										answers[criterion.id] === result &&
											"border-primary bg-primary text-primary-foreground",
									)}
								>
									<input
										type="radio"
										className="sr-only"
										name={`playbook-${tradeId}-${criterion.id}`}
										checked={answers[criterion.id] === result}
										onChange={() =>
											setAnswers({ ...answers, [criterion.id]: result })
										}
									/>
									{RESULT_LABELS[result]}
								</label>
							))}
						</div>
					</div>
				))}
			</div>
			{strategy.riskGuidance && (
				<div className="space-y-1 text-sm">
					<p className="field-label">Risk guidance</p>
					<p className="whitespace-pre-wrap">{strategy.riskGuidance}</p>
					<p className="text-muted-foreground">
						{data.initialRiskPercent
							? `Recorded initial risk: ${Number(data.initialRiskPercent).toFixed(2)}%`
							: "No initial risk recorded."}
					</p>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-3">
				<Button
					className="min-h-11 sm:min-h-9"
					disabled={!isComplete || save.isPending}
					onClick={() => save.mutate()}
				>
					Save check
				</Button>
				{onCancel && (
					<Button
						variant="ghost"
						className="min-h-11 sm:min-h-9"
						onClick={onCancel}
					>
						Cancel
					</Button>
				)}
				{!isComplete && (
					<span className="text-xs text-muted-foreground">
						Answer each required criterion to save.
					</span>
				)}
			</div>
			{save.isError && (
				<p role="alert" className="text-sm text-destructive">
					{save.error.message}{" "}
					<Button variant="outline" size="sm" onClick={reload}>
						Reload
					</Button>
				</p>
			)}
		</div>
	);
}

function answersOf(check: PlaybookCheck): Answers {
	return Object.fromEntries(
		check.items.flatMap((item) =>
			item.result ? [[item.id, item.result]] : [],
		),
	);
}

function staleNotice(check: PlaybookCheck, strategy: Loaded["strategy"]) {
	const checked = `Checked against ${check.strategyName} v${check.criteriaVersion}.`;
	if (!strategy) return `${checked} The trade has no strategy now.`;
	if (strategy.id !== check.strategyId)
		return `${checked} The trade now uses ${strategy.name}.`;
	return `${checked} The playbook is now v${strategy.criteriaVersion}.`;
}
