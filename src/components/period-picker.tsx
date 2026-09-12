import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	PERIOD_PRESET_LABELS,
	PERIOD_PRESET_ORDER,
	PeriodPreset,
	type PeriodSelection,
} from "@/lib/period";

interface PeriodPickerProps {
	value: PeriodSelection;
	onChange: (next: PeriodSelection) => void;
}

export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
	const preset = value.preset ?? PeriodPreset.All;
	const isCustom = preset === PeriodPreset.Custom;

	const selectPreset = (next: PeriodPreset) => {
		if (next === PeriodPreset.Custom) {
			onChange({ ...value, preset: next });
			return;
		}
		onChange({ preset: next });
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Select
				value={preset}
				onValueChange={(next) => selectPreset(next as PeriodPreset)}
			>
				<SelectTrigger
					className="h-8 w-44 text-sm"
					aria-label="Reporting period"
				>
					<CalendarRange className="size-3.5 text-muted-foreground" />
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{PERIOD_PRESET_ORDER.map((option) => (
						<SelectItem key={option} value={option}>
							{PERIOD_PRESET_LABELS[option]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{isCustom && (
				<div className="flex items-center gap-2">
					<Input
						type="date"
						aria-label="Period start"
						value={value.from ?? ""}
						max={value.to || undefined}
						onChange={(e) =>
							onChange({ ...value, from: e.target.value || undefined })
						}
						className="h-8 w-40 text-sm"
					/>
					<span className="text-xs text-muted-foreground">to</span>
					<Input
						type="date"
						aria-label="Period end"
						value={value.to ?? ""}
						min={value.from || undefined}
						onChange={(e) =>
							onChange({ ...value, to: e.target.value || undefined })
						}
						className="h-8 w-40 text-sm"
					/>
				</div>
			)}
		</div>
	);
}
