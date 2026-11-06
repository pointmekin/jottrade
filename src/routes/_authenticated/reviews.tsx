import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { z } from "zod";
import { AppPageHeader } from "@/components/app-page-header";
import { FirstTradeEmptyState } from "@/components/onboarding/first-trade-empty-state";
import { ReviewEditor } from "@/components/reviews/review-editor";
import {
	ReviewPreferences,
	useReviewPreferences,
} from "@/components/reviews/review-preferences";
import { ReviewTradeQueue } from "@/components/reviews/review-trade-queue";
import { ReviewsSkeleton } from "@/components/reviews/reviews-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccounts } from "@/hooks/use-accounts";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useReviewRouteAccount } from "@/hooks/use-review-route-account";
import { authClient } from "@/lib/auth-client";
import { nextDayKey, previousDayKey, toDayKey } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import { ReviewKind } from "@/lib/review";
import {
	formatReviewPeriod,
	reviewDaySchema,
	reviewPeriod,
} from "@/lib/review-period";
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

const KIND_LABEL: Record<ReviewKind, string> = {
	[ReviewKind.Daily]: "Daily",
	[ReviewKind.Weekly]: "Weekly",
};

function useReviewsPage() {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const preferences = useReviewPreferences();
	const { kind, day, account, start: savedStart } = Route.useSearch();
	const navigate = Route.useNavigate();
	const matchedAccount = useReviewRouteAccount(account);
	const timezone = preferences.data?.timezone;
	const selectedDay = day ?? toDayKey(new Date(), timezone ?? "UTC");
	const period = reviewPeriod(
		savedStart ?? selectedDay,
		kind,
		preferences.data?.weekStartsOn ?? 1,
	);
	const start = savedStart ?? period.periodStart;
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
	const reviewWindow = query.data?.window;
	const periodLabel = formatReviewPeriod(
		reviewWindow?.periodStart ?? start,
		reviewWindow?.periodEndExclusive ?? period.periodEndExclusive,
	);
	return {
		activeAccount,
		userId,
		portfolioId,
		kind,
		selectedDay,
		periodLabel,
		preferences,
		timezone,
		query,
		matchedAccount,
		navigate,
	};
}

type ReviewsPageState = ReturnType<typeof useReviewsPage>;

function ReviewsPage() {
	return <ReviewsContent {...useReviewsPage()} />;
}

function shiftDay(day: string, kind: ReviewKind, direction: 1 | -1) {
	const steps = kind === ReviewKind.Weekly ? 7 : 1;
	const step = direction === 1 ? nextDayKey : previousDayKey;
	let next = day;
	for (let index = 0; index < steps; index++) next = step(next);
	return next;
}

function PeriodToolbar({
	kind,
	selectedDay,
	portfolioId,
	navigate,
}: Pick<
	ReviewsPageState,
	"kind" | "selectedDay" | "portfolioId" | "navigate"
>) {
	const go = (nextKind: ReviewKind, nextDay: string) =>
		navigate({
			search: { kind: nextKind, day: nextDay, account: portfolioId },
		});
	const unit = kind === ReviewKind.Weekly ? "week" : "day";
	return (
		<>
			<Tabs
				value={kind}
				onValueChange={(value) => go(value as ReviewKind, selectedDay)}
			>
				<TabsList aria-label="Review">
					{Object.values(ReviewKind).map((value) => (
						<TabsTrigger key={value} value={value} className="px-3">
							{KIND_LABEL[value]}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Previous ${unit}`}
					onClick={() => go(kind, shiftDay(selectedDay, kind, -1))}
				>
					<ChevronLeft className="size-4" />
				</Button>
				<Input
					type="date"
					aria-label="Date"
					className="w-40 font-data"
					value={selectedDay}
					onChange={(event) => {
						if (reviewDaySchema.safeParse(event.target.value).success)
							go(kind, event.target.value);
					}}
				/>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Next ${unit}`}
					onClick={() => go(kind, shiftDay(selectedDay, kind, 1))}
				>
					<ChevronRight className="size-4" />
				</Button>
			</div>
		</>
	);
}

function RetryAlert({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div
			role="alert"
			className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 px-4 py-3 text-sm"
		>
			<p>{message}</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

function ReviewsBody({
	userId,
	portfolioId,
	kind,
	preferences,
	timezone,
	query,
	matchedAccount,
}: ReviewsPageState) {
	const { hasTrades } = useOnboarding();
	if (preferences.isError)
		return (
			<RetryAlert
				message="Review preferences could not be loaded."
				onRetry={() => preferences.refetch()}
			/>
		);
	if (preferences.isPending || hasTrades === undefined)
		return <ReviewsSkeleton />;
	if (!timezone)
		return (
			<div className="space-y-8">
				<ReviewPreferences />
				<ReviewTradeQueue key={`${userId}:${portfolioId}`} />
			</div>
		);
	if (hasTrades === false)
		return (
			<FirstTradeEmptyState
				icon={NotebookPen}
				title="Reviews start with a trade"
				description="Log a trade, then come back to write a short daily review of what you did."
			/>
		);
	return (
		<>
			{query.isError && (
				<RetryAlert
					message={query.error.message}
					onRetry={() => query.refetch()}
				/>
			)}
			{query.isPending && <ReviewsSkeleton />}
			{query.data && userId && portfolioId && matchedAccount && (
				<ReviewEditor
					key={`${userId}:${portfolioId}:${kind}:${query.data.window.periodStart}`}
					review={query.data}
					userId={userId}
					portfolioId={portfolioId}
					kind={kind}
				/>
			)}
			{!query.isPending && (
				<ReviewTradeQueue key={`${userId}:${portfolioId}`} />
			)}
		</>
	);
}

function ReviewsContent(state: ReviewsPageState) {
	const meta = [state.periodLabel, state.activeAccount?.name]
		.filter(Boolean)
		.join(" · ");
	return (
		<div className="app-page">
			<main className="page-frame section-enter">
				<AppPageHeader
					title="Reviews"
					meta={meta}
					toolbar={<PeriodToolbar {...state} />}
				/>
				<ReviewsBody {...state} />
			</main>
		</div>
	);
}
