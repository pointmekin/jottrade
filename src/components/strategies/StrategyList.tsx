import { Plus, Target } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { Strategy } from "@/lib/playbook";

interface StrategyListProps {
	strategies: Strategy[];
	selectedId: number | null;
	onSelect: (s: Strategy) => void;
	onCreate: () => void;
}

export function StrategyList({
	strategies,
	selectedId,
	onSelect,
	onCreate,
}: StrategyListProps) {
	if (!strategies.length) {
		return (
			<EmptyState
				icon={Target}
				title="No strategies yet"
				description="Name the setups you trade, then tag trades to see which ones pay."
				action={
					<Button onClick={onCreate}>
						<Plus className="size-4" /> Create a strategy
					</Button>
				}
			/>
		);
	}

	const active = strategies.filter((s) => !s.archivedAt);
	const archived = strategies.filter((s) => s.archivedAt);
	const items = (list: Strategy[]) => (
		<ul className="m-0 list-none p-0">
			{list.map((s) => (
				<li key={s.id} className="border-b border-border last:border-b-0">
					<button
						type="button"
						aria-current={selectedId === s.id || undefined}
						className={`w-full min-w-0 cursor-pointer px-3 py-2 text-left transition-colors
						${selectedId === s.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/45"}`}
						onClick={() => onSelect(s)}
					>
						<p className="truncate text-sm font-semibold">{s.name}</p>
						{s.description && (
							<p className="truncate text-xs text-muted-foreground">
								{s.description}
							</p>
						)}
					</button>
				</li>
			))}
		</ul>
	);

	return (
		<>
			{items(active)}
			{archived.length > 0 && (
				<details className="mt-3">
					<summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
						Archived ({archived.length})
					</summary>
					{items(archived)}
				</details>
			)}
		</>
	);
}
