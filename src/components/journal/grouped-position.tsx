import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import type { Trade } from "@/lib/trade";
import {
	getPositionExecutions,
	ungroupPosition,
} from "@/server/positionActions";

interface GroupedPositionProps {
	trade: Trade;
	onUngrouped: () => void;
}

export function GroupedPosition({ trade, onUngrouped }: GroupedPositionProps) {
	const query = useQuery({
		queryKey: [QueryKey.PositionExecutions, trade.id],
		queryFn: () => getPositionExecutions({ data: { tradeId: trade.id } }),
		enabled: !trade.groupedIntoId,
	});
	if (trade.groupedIntoId)
		return (
			<p className="text-sm text-muted-foreground">
				This broker row is part of a grouped position.{" "}
				<Link
					to="/journal/$tradeId"
					params={{ tradeId: String(trade.groupedIntoId) }}
					className="text-foreground underline"
				>
					View position
				</Link>
			</p>
		);
	const legs = query.data?.legs ?? [];
	if (!legs.length) return null;
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<p className="text-sm">
				Grouped from {legs.length} broker rows:{" "}
				<span className="font-data tabular-nums">
					{legs.map((leg) => `Ticket ${leg.brokerTicket ?? leg.id}`).join(", ")}
				</span>
			</p>
			<UngroupButton tradeId={trade.id} onUngrouped={onUngrouped} />
		</div>
	);
}

function UngroupButton({
	tradeId,
	onUngrouped,
}: {
	tradeId: number;
	onUngrouped: () => void;
}) {
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);
	const ungroup = useMutation({
		mutationFn: () => ungroupPosition({ data: { tradeId } }),
		onSuccess: async () => {
			setIsOpen(false);
			await invalidateTradeQueries(queryClient);
			onUngrouped();
		},
	});
	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(next) => {
				if (ungroup.isPending) return;
				if (next) ungroup.reset();
				setIsOpen(next);
			}}
		>
			<AlertDialogTrigger asChild>
				<Button type="button" variant="outline" className="h-11 sm:h-9">
					Ungroup
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent className="border-border bg-popover text-popover-foreground">
				<AlertDialogHeader>
					<AlertDialogTitle>Ungroup this position?</AlertDialogTitle>
					<AlertDialogDescription>
						The position and its notes are removed. The broker rows show again
						as separate trades with their own notes and tags.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{ungroup.error && (
					<p role="alert" className="text-sm text-destructive">
						{ungroup.error.message}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={ungroup.isPending}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={ungroup.isPending}
						onClick={(event) => {
							event.preventDefault();
							ungroup.mutate();
						}}
					>
						{ungroup.isPending ? "Ungrouping…" : "Ungroup"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
