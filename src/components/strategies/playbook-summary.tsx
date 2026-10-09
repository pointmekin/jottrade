import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlaybookCriterionKind, type Strategy } from "@/lib/playbook";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<PlaybookCriterionKind, string> = {
	[PlaybookCriterionKind.Entry]: "Entry criteria",
	[PlaybookCriterionKind.Invalidation]: "Invalidation criteria",
};

export function PlaybookSummary({ strategy }: { strategy: Strategy }) {
	const [isOpen, setIsOpen] = useState(false);
	const panelId = useId();
	const isEmpty = !strategy.criteria.length && !strategy.riskGuidance;
	return (
		<div className="space-y-2">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-expanded={isOpen}
				aria-controls={panelId}
				onClick={() => setIsOpen((open) => !open)}
				className="h-11 w-full justify-between px-2 sm:h-8"
			>
				{isOpen ? "Hide playbook" : "Show playbook"}
				<ChevronDown
					className={cn(
						"size-4 motion-safe:transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</Button>
			<div
				id={panelId}
				hidden={!isOpen}
				className="space-y-3 rounded-md border border-border bg-muted/25 p-3 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
			>
				{isEmpty && (
					<p className="text-muted-foreground">
						This playbook has no criteria yet.
					</p>
				)}
				{Object.values(PlaybookCriterionKind).map((kind) => {
					const items = strategy.criteria.filter(
						(criterion) => criterion.kind === kind,
					);
					if (!items.length) return null;
					return (
						<section key={kind} className="space-y-1">
							<h4 className="field-label">{KIND_LABELS[kind]}</h4>
							<ul className="list-disc space-y-1 pl-5">
								{items.map((criterion) => (
									<li key={criterion.id}>
										{criterion.text}
										{!criterion.required && (
											<span className="text-muted-foreground"> (optional)</span>
										)}
									</li>
								))}
							</ul>
						</section>
					);
				})}
				{strategy.riskGuidance && (
					<section className="space-y-1">
						<h4 className="field-label">Risk guidance</h4>
						<p className="whitespace-pre-wrap">{strategy.riskGuidance}</p>
					</section>
				)}
			</div>
		</div>
	);
}
