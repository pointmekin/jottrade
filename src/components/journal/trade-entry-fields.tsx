import { useId } from "react";
import { type UseFormReturn, useWatch } from "react-hook-form";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { TradeSide } from "@/lib/trade";
import type { TradeCaptureValues } from "@/lib/trade-capture";

type CaptureForm = UseFormReturn<TradeCaptureValues>;
const CORE_FIELDS = [
	["symbol", "Symbol", "text"],
	["entryDate", "Entry date", "datetime-local"],
	["entryPrice", "Entry price", "number"],
] as const;
const CLOSE_FIELDS = [
	["exitPrice", "Exit price", "number"],
	["exitDate", "Exit date", "datetime-local"],
	["fees", "Fees (account currency)", "number"],
	[
		"exitQuoteToAccountRate",
		"Exit FX rate (account money per quote unit)",
		"number",
	],
] as const;

function CaptureField({
	form,
	name,
	label,
	type = "number",
}: {
	form: CaptureForm;
	name:
		| (typeof CORE_FIELDS)[number][0]
		| (typeof CLOSE_FIELDS)[number][0]
		| "quantity"
		| "targetPrice";
	label: string;
	type?: string;
}) {
	const id = useId();
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<Label htmlFor={id}>{label}</Label>
					<FormControl>
						<Input
							{...field}
							id={id}
							value={field.value ?? ""}
							type={type}
							step="any"
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

export function TradeEntryFields({ form }: { form: CaptureForm }) {
	const sideId = useId();
	const symbol = useWatch({ control: form.control, name: "symbol" });
	const unit = resolveInstrumentSpec(symbol).quantityUnit.toLowerCase();
	return (
		<>
			{CORE_FIELDS.map(([name, label, type]) => (
				<CaptureField
					key={name}
					form={form}
					name={name}
					label={label}
					type={type}
				/>
			))}
			<FormField
				control={form.control}
				name="side"
				render={({ field }) => (
					<FormItem>
						<Label htmlFor={sideId}>Side</Label>
						<FormControl>
							<select
								id={sideId}
								value={field.value}
								onChange={field.onChange}
								className="h-9 w-full rounded-md border border-input bg-background px-3"
							>
								<option value={TradeSide.Long}>Long</option>
								<option value={TradeSide.Short}>Short</option>
							</select>
						</FormControl>
					</FormItem>
				)}
			/>
			<CaptureField form={form} name="quantity" label={`Quantity (${unit})`} />
			<CaptureField
				form={form}
				name="targetPrice"
				label="Planned target price"
			/>
		</>
	);
}

export function TradeCloseFields({ form }: { form: CaptureForm }) {
	const notesId = useId();
	return (
		<section className="space-y-3" aria-label="Optional trade outcome">
			{CLOSE_FIELDS.map(([name, label, type]) => (
				<CaptureField
					key={name}
					form={form}
					name={name}
					label={label}
					type={type}
				/>
			))}
			<p className="text-xs text-muted-foreground">
				Leave exit fields blank for an open trade. An external exit rate
				requires the actual exit time; the entry rate is never substituted.
			</p>
			<FormField
				control={form.control}
				name="notes"
				render={({ field }) => (
					<FormItem>
						<Label htmlFor={notesId}>Notes</Label>
						<FormControl>
							<Textarea {...field} id={notesId} value={field.value ?? ""} />
						</FormControl>
					</FormItem>
				)}
			/>
		</section>
	);
}
