import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppPageHeader } from "@/components/app-page-header";
import { StrategyForm } from "@/components/strategies/StrategyForm";
import { StrategyList } from "@/components/strategies/StrategyList";
import { Button } from "@/components/ui/button";
import { getStrategies } from "@/server/strategyActions";

export const Route = createFileRoute("/_authenticated/strategies")({
	component: StrategiesPage,
});

type Strategy = { id: number; name: string; description: string | null };

function StrategiesPage() {
	const [selected, setSelected] = useState<Strategy | null>(null);
	const [creating, setCreating] = useState(false);

	const { data: strategyList = [], isLoading } = useQuery({
		queryKey: ["strategies"],
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
					{/* Left panel */}
					<div className="surface p-4">
						{isLoading ? (
							<div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
								Loading...
							</div>
						) : (
							<StrategyList
								strategies={strategyList as Strategy[]}
								selectedId={selected?.id ?? null}
								onSelect={handleSelect}
								onDeleted={handleDeleted}
							/>
						)}
					</div>

					{/* Right panel */}
					<div className="surface min-h-72 p-4">
						{showForm ? (
							<>
								<h2 className="text-lg font-semibold text-foreground mb-6">
									{creating ? "New strategy" : "Edit strategy"}
								</h2>
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
