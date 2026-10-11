import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { insightReviewLine } from "@/lib/insight-review";
import type { DashboardSearch } from "@/lib/journal-search";
import { QueryKey } from "@/lib/query-keys";
import { ReviewKind } from "@/lib/review";
import { addReviewNextAction } from "@/server/reviewActions";

export function AddToReviewButton({
	text,
	search,
}: {
	text: string;
	search: Partial<DashboardSearch>;
}) {
	const router = useRouter();
	const scope = useSearch({ from: "/_authenticated/dashboard" });
	const navigate = useNavigate();
	const client = useQueryClient();
	const { activeAccount } = useAccounts();
	const portfolioId = activeAccount?.id;
	const add = useMutation({
		mutationFn: (accountId: number) => {
			const { href } = router.buildLocation({
				to: "/journal",
				search: { ...scope, ...search },
			});
			return addReviewNextAction({
				data: { portfolioId: accountId, line: insightReviewLine(text, href) },
			});
		},
		onSuccess: async ({ start, added }, accountId) => {
			await client.invalidateQueries({ queryKey: [QueryKey.ReviewPeriod] });
			toast.success(
				added
					? "Added to the next action of this week's review."
					: "This finding is already in this week's review.",
				{
					action: {
						label: "Open review",
						onClick: () =>
							navigate({
								to: "/reviews",
								search: { kind: ReviewKind.Weekly, start, account: accountId },
							}),
					},
				},
			);
		},
		onError: (error) =>
			toast.error(`Could not add to the review. ${error.message}`),
	});

	return (
		<Button
			variant="outline"
			size="sm"
			aria-label={`Add to next review: ${text}`}
			disabled={portfolioId === undefined || add.isPending}
			onClick={() => portfolioId !== undefined && add.mutate(portfolioId)}
		>
			<NotebookPen aria-hidden="true" />
			{add.isPending ? "Adding..." : "Add to next review"}
		</Button>
	);
}
