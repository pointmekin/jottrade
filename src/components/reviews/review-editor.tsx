import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReviewAutosave } from "@/hooks/use-review-autosave";
import { QueryKey } from "@/lib/query-keys";
import {
	REVIEW_FIELDS,
	type ReviewFields,
	type ReviewKind,
	ReviewStatus,
} from "@/lib/review";
import { sourceDiscrepancies } from "@/lib/review-discrepancies";
import { type RevisionedFields, reviewDraftKey } from "@/lib/review-draft";
import {
	getReviewPeriod,
	reopenReviewPeriod,
	saveReviewPeriod,
} from "@/server/reviewActions";
import { ReviewImportChanges } from "./review-import-changes";
import { ReviewResults } from "./review-results";
import { ReviewSaveStatus } from "./review-save-status";

type Review = Awaited<ReturnType<typeof getReviewPeriod>>;
const PROMPTS: Record<keyof ReviewFields, string> = {
	intent: "What was the plan?",
	execution: "What followed or broke the plan?",
	lesson: "What did you learn?",
	nextAction: "One improvement to take into the next review",
	notes: "Day / period notes",
	commitmentReflection: "How did the previous commitment go?",
};
function editableFields(review: Review): ReviewFields {
	return {
		intent: review.fields.intent,
		execution: review.fields.execution,
		lesson: review.fields.lesson,
		nextAction: review.fields.nextAction,
		notes: review.fields.notes,
		commitmentReflection: review.fields.commitmentReflection,
	};
}
export function ReviewEditor({
	review,
	userId,
	portfolioId,
	kind,
}: {
	review: Review;
	userId: string;
	portfolioId: number;
	kind: ReviewKind;
}) {
	const queryClient = useQueryClient();
	const start = review.window.periodStart;
	const scope = { portfolioId, kind, start };
	const completed = review.period?.status === ReviewStatus.Complete;
	const reload = useCallback(async () => {
		const fresh = await getReviewPeriod({ data: { portfolioId, kind, start } });
		return { revision: fresh.revision, fields: editableFields(fresh) };
	}, [portfolioId, kind, start]);
	const save = (draft: RevisionedFields<ReviewFields>) =>
		saveReviewPeriod({
			data: {
				...scope,
				fields: draft.fields,
				expectedRevision: draft.revision,
				complete: false,
			},
		});
	const autosave = useReviewAutosave(
		reviewDraftKey(userId, portfolioId, `${kind}:${start}`),
		{ revision: review.revision, fields: editableFields(review) },
		save,
		reload,
	);
	const mutation = useMutation({
		mutationFn: async () => {
			if (completed && review.period)
				return reopenReviewPeriod({
					data: {
						portfolioId,
						id: review.period.id,
						expectedRevision: review.revision,
					},
				});
			return saveReviewPeriod({
				data: {
					...scope,
					fields: autosave.fields,
					expectedRevision: autosave.revision,
					complete: true,
				},
			});
		},
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: [QueryKey.ReviewPeriod, userId, portfolioId],
			}),
	});
	return (
		<div className="grid gap-5 lg:grid-cols-2">
			<ReviewSummary review={review} completed={completed} />
			<section className="surface space-y-4 p-5">
				<h2 className="font-semibold">
					{completed ? "Completed review" : "Review notes"}
				</h2>
				<Link
					to="/reviews"
					search={{ kind, day: start, start, account: portfolioId }}
					className="text-xs underline"
				>
					Link to this account and period
				</Link>
				<p className="text-sm text-muted-foreground">
					Every prompt is optional. Completing this period does not mark its
					trades reviewed.
				</p>
				{review.previousCommitment && (
					<aside className="rounded border p-3 text-sm">
						<p className="font-medium">Previous weekly commitment</p>
						<p className="whitespace-pre-wrap">{review.previousCommitment}</p>
					</aside>
				)}
				{REVIEW_FIELDS.map((field) => (
					<div key={field} className="space-y-2">
						<label className="text-sm" htmlFor={`review-${field}`}>
							{PROMPTS[field]}
						</label>
						<Textarea
							id={`review-${field}`}
							value={completed ? review.fields[field] : autosave.fields[field]}
							readOnly={completed}
							maxLength={10000}
							onChange={(event) =>
								autosave.edit({
									...autosave.fields,
									[field]: event.target.value,
								})
							}
							onBlur={() => {
								void autosave.flush();
							}}
						/>
					</div>
				))}
				{!completed && (
					<ReviewSaveStatus
						{...autosave}
						retry={() => {
							void autosave.flush();
						}}
						reload={() => {
							void autosave.reload();
						}}
						serverText={JSON.stringify(autosave.serverFields, null, 2)}
					/>
				)}
				{completed && autosave.status !== "saved" && (
					<p role="alert" className="text-sm">
						A pending draft is kept on this device. This completed review shows
						saved text. Copy the draft or reopen the review to revise it.
					</p>
				)}
				{(autosave.status === "storage-error" ||
					(completed && autosave.status !== "saved")) && (
					<Button
						variant="outline"
						onClick={() =>
							navigator.clipboard.writeText(
								JSON.stringify(autosave.fields, null, 2),
							)
						}
					>
						Copy review text
					</Button>
				)}
				<Button
					disabled={
						mutation.isPending ||
						(!completed &&
							(autosave.status !== "saved" ||
								review.currency !== review.liveCurrency))
					}
					onClick={() => mutation.mutate()}
				>
					{completed ? "Reopen review" : "Complete period review"}
				</Button>
				{mutation.isError && (
					<p role="alert" className="text-sm text-destructive">
						{mutation.error.message}
					</p>
				)}
			</section>
		</div>
	);
}
function ReviewSummary({
	review,
	completed,
}: {
	review: Review;
	completed: boolean;
}) {
	const tradeChanges = sourceDiscrepancies(
		review.sources.trades,
		review.tradeLinks,
	);
	const flowChanges = sourceDiscrepancies(
		review.sources.flows,
		review.flowLinks,
	);
	const currencyChanged = review.currency !== review.liveCurrency;
	const changes =
		tradeChanges.added +
		tradeChanges.changed +
		tradeChanges.removed +
		flowChanges.added +
		flowChanges.changed +
		flowChanges.removed;
	return (
		<div className="space-y-4">
			<ReviewResults
				results={
					completed && review.period?.resultSnapshot
						? review.period.resultSnapshot
						: review.sources.results
				}
				currency={completed ? review.currency : review.liveCurrency}
				label={completed ? "Results when completed" : "Current period results"}
			/>
			{currencyChanged && (
				<p role="alert" className="surface p-4 text-sm">
					Saved currency: {review.currency}. Current account currency:{" "}
					{review.liveCurrency}. Live and saved amounts use different currencies
					and cannot be compared directly.
				</p>
			)}
			{completed && (changes > 0 || currencyChanged) && (
				<section className="surface space-y-2 p-4">
					<p className="text-sm">
						Current records differ from this completed review.{" "}
						{tradeChanges.added} trades and {flowChanges.added} cash flows
						added; {tradeChanges.changed + flowChanges.changed} changed;{" "}
						{tradeChanges.removed + flowChanges.removed} moved outside the
						period. The completed snapshot is retained.
					</p>
					<ReviewImportChanges changes={review.importChanges} />
					<ReviewResults
						results={review.sources.results}
						currency={review.liveCurrency}
						label="Current period results"
					/>
				</section>
			)}
			<ReviewSources review={review} completed={completed} />
		</div>
	);
}
function ReviewSources({
	review,
	completed,
}: {
	review: Review;
	completed: boolean;
}) {
	const trades = completed
		? review.tradeLinks
				.filter((link) => link.includedInSnapshot)
				.map((link) => link.snapshot)
		: review.sources.trades;
	const flows = completed
		? review.flowLinks
				.filter((link) => link.includedInSnapshot)
				.map((link) => link.snapshot)
		: review.sources.flows;
	return (
		<section className="surface space-y-3 p-4">
			<h2 className="font-semibold">Source records</h2>
			{trades.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No trades in this period. You can still write notes and complete a
					review.
				</p>
			)}
			<ul className="divide-y">
				{trades.map((trade) => (
					<li key={trade.id} className="py-2">
						<Link
							to="/journal/$tradeId"
							params={{ tradeId: String(trade.id) }}
							className="text-sm underline"
						>
							{trade.symbol} · Trade #{trade.id}
						</Link>
						{trade.executionFacts && (
							<details className="text-xs">
								<summary>Execution facts</summary>
								<pre className="overflow-auto whitespace-pre-wrap">
									{JSON.stringify(trade.executionFacts, null, 2)}
								</pre>
							</details>
						)}
						{trade.notes && (
							<p className="whitespace-pre-wrap text-xs text-muted-foreground">
								{trade.notes}
							</p>
						)}
					</li>
				))}
			</ul>
			{flows.length > 0 && (
				<>
					<h3 className="text-sm font-medium">Cash-flow sources</h3>
					<ul className="space-y-2 text-xs">
						{flows.map((flow) => (
							<li key={flow.id}>
								#{flow.id} · {flow.kind} · {flow.amount}{" "}
								{completed ? review.currency : review.liveCurrency}
								{flow.brokerFacts && (
									<details>
										<summary>Adjustment facts</summary>
										<pre className="overflow-auto whitespace-pre-wrap">
											{JSON.stringify(flow.brokerFacts, null, 2)}
										</pre>
									</details>
								)}
								{flow.note && (
									<p className="text-muted-foreground">{flow.note}</p>
								)}
							</li>
						))}
					</ul>
				</>
			)}
		</section>
	);
}
