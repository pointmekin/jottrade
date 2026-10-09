import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppPageHeader } from "@/components/app-page-header";
import { StrategyForm } from "@/components/strategies/StrategyForm";
import { StrategyList } from "@/components/strategies/StrategyList";
import { StrategyStatusActions } from "@/components/strategies/strategy-status-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Strategy } from "@/lib/playbook";
import { QueryKey } from "@/lib/query-keys";
import { getStrategies } from "@/server/strategyActions";

export const Route = createFileRoute("/_authenticated/strategies")({
	component: StrategiesPage,
});

function StrategiesPage() {
	const [selected, setSelected] = useState<Strategy | null>(null);
	const [creating, setCreating] = useState(false);

	const { data: strategyList = [], isLoading } = useQuery({
		queryKey: [QueryKey.Strategies],
		queryFn: () => getStrategies({ data: undefined }),
	});

	const handleSelect = (s: Strategy) => {
		setSelected(s);
		setCreating(false);
	};
	const handleNew = () => {
		setSelected(null);
		setCreating(true);
	};
	const handleSaved = (s: Strategy) => {
		setSelected(s);
		setCreating(false);
	};
	const handleDeleted = (id: number) => {
		if (selected?.id === id) {
			setSelected(null);
			setCreating(false);
		}
	};

	const showForm = creating || !!selected;

	return (
		<div className="app-page">
			<main className="page-frame section-enter">
				<AppPageHeader
					title="Strategies"
					description="Define the setups you trade, then compare how each one performs."
					meta={`${strategyList.length} recorded setups`}
					actions={
						<Button onClick={handleNew}>
							<Plus className="h-4 w-4 mr-2" />
							New Strategy
						</Button>
					}
				/>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
					<div className="surface p-4">
						{isLoading ? (
							<div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
								Loading...
							</div>
						) : (
							<StrategyList
								strategies={strategyList}
								selectedId={selected?.id ?? null}
								onSelect={handleSelect}
								onCreate={handleNew}
							/>
						)}
					</div>

					<div className="surface min-h-72 p-4">
						{showForm ? (
							<>
								<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
									<h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
										{creating ? "New strategy" : "Edit strategy"}
										{selected?.archivedAt && (
											<Badge variant="secondary">Archived</Badge>
										)}
									</h2>
									{selected && (
										<StrategyStatusActions
											key={selected?.id ?? "new"}
											strategy={selected}
											onChanged={setSelected}
											onDeleted={handleDeleted}
										/>
									)}
								</div>
								<StrategyForm strategy={selected} onSaved={handleSaved} />
							</>
						) : (
							<div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
								Select a strategy to edit, or create a new one.
							</div>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}
