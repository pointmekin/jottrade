import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Strategy } from "@/lib/playbook";
import { QueryKey } from "@/lib/query-keys";
import { archiveStrategy, deleteStrategy } from "@/server/strategyActions";

interface StrategyStatusActionsProps {
	strategy: Strategy;
	onChanged: (s: Strategy) => void;
	onDeleted: (id: number) => void;
}

export function StrategyStatusActions({
	strategy,
	onChanged,
	onDeleted,
}: StrategyStatusActionsProps) {
	const qc = useQueryClient();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const isArchived = !!strategy.archivedAt;

	const archiveMut = useMutation({
		mutationFn: (archived: boolean) =>
			archiveStrategy({ data: { id: strategy.id, archived } }),
		onSuccess: (saved) => {
			qc.invalidateQueries({ queryKey: [QueryKey.Strategies] });
			setConfirmOpen(false);
			onChanged(saved);
		},
	});
	const deleteMut = useMutation({
		mutationFn: () => deleteStrategy({ data: { id: strategy.id } }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [QueryKey.Strategies] });
			setConfirmOpen(false);
			onDeleted(strategy.id);
		},
	});

	return (
		<div className="flex flex-wrap gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-11 sm:h-8"
				disabled={archiveMut.isPending}
				onClick={() => archiveMut.mutate(!isArchived)}
			>
				{isArchived ? (
					<>
						<ArchiveRestore className="size-4" /> Restore
					</>
				) : (
					<>
						<Archive className="size-4" /> Archive
					</>
				)}
			</Button>
			<AlertDialog
				open={confirmOpen}
				onOpenChange={(open) => {
					setConfirmOpen(open);
					deleteMut.reset();
				}}
			>
				<AlertDialogTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-11 text-destructive sm:h-8"
					>
						<Trash2 className="size-4" /> Delete
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent className="rounded-sm border-border bg-popover text-popover-foreground">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete strategy?</AlertDialogTitle>
						<AlertDialogDescription className="text-muted-foreground">
							{deleteMut.isError
								? deleteMut.error.message
								: `This deletes "${strategy.name}". You cannot undo this. If trades use it, archive it to keep their history.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{archiveMut.isError && (
						<p role="alert" className="text-sm text-destructive">
							{archiveMut.error.message}
						</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel className="border-border">
							Cancel
						</AlertDialogCancel>
						{deleteMut.isError && !isArchived ? (
							<Button
								disabled={archiveMut.isPending}
								onClick={() => archiveMut.mutate(true)}
							>
								Archive
							</Button>
						) : (
							<Button
								variant="destructive"
								disabled={deleteMut.isPending || deleteMut.isError}
								onClick={() => deleteMut.mutate()}
							>
								Delete
							</Button>
						)}
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{archiveMut.isError && !confirmOpen && (
				<p role="alert" className="basis-full text-sm text-destructive">
					{archiveMut.error.message}
				</p>
			)}
		</div>
	);
}
