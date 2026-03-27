import { Button } from "@/components/ui/button";
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
import { Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
			<div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm">
				No strategies yet. Create your first one.
			</div>
		);
	}

	return (
		<ul className="space-y-1">
			{strategies.map((s) => (
				<li
					key={s.id}
					className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group
            ${selectedId === s.id ? "bg-zinc-800" : "hover:bg-zinc-900"}`}
					onClick={() => onSelect(s)}
				>
					<div className="min-w-0">
						<p className="text-sm font-medium text-white truncate">{s.name}</p>
						{s.description && (
							<p className="text-xs text-zinc-500 truncate">{s.description}</p>
						)}
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
								onClick={(e) => e.stopPropagation()}
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
							<AlertDialogHeader>
								<AlertDialogTitle>Delete strategy?</AlertDialogTitle>
								<AlertDialogDescription className="text-zinc-400">
									All trades using "{s.name}" will have their strategy cleared.
									This cannot be undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel className="border-zinc-700">
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									className="bg-red-600 hover:bg-red-700"
									onClick={() => deleteMut.mutate(s.id)}
								>
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</li>
			))}
		</ul>
	);
}
