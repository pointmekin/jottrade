import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
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
import { accountsQueryKey } from "@/hooks/use-accounts";
import { deleteTrade } from "@/server/tradeActions";
import type { Trade } from "./JournalTable";

interface DeleteTradeDialogProps {
	trade: Pick<Trade, "id" | "symbol" | "side" | "entryDate">;
	onDeleted: () => void;
}

export function DeleteTradeDialog({
	trade,
	onDeleted,
}: DeleteTradeDialogProps) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const deleteMutation = useMutation({
		mutationFn: () => deleteTrade({ data: { id: trade.id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trades"] });
			queryClient.invalidateQueries({ queryKey: ["trade"] });
			queryClient.invalidateQueries({ queryKey: ["calendar"] });
			queryClient.invalidateQueries({ queryKey: ["analytics"] });
			queryClient.invalidateQueries({ queryKey: ["advanced-analytics"] });
			queryClient.invalidateQueries({ queryKey: accountsQueryKey });
			setOpen(false);
			onDeleted();
		},
	});

	const handleOpenChange = (nextOpen: boolean) => {
		if (deleteMutation.isPending) return;
		if (nextOpen) deleteMutation.reset();
		setOpen(nextOpen);
	};

	const errorMessage =
		deleteMutation.error instanceof Error
			? deleteMutation.error.message
			: "The trade could not be deleted. Please try again.";

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" type="button">
					<Trash2 className="h-4 w-4" />
					Delete trade
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent className="border-border bg-popover text-popover-foreground">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete trade?</AlertDialogTitle>
					<AlertDialogDescription>
						This will permanently delete the {trade.symbol} {trade.side} trade
						from {format(new Date(trade.entryDate), "MMM d, yyyy 'at' h:mm a")}.
						This cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{deleteMutation.isError && (
					<p role="alert" className="text-sm text-destructive">
						{errorMessage}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleteMutation.isPending}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={deleteMutation.isPending}
						onClick={(event) => {
							event.preventDefault();
							deleteMutation.mutate();
						}}
					>
						{deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
