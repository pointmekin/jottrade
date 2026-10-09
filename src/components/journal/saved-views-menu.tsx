import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check } from "lucide-react";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/use-accounts";
import { useAppliedView, useSavedViews } from "@/hooks/use-saved-views";
import { CLEARED_TRADE_FILTERS } from "@/lib/journal-search";
import { QueryKey } from "@/lib/query-keys";
import {
	pickViewScope,
	SAVED_VIEW_LIMIT,
	SAVED_VIEW_NAME_MAX_LENGTH,
} from "@/lib/saved-view";
import {
	createSavedView,
	deleteSavedView,
	renameSavedView,
	type SavedView,
	updateSavedViewScope,
} from "@/server/savedViewActions";
import type { JournalFilters } from "./FilterBar";

const ViewDialog = {
	Save: "save",
	Rename: "rename",
	Delete: "delete",
} as const;

type ViewDialog = (typeof ViewDialog)[keyof typeof ViewDialog];

interface SavedViewsMenuProps {
	filters: JournalFilters;
	update: (patch: Partial<JournalFilters>) => void;
}

function useViewChange<Variables, Result>(
	failure: string,
	run: (variables: Variables) => Promise<Result>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: [QueryKey.SavedViews] }),
		onError: (error) => toast.error(failure, { description: error.message }),
	});
}

function ViewNameDialog({
	title,
	initialName,
	pinLabel,
	isPending,
	returnFocus,
	onClose,
	onSubmit,
}: {
	title: string;
	initialName: string;
	pinLabel?: string;
	isPending: boolean;
	returnFocus: RefObject<HTMLButtonElement | null>;
	onClose: () => void;
	onSubmit: (name: string, isPinned: boolean) => void;
}) {
	const nameId = useId();
	const [name, setName] = useState(initialName);
	const [isPinned, setIsPinned] = useState(false);
	const submit = (event: FormEvent) => {
		event.preventDefault();
		onSubmit(name, isPinned);
	};
	return (
		<Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
			<DialogContent
				className="bg-card sm:max-w-sm"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					returnFocus.current?.focus();
				}}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						A view keeps the period and the filters. It does not keep the sort.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor={nameId}>Name</Label>
						<Input
							id={nameId}
							value={name}
							required
							maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					{pinLabel && (
						<Label className="flex items-center gap-2 font-normal">
							<Checkbox
								checked={isPinned}
								onCheckedChange={(checked) => setIsPinned(checked === true)}
							/>
							{pinLabel}
						</Label>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							Save view
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function viewDetail(view: SavedView, accounts: { id: number; name: string }[]) {
	if (view.accountRemoved) return "Account removed; uses the active account";
	const account = accounts.find((item) => item.id === view.portfolioId);
	return account && `Opens ${account.name}`;
}

export function SavedViewsMenu({ filters, update }: SavedViewsMenuProps) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [dialog, setDialog] = useState<ViewDialog>();
	const closeDialog = () => setDialog(undefined);
	const { data: views = [], isPending, isError, refetch } = useSavedViews();
	const { view: applied, isModified } = useAppliedView(filters);
	const { accounts, activeAccount, setActiveAccount } = useAccounts();
	const save = useViewChange(
		"The view was not saved.",
		(input: { name: string; isPinned: boolean }) =>
			createSavedView({
				data: {
					name: input.name,
					scope: pickViewScope(filters),
					portfolioId: input.isPinned ? (activeAccount?.id ?? null) : null,
				},
			}),
	);
	const rename = useViewChange(
		"The view was not renamed.",
		(input: { id: number; name: string }) => renameSavedView({ data: input }),
	);
	const updateScope = useViewChange(
		"The view was not updated.",
		(view: SavedView) =>
			updateSavedViewScope({
				data: {
					id: view.id,
					scope: pickViewScope(filters),
					portfolioId:
						view.portfolioId === null
							? null
							: (activeAccount?.id ?? view.portfolioId),
				},
			}),
	);
	const remove = useViewChange("The view was not deleted.", (id: number) =>
		deleteSavedView({ data: { id } }),
	);

	const apply = (view: SavedView) => {
		const accountId = view.portfolioId;
		if (
			accountId !== null &&
			accountId !== activeAccount?.id &&
			accounts.some((account) => account.id === accountId)
		)
			setActiveAccount(accountId);
		update({
			...CLEARED_TRADE_FILTERS,
			dateFrom: undefined,
			dateTo: undefined,
			...view.scope,
			savedView: view.id,
		});
		if (view.droppedFilters)
			toast.info(
				`${view.droppedFilters} filters in “${view.name}” no longer exist and were removed.`,
			);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						ref={triggerRef}
						variant="outline"
						size="sm"
						className="h-9 border-border bg-background"
					>
						<Bookmark className="mr-2 h-3.5 w-3.5" />
						Views
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-72">
					<DropdownMenuLabel>Saved views</DropdownMenuLabel>
					{isPending && (
						<DropdownMenuItem disabled>Loading views…</DropdownMenuItem>
					)}
					{isError && (
						<DropdownMenuItem onSelect={() => refetch()}>
							Views did not load. Try again
						</DropdownMenuItem>
					)}
					{!isPending && !isError && views.length === 0 && (
						<DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
					)}
					{views.map((view) => (
						<DropdownMenuItem
							key={view.id}
							className="flex-col items-start gap-0.5"
							onSelect={() => apply(view)}
						>
							<span className="flex w-full items-center gap-2">
								<span className="truncate">{view.name}</span>
								{view.id === applied?.id && (
									<Check aria-label="Applied" className="ml-auto size-3.5" />
								)}
							</span>
							<span className="text-xs text-muted-foreground">
								{viewDetail(view, accounts)}
							</span>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={views.length >= SAVED_VIEW_LIMIT}
						onSelect={() => setDialog(ViewDialog.Save)}
					>
						Save current as…
					</DropdownMenuItem>
					{applied && isModified && (
						<DropdownMenuItem onSelect={() => updateScope.mutate(applied)}>
							Update “{applied.name}”
						</DropdownMenuItem>
					)}
					{applied && (
						<>
							<DropdownMenuItem onSelect={() => setDialog(ViewDialog.Rename)}>
								Rename “{applied.name}”…
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog(ViewDialog.Delete)}
							>
								Delete “{applied.name}”…
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{dialog === ViewDialog.Save && (
				<ViewNameDialog
					title="Save current view"
					initialName=""
					pinLabel={activeAccount && `Always open in ${activeAccount.name}`}
					isPending={save.isPending}
					returnFocus={triggerRef}
					onClose={closeDialog}
					onSubmit={(name, isPinned) =>
						save.mutate(
							{ name, isPinned },
							{
								onSuccess: (view) => {
									update({ savedView: view.id });
									closeDialog();
								},
							},
						)
					}
				/>
			)}
			{dialog === ViewDialog.Rename && applied && (
				<ViewNameDialog
					title="Rename view"
					initialName={applied.name}
					isPending={rename.isPending}
					returnFocus={triggerRef}
					onClose={closeDialog}
					onSubmit={(name) =>
						rename.mutate({ id: applied.id, name }, { onSuccess: closeDialog })
					}
				/>
			)}
			<AlertDialog
				open={dialog === ViewDialog.Delete && Boolean(applied)}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete the view “{applied?.name}”?
						</AlertDialogTitle>
						<AlertDialogDescription>
							The filters on this screen stay. Only the saved view is deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() =>
								applied &&
								remove.mutate(applied.id, {
									onSuccess: () => update({ savedView: undefined }),
								})
							}
						>
							Delete view
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
