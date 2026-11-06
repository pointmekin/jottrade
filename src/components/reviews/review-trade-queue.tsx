import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import { toDayKey } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import { REVIEW_QUEUE_PAGE_SIZE } from "@/lib/review";
import { getReviewQueue } from "@/server/reviewQueueActions";
import { useReviewPreferences } from "./review-preferences";
import { QueueRowsSkeleton } from "./reviews-skeleton";
export function ReviewTradeQueue() {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const preferences = useReviewPreferences();
	const openTradesId = useId();
	const [openTrades, setOpenTrades] = useState(false);
	const [page, setPage] = useState(1);
	const portfolioId = activeAccount?.id;
	const query = useQuery({
		queryKey: [
			QueryKey.ReviewQueue,
			session?.user.id,
			portfolioId,
			openTrades,
			page,
		],
		queryFn: () =>
			getReviewQueue({
				data: { portfolioId: portfolioId as number, openTrades, page },
			}),
		enabled: !!session?.user.id && portfolioId !== undefined,
	});
	const total = query.data?.total;
	return (
		<section
			className="page-section space-y-3"
			aria-label="Awaiting trade review"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-base font-semibold">
					Awaiting trade review
					{total !== undefined && (
						<span className="ml-2 font-data text-sm font-normal text-muted-foreground">
							{total}
						</span>
					)}
				</h2>
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Checkbox
						id={openTradesId}
						checked={openTrades}
						onCheckedChange={(checked) => {
							setOpenTrades(checked === true);
							setPage(1);
						}}
					/>
					<label htmlFor={openTradesId}>Include open and pending trades</label>
				</div>
			</div>
			{query.isPending && <QueueRowsSkeleton />}
			{query.isError && (
				<div role="alert" className="flex items-center gap-3 text-sm">
					<p>Queue could not be loaded.</p>
					<Button variant="outline" size="sm" onClick={() => query.refetch()}>
						Retry
					</Button>
				</div>
			)}
			{total === 0 && (
				<p className="text-sm text-muted-foreground">
					Nothing to review. Every trade in this view is reviewed.
				</p>
			)}
			{query.data && total !== undefined && total > 0 && (
				<>
					<ul className="divide-y divide-border">
						{query.data.trades.map((trade) => (
							<li key={trade.id}>
								<Link
									className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent"
									to="/journal/$tradeId"
									params={{ tradeId: String(trade.id) }}
								>
									<span className="flex min-w-0 items-center gap-2">
										<span className="truncate font-medium">{trade.symbol}</span>
										{trade.reviewedAt && (
											<span className="status-pill bg-warning/15 text-foreground">
												Execution changed
											</span>
										)}
									</span>
									<span className="flex shrink-0 items-center gap-1 font-data text-muted-foreground">
										{toDayKey(
											trade.realizedAt,
											preferences.data?.timezone ?? "UTC",
										)}
										<ChevronRight className="size-4" />
									</span>
								</Link>
							</li>
						))}
					</ul>
					{total > REVIEW_QUEUE_PAGE_SIZE && (
						<div className="flex items-center justify-end gap-2">
							<span className="mr-2 text-xs text-muted-foreground">
								Page {page} of {Math.ceil(total / REVIEW_QUEUE_PAGE_SIZE)}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={page === 1}
								onClick={() => setPage(page - 1)}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={page * REVIEW_QUEUE_PAGE_SIZE >= total}
								onClick={() => setPage(page + 1)}
							>
								Next
							</Button>
						</div>
					)}
				</>
			)}
		</section>
	);
}
