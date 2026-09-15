import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountsQueryKey, useAccounts } from "@/hooks/use-accounts";
import { type AccountRecord, deleteAccount } from "@/server/portfolioActions";

interface DeleteAccountDialogProps {
	account: AccountRecord | null;
	onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({
	account,
	onOpenChange,
}: DeleteAccountDialogProps) {
	const queryClient = useQueryClient();
	const { activeAccount, clearActiveAccount } = useAccounts();
	const [confirmText, setConfirmText] = useState("");
	const confirmId = useId();

	const open = account !== null;
	const canDelete = account !== null && confirmText.trim() === account.name;

	const deleteMutation = useMutation({
		mutationFn: () => {
			if (!account) {
				return Promise.reject(new Error("No account selected."));
			}
			return deleteAccount({
				data: { id: account.id, confirmName: confirmText.trim() },
			});
		},
		onSuccess: () => {
			if (account && activeAccount?.id === account.id) clearActiveAccount();
			queryClient.invalidateQueries({ queryKey: accountsQueryKey });
			queryClient.invalidateQueries({ queryKey: ["trades"] });
			queryClient.invalidateQueries({ queryKey: ["trade"] });
			queryClient.invalidateQueries({ queryKey: ["cash-flows"] });
			queryClient.invalidateQueries({ queryKey: ["calendar"] });
			queryClient.invalidateQueries({ queryKey: ["analytics"] });
			queryClient.invalidateQueries({ queryKey: ["advanced-analytics"] });
			toast.success(`Deleted ${account?.name}`);
			setConfirmText("");
			onOpenChange(false);
		},
	});

	const handleOpenChange = (next: boolean) => {
		if (deleteMutation.isPending) return;
		if (!next) {
			deleteMutation.reset();
			setConfirmText("");
		}
		onOpenChange(next);
	};

	const errorMessage =
		deleteMutation.error instanceof Error
			? deleteMutation.error.message
			: "The account could not be deleted. Please try again.";

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent className="border-border bg-popover text-popover-foreground">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {account?.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently deletes the account, its{" "}
						{account?.tradeCount === 1
							? "1 trade"
							: `${account?.tradeCount ?? 0} trades`}
						, and all of its deposits, withdrawals, and adjustments. This cannot
						be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-1.5">
					<Label htmlFor={confirmId} className="field-label">
						Type{" "}
						<span className="font-data text-foreground">{account?.name}</span>{" "}
						to confirm
					</Label>
					<Input
						id={confirmId}
						value={confirmText}
						onChange={(event) => setConfirmText(event.target.value)}
						placeholder={account?.name}
						autoComplete="off"
						autoFocus
					/>
				</div>

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
						disabled={!canDelete || deleteMutation.isPending}
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
