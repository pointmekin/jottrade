import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { NO_STRATEGY } from "@/lib/journal-search";
import { QueryKey } from "@/lib/query-keys";
import { TradeConfidence, TradeSide, TradeStatus } from "@/lib/trade";
import { cn } from "@/lib/utils";
import { getStrategies } from "@/server/strategyActions";
import type { JournalFilters } from "./FilterBar";

const ALL = "__all__";

interface FilterFieldsProps {
	id: string;
	filters: JournalFilters;
	symbolInput: string;
	onSymbolInput: (value: string) => void;
	update: (patch: Partial<JournalFilters>) => void;
}

function ToggleButton({
	isPressed,
	label,
	onClick,
	children,
}: {
	isPressed: boolean;
	label?: string;
	onClick: () => void;
	children: string;
}) {
	return (
		<Button
			size="sm"
			variant="outline"
			className={cn(
				"h-9 flex-1 text-xs",
				isPressed
					? "border-ring bg-accent text-accent-foreground"
					: "text-muted-foreground",
			)}
			aria-pressed={isPressed}
			aria-label={label}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

const splitList = (value?: string) => (value ?? "").split(",").filter(Boolean);

const titleCase = (value: string) =>
	`${value[0]}${value.slice(1).toLowerCase()}`;

function LabeledSelect({
	labelId,
	label,
	value,
	onChange,
	options,
}: {
	labelId: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<div>
			<p id={labelId} className="field-label mb-1">
				{label}
			</p>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger
					className="h-9 bg-background text-sm"
					aria-labelledby={labelId}
				>
					<SelectValue placeholder="All" />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function FilterFields({
	id,
	filters,
	symbolInput,
	onSymbolInput,
	update,
}: FilterFieldsProps) {
	const fieldId = useId();
	const { data: strategies = [] } = useQuery({
		queryKey: [QueryKey.Strategies],
		queryFn: () => getStrategies(),
	});
	const confidence = splitList(filters.confidence);
	const selectedConfidence = new Set(confidence);
	const toggleConfidence = (level: TradeConfidence) => {
		const next = selectedConfidence.has(level)
			? confidence.filter((value) => value !== level)
			: [...confidence, level];
		update({ confidence: next.join(",") || undefined });
	};

	return (
		<div
			id={id}
			className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-border bg-muted/25 py-3 md:grid-cols-4 md:py-4"
		>
			<div>
				<label htmlFor={`${fieldId}-symbol`} className="field-label mb-1 block">
					Symbol
				</label>
				<Input
					id={`${fieldId}-symbol`}
					value={symbolInput}
					onChange={(event) => onSymbolInput(event.target.value)}
					placeholder="AAPL"
					className="h-9 bg-background text-sm"
				/>
			</div>
			<fieldset className="min-w-0">
				<legend className="field-label mb-1">Side</legend>
				<div className="flex gap-1">
					{Object.values(TradeSide).map((side) => (
						<ToggleButton
							key={side}
							isPressed={filters.side === side}
							onClick={() =>
								update({ side: filters.side === side ? undefined : side })
							}
						>
							{side}
						</ToggleButton>
					))}
				</div>
			</fieldset>
			<LabeledSelect
				labelId={`${fieldId}-status`}
				label="Status"
				value={filters.status ?? ""}
				onChange={(value) =>
					update({
						status: value === ALL ? undefined : (value as TradeStatus),
					})
				}
				options={[
					{ value: ALL, label: "All" },
					...Object.values(TradeStatus).map((value) => ({
						value,
						label: value,
					})),
				]}
			/>
			<LabeledSelect
				labelId={`${fieldId}-strategy`}
				label="Strategy"
				value={filters.setupId ?? ""}
				onChange={(value) => update({ setupId: value || undefined })}
				options={[
					{ value: "", label: "All" },
					{ value: NO_STRATEGY, label: "No Strategy" },
					...strategies.map((s) => ({ value: String(s.id), label: s.name })),
				]}
			/>
			<fieldset className="min-w-0">
				<legend className="field-label mb-1">Confidence</legend>
				<div className="flex gap-1">
					{Object.values(TradeConfidence).map((level) => (
						<ToggleButton
							key={level}
							isPressed={selectedConfidence.has(level)}
							label={`${titleCase(level)} confidence`}
							onClick={() => toggleConfidence(level)}
						>
							{level[0]}
						</ToggleButton>
					))}
				</div>
			</fieldset>
		</div>
	);
}
