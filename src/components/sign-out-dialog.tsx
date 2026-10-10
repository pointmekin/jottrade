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
import type { useSignOut } from "@/hooks/use-sign-out";

export function SignOutDialog({
	draftCount,
	signOut,
	cancel,
}: ReturnType<typeof useSignOut>) {
	const message =
		draftCount === 1
			? "1 draft on this device is not in your journal. Signing out deletes it."
			: `${draftCount} drafts on this device are not in your journal. Signing out deletes them.`;
	return (
		<AlertDialog
			open={draftCount > 0}
			onOpenChange={(open) => {
				if (!open) cancel();
			}}
		>
			<AlertDialogContent className="border-border bg-popover text-popover-foreground">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete drafts and sign out?</AlertDialogTitle>
					<AlertDialogDescription>{message}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="max-sm:h-11">Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						className="max-sm:h-11"
						onClick={() => {
							void signOut();
						}}
					>
						Delete drafts and sign out
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
