import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ReviewSaveStatus } from "@/components/reviews/review-save-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/hooks/use-accounts";
import { useReviewAutosave } from "@/hooks/use-review-autosave";
import { authClient } from "@/lib/auth-client";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import { type RevisionedFields, reviewDraftKey } from "@/lib/review-draft";
import {
	getTradeReviewAnnotation,
	saveTradeReviewAnnotation,
} from "@/server/tradeReviewActions";

type Annotation = Awaited<ReturnType<typeof getTradeReviewAnnotation>>;
export function TradeReviewAnnotation({ tradeId }: { tradeId: number }) {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const portfolioId = activeAccount?.id;
	const userId = session?.user.id;
	const query = useQuery({
		queryKey: [QueryKey.TradeReviewAnnotation, userId, portfolioId, tradeId],
		queryFn: () =>
			getTradeReviewAnnotation({
				data: { portfolioId: portfolioId as number, id: tradeId },
			}),
		enabled: !!userId && portfolioId !== undefined,
	});
	if (query.isError)
		return (
			<p role="alert">
				Notes could not be loaded.{" "}
				<Button variant="outline" onClick={() => query.refetch()}>
					Retry
				</Button>
			</p>
		);
	if (!query.data || !userId || !portfolioId)
		return <p className="text-sm text-muted-foreground">Loading notes...</p>;
	return (
		<AnnotationEditor
			key={`${userId}:${portfolioId}:${tradeId}`}
			userId={userId}
			portfolioId={portfolioId}
			tradeId={tradeId}
			annotation={query.data}
		/>
	);
}
function AnnotationEditor({
	userId,
	portfolioId,
	tradeId,
	annotation,
}: {
	userId: string;
	portfolioId: number;
	tradeId: number;
	annotation: Annotation;
}) {
	const queryClient = useQueryClient();
	const scope = { portfolioId, id: tradeId };
	const reload = useCallback(
		() => getTradeReviewAnnotation({ data: { portfolioId, id: tradeId } }),
		[portfolioId, tradeId],
	);
	const save = async (draft: RevisionedFields<{ notes: string }>) => {
		const result = await saveTradeReviewAnnotation({
			data: {
				...scope,
				expectedRevision: draft.revision,
				notes: draft.fields.notes,
				review: "KEEP",
			},
		});
		await invalidateTradeQueries(queryClient);
		return result;
	};
	const autosave = useReviewAutosave(
		reviewDraftKey(userId, portfolioId, `trade:${tradeId}`),
		annotation,
		save,
		reload,
	);
	const review = useMutation({
		mutationFn: () =>
			saveTradeReviewAnnotation({
				data: {
					...scope,
					expectedRevision: autosave.revision,
					notes: autosave.fields.notes,
					review: annotation.reviewed ? "REOPEN" : "COMPLETE",
					expectedFingerprint: annotation.fingerprint,
				},
			}),
		onSuccess: () => invalidateTradeQueries(queryClient),
	});
	return (
		<section className="space-y-3">
			<label className="field-label" htmlFor={`trade-notes-${tradeId}`}>
				Notes and review
			</label>
			<Textarea
				id={`trade-notes-${tradeId}`}
				value={autosave.fields.notes}
				maxLength={20000}
				className="min-h-32"
				placeholder="Add your trade notes"
				onChange={(event) => autosave.edit({ notes: event.target.value })}
				onBlur={() => {
					void autosave.flush();
				}}
			/>
			<ReviewSaveStatus
				{...autosave}
				retry={() => {
					void autosave.flush();
				}}
				reload={() => {
					void autosave.reload();
				}}
				serverText={autosave.serverFields.notes}
			/>
			{autosave.status === "storage-error" && (
				<Button
					variant="outline"
					onClick={() => navigator.clipboard.writeText(autosave.fields.notes)}
				>
					Copy notes
				</Button>
			)}
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="outline"
					disabled={autosave.status !== "saved" || review.isPending}
					onClick={() => review.mutate()}
				>
					{annotation.reviewed ? "Mark unreviewed" : "Mark reviewed"}
				</Button>
				<span className="text-xs text-muted-foreground">
					{annotation.reviewed
						? "Reviewed current execution"
						: "Awaiting review"}
				</span>
			</div>
			{review.isError && (
				<p role="alert" className="text-sm text-destructive">
					{review.error.message}
				</p>
			)}
		</section>
	);
}
