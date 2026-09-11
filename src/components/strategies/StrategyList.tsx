import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import { deleteStrategy } from "@/server/strategyActions";

type Strategy = { id: number; name: string; description: string | null };

interface StrategyListProps {
	strategies: Strategy[];
	selectedId: number | null;
	onSelect: (s: Strategy) => void;
	onDeleted?: (id: number) => void;
}

export function StrategyList({
	strategies,
	selectedId,
	onSelect,
	onDeleted,
}: StrategyListProps) {
	const qc = useQueryClient();
	const deleteMut = useMutation({
		mutationFn: (id: number) => deleteStrategy({ data: { id } }),
		onSuccess: (_, id) => {
			qc.invalidateQueries({ queryKey: ["strategies"] });
			onDeleted?.(id);
		},
	});

	if (!strategies.length) {
		return (
			<div className="empty-field h-48 border-0 text-sm text-muted-foreground">
				No strategies yet. Create your first one.
			</div>
		);
	}

	return (
		<ul className="m-0 list-none p-0">
			{strategies.map((s) => (
				<li key={s.id} className="border-b border-border last:border-b-0">
					<div
						className={`group flex items-center justify-between transition-colors
						${selectedId === s.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/45"}`}
					>
						<button
							type="button"
							className="min-w-0 flex-1 cursor-pointer px-3 py-2 text-left"
							onClick={() => onSelect(s)}
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold">{s.name}</p>
								{s.description && (
									<p className="truncate text-xs text-muted-foreground">
										{s.description}
									</p>
								)}
							</div>
						</button>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 text-muted-foreground opacity-0 group-hover:text-destructive group-hover:opacity-100"
									onClick={(e) => e.stopPropagation()}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent className="rounded-sm border-border bg-popover text-popover-foreground">
								<AlertDialogHeader>
									<AlertDialogTitle>Delete strategy?</AlertDialogTitle>
									<AlertDialogDescription className="text-muted-foreground">
										All trades using "{s.name}" will have their strategy
										cleared. This cannot be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel className="border-border">
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										className="bg-destructive hover:bg-destructive/88"
										onClick={() => deleteMut.mutate(s.id)}
									>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</li>
			))}
		</ul>
	);
}
