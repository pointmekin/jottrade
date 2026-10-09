import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { NO_STRATEGY } from "@/lib/journal-search";
import { strategyLabel } from "@/lib/playbook";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import { type Trade, TradeConfidence } from "@/lib/trade";
import { getStrategies } from "@/server/strategyActions";
import { updateTrade } from "@/server/tradeActions";

const MISTAKE_OPTIONS = [
	"FOMO",
	"Revenge Trading",
	"Oversize Position",
	"Early Exit",
	"Late Exit",
	"No Trading Plan",
	"Moved Stop Loss",
];
const NO_MISTAKE = "__none__";
const INPUT_CLASS = "border-input bg-background font-data text-sm";

const overviewSchema = z.object({
	entryPrice: z.string(),
	targetPrice: z.string().optional(),
	exitPrice: z.string().optional(),
	exitDate: z.string().optional(),
	exitQuoteToAccountRate: z.string().optional(),
	managementStopPrice: z.string().optional(),
	quantity: z.string(),
	fees: z.string().optional(),
	confidence: z.enum(TradeConfidence).optional(),
	mistake: z.string().optional(),
	setupId: z.string().optional(),
});
type OverviewValues = z.infer<typeof overviewSchema>;

function FieldGroup({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	const labelId = useId();
	return (
		<fieldset aria-labelledby={labelId} className="min-w-0 space-y-1.5">
			<Label id={labelId} className="field-label">
				{label}
			</Label>
			{children}
		</fieldset>
	);
}

function OptionSelect({
	value,
	onChange,
	placeholder,
	options,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	options: { value: string; label: string }[];
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className="border-input bg-background">
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem
						key={option.value}
						value={option.value}
						className="focus:bg-accent"
					>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

const valuesOf = (trade: Trade): OverviewValues => ({
	entryPrice: trade.entryPrice ?? "",
	targetPrice: trade.targetPrice ?? "",
	exitPrice: trade.exitPrice ?? "",
	exitDate: trade.exitDate?.toISOString().slice(0, 16) ?? "",
	exitQuoteToAccountRate: trade.exitQuoteToAccountRate ?? "",
	managementStopPrice: trade.managementStopPrice ?? "",
	quantity: trade.quantity ?? "",
	fees: trade.fees ?? "",
	confidence: trade.confidence ?? undefined,
	mistake: trade.mistake ?? undefined,
	setupId: trade.setupId?.toString() ?? NO_STRATEGY,
});

export function TradeOverviewForm({ trade }: { trade: Trade }) {
	// React Compiler caches register("field") on the stable register identity,
	// so a new trade would keep the previous values in the DOM.
	"use no memo";

	const queryClient = useQueryClient();
	const { data: strategies = [] } = useQuery({
		queryKey: [QueryKey.Strategies],
		queryFn: () => getStrategies(),
	});
	const { register, handleSubmit, setValue, watch } = useForm<OverviewValues>({
		resolver: zodResolver(overviewSchema),
		values: valuesOf(trade),
	});
	const save = useMutation({
		mutationFn: ({ setupId, ...values }: OverviewValues) =>
			updateTrade({
				data: {
					id: trade.id,
					expectedRevision: trade.editRevision,
					...values,
					exitDate: values.exitDate
						? overviewExitDate(values.exitDate, trade.exitDate)
						: undefined,
					setupId: setupId === NO_STRATEGY ? null : Number(setupId),
				},
			}),
		onSuccess: () => invalidateTradeQueries(queryClient),
	});

	return (
		<form
			onSubmit={handleSubmit((values) => save.mutate(values))}
			className="space-y-4"
		>
			<div className="grid grid-cols-2 gap-3">
				<FieldGroup label="Entry Price">
					<Input
						{...register("entryPrice")}
						readOnly={Boolean(trade.initialRiskSnapshot)}
						className={INPUT_CLASS}
					/>
					{trade.initialRiskSnapshot && (
						<p className="text-xs text-muted-foreground">
							Use Correct original plan to change recorded entry facts.
						</p>
					)}
				</FieldGroup>
				<FieldGroup label="Planned target price">
					<Input
						type="number"
						min="0"
						step="any"
						{...register("targetPrice")}
						className={INPUT_CLASS}
					/>
				</FieldGroup>
				<FieldGroup label="Exit Price">
					<Input {...register("exitPrice")} className={INPUT_CLASS} />
				</FieldGroup>
				<FieldGroup label="Management stop price">
					<Input {...register("managementStopPrice")} className={INPUT_CLASS} />
				</FieldGroup>
				<FieldGroup label="Exit date (UTC)">
					<Input
						type="datetime-local"
						{...register("exitDate")}
						className={INPUT_CLASS}
					/>
				</FieldGroup>
				<FieldGroup label="Exit FX rate">
					<Input
						{...register("exitQuoteToAccountRate")}
						className={INPUT_CLASS}
					/>
				</FieldGroup>
				<FieldGroup label="Quantity">
					<Input {...register("quantity")} className={INPUT_CLASS} />
				</FieldGroup>
				<FieldGroup label="Fees">
					<Input {...register("fees")} className={INPUT_CLASS} />
				</FieldGroup>
			</div>
			<FieldGroup label="Confidence">
				<OptionSelect
					value={watch("confidence") ?? ""}
					onChange={(value) => setValue("confidence", value as TradeConfidence)}
					placeholder="Select confidence"
					options={Object.values(TradeConfidence).map((value) => ({
						value,
						label: value,
					}))}
				/>
			</FieldGroup>
			<FieldGroup label="Mistake">
				<OptionSelect
					value={watch("mistake") ?? ""}
					onChange={(value) => setValue("mistake", value)}
					placeholder="Any mistake?"
					options={[
						{ value: NO_MISTAKE, label: "None" },
						...MISTAKE_OPTIONS.map((value) => ({ value, label: value })),
					]}
				/>
			</FieldGroup>
			<FieldGroup label="Strategy">
				<OptionSelect
					value={watch("setupId") ?? NO_STRATEGY}
					onChange={(value) => setValue("setupId", value)}
					placeholder="Select strategy"
					options={[
						{ value: NO_STRATEGY, label: "None" },
						...strategies
							.filter((s) => !s.archivedAt || s.id === trade.setupId)
							.map((s) => ({ value: String(s.id), label: strategyLabel(s) })),
					]}
				/>
			</FieldGroup>
			{save.error && (
				<p role="alert" className="text-sm text-destructive">
					{save.error.message}
				</p>
			)}
			<Button
				type="submit"
				disabled={save.isPending}
				className="w-full font-medium"
			>
				{save.isPending ? "Saving…" : "Save Changes"}
			</Button>
		</form>
	);
}

function overviewExitDate(value: string, stored: Date | null | undefined) {
	if (stored && value === stored.toISOString().slice(0, 16))
		return stored.toISOString();
	return new Date(`${value}Z`).toISOString();
}
