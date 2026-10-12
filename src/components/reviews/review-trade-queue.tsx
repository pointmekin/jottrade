import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import { toDayKey } from "@/lib/date";
import { QueryKey } from "@/lib/query-keys";
import { getReviewQueue } from "@/server/reviewQueueActions";
import { useReviewPreferences } from "./review-preferences";
export function ReviewTradeQueue() {
	const { activeAccount } = useAccounts();
	const { data: session } = authClient.useSession();
	const preferences = useReviewPreferences();
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
	return (
		<section className="surface space-y-3 p-4">
			<h2 className="font-semibold">Awaiting trade review</h2>
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={openTrades}
					onChange={(event) => {
						setOpenTrades(event.target.checked);
						setPage(1);
					}}
				/>
				Show open / pending trades
			</label>
			{query.isPending && <p>Loading trades...</p>}
			{query.isError && (
				<p role="alert">
					Queue could not be loaded.{" "}
					<Button variant="outline" onClick={() => query.refetch()}>
						Retry
					</Button>
				</p>
			)}
			{query.data?.total === 0 && (
				<p className="text-sm text-muted-foreground">
					No trades awaiting review in this view.
				</p>
			)}
			{query.data && (
				<>
					<p className="text-xs text-muted-foreground">
						{query.data.total} awaiting review
					</p>
					<ul className="divide-y">
						{query.data.trades.map((trade) => (
							<li key={trade.id} className="py-2">
								<Link
									className="text-sm underline"
									to="/journal/$tradeId"
									params={{ tradeId: String(trade.id) }}
								>
									{trade.symbol} ·{" "}
									{toDayKey(
										trade.realizedAt,
										preferences.data?.timezone ?? "UTC",
									)}{" "}
									{trade.reviewedAt ? "· Execution changed" : ""}
								</Link>
							</li>
						))}
					</ul>
					<div className="flex gap-2">
						<Button
							variant="outline"
							disabled={page === 1}
							onClick={() => setPage(page - 1)}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							disabled={page * 50 >= query.data.total}
							onClick={() => setPage(page + 1)}
						>
							Next
						</Button>
					</div>
				</>
			)}
		</section>
	);
}
