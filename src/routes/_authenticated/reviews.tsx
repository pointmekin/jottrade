import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppPageHeader } from "@/components/app-page-header";
import { ReviewEditor } from "@/components/reviews/review-editor";
import {
	ReviewPreferences,
	useReviewPreferences,
} from "@/components/reviews/review-preferences";
import { ReviewTradeQueue } from "@/components/reviews/review-trade-queue";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { useReviewRouteAccount } from "@/hooks/use-review-route-account";
import { authClient } from "@/lib/auth-client";
import { toDayKey } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import { ReviewKind } from "@/lib/review";
import { reviewDaySchema, reviewPeriod } from "@/lib/review-period";
import { getReviewPeriod } from "@/server/reviewActions";

export const Route = createFileRoute("/_authenticated/reviews")({
	validateSearch: z.object({
		kind: z.enum(ReviewKind).default(ReviewKind.Daily),
		day: reviewDaySchema.optional(),
		start: reviewDaySchema.optional(),
		account: z.number().int().positive().optional(),
	}),
	component: ReviewsPage,
});
function useReviewsPage() {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const preferences = useReviewPreferences();
	const { kind, day, account, start: savedStart } = Route.useSearch();
	const navigate = Route.useNavigate();
	const matchedAccount = useReviewRouteAccount(account);
	const timezone = preferences.data?.timezone;
	const selectedDay = day ?? toDayKey(new Date(), timezone ?? "UTC");
	const start =
		savedStart ??
		reviewPeriod(selectedDay, kind, preferences.data?.weekStartsOn ?? 1)
			.periodStart;
	const portfolioId = activeAccount?.id;
	const userId = session?.user.id;
	const query = useQuery({
		queryKey: [QueryKey.ReviewPeriod, userId, portfolioId, kind, start],
		queryFn: () =>
			getReviewPeriod({
				data: { portfolioId: portfolioId as number, kind, start },
			}),
		enabled:
			!!userId && portfolioId !== undefined && !!timezone && matchedAccount,
	});
	return {
		activeAccount,
		userId,
		portfolioId,
		kind,
		selectedDay,
		preferences,
		timezone,
		query,
		matchedAccount,
		navigate,
	};
}
function ReviewsPage() {
	return <ReviewsContent {...useReviewsPage()} />;
}
function ReviewsContent({
	activeAccount,
	userId,
	portfolioId,
	kind,
	selectedDay,
	preferences,
	timezone,
	query,
	matchedAccount,
	navigate,
}: ReturnType<typeof useReviewsPage>) {
	return (
		<div className="app-page">
			<main className="page-frame space-y-5">
				<AppPageHeader
					title="Reviews"
					description="Turn recorded results into one change to revisit."
					meta={
						query.data
							? `${query.data.window.periodStart} to ${query.data.window.periodEndExclusive} exclusive · ${query.data.window.timezoneSnapshot} · ${activeAccount?.name}`
							: activeAccount?.name
					}
				/>
				<div className="flex flex-wrap gap-3">
					<label className="text-sm">
						Review{" "}
						<select
							className="ml-2 rounded border bg-background p-2"
							value={kind}
							onChange={(event) =>
								navigate({
									search: {
										kind: event.target.value as ReviewKind,
										day: selectedDay,
										account: portfolioId,
									},
								})
							}
						>
							<option value={ReviewKind.Daily}>Daily</option>
							<option value={ReviewKind.Weekly}>Weekly</option>
						</select>
					</label>
					<label className="text-sm">
						Date{" "}
						<input
							className="ml-2 rounded border bg-background p-2"
							type="date"
							value={selectedDay}
							onChange={(event) => {
								if (reviewDaySchema.safeParse(event.target.value).success)
									void navigate({
										search: {
											kind,
											day: event.target.value,
											account: portfolioId,
										},
									});
							}}
						/>
					</label>
				</div>
				{preferences.isError && (
					<p role="alert">
						Preferences could not be loaded.{" "}
						<Button onClick={() => preferences.refetch()}>Retry</Button>
					</p>
				)}
				{!timezone && <ReviewPreferences />}
				{timezone && query.isPending && <p>Loading review...</p>}
				{query.isError && (
					<p role="alert">
						{query.error.message}{" "}
						<Button variant="outline" onClick={() => query.refetch()}>
							Retry
						</Button>
					</p>
				)}
				{query.data && userId && portfolioId && matchedAccount && (
					<ReviewEditor
						key={`${userId}:${portfolioId}:${kind}:${query.data.window.periodStart}`}
						review={query.data}
						userId={userId}
						portfolioId={portfolioId}
						kind={kind}
					/>
				)}
				<ReviewTradeQueue key={`${userId}:${portfolioId}`} />
			</main>
		</div>
	);
}
