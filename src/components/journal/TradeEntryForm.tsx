import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { type Control, type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/hooks/use-accounts";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import { invalidateTradeQueries } from "@/lib/query-keys";
import { TradeSide } from "@/lib/trade";
import { cn } from "@/lib/utils";
import { createTrade } from "@/server/tradeActions";

const formSchema = z.object({
	symbol: z
		.string()
		.min(1, "Symbol is required")
		.transform((s) => s.toUpperCase()),
	side: z.enum(TradeSide),
	entryDate: z
		.string()
		.refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date"),
	entryPrice: z.string().min(1, "Price is required"),
	quantity: z.string().min(1, "Quantity is required"),
	notes: z.string().optional(),
	targetPrice: z.string().optional(),
	exitPrice: z.string().optional(),
	exitDate: z.string().optional(),
	fees: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface TradeEntryFormProps {
	onSuccess?: () => void;
	onCancel?: () => void;
}

const INPUT_CLASS =
	"bg-background border-input text-foreground font-data text-sm placeholder:text-muted-foreground";

const emptyValues = (): FormValues => ({
	symbol: "",
	side: TradeSide.Long,
	entryDate: toDateTimeLocalValue(new Date()),
	entryPrice: "",
	targetPrice: "",
	quantity: "",
	notes: "",
	exitPrice: "",
	exitDate: "",
	fees: "",
});

function FormInput({
	control,
	name,
	label,
	className,
	...inputProps
}: {
	control: Control<FormValues>;
	name: FieldPath<FormValues>;
	label: string;
} & ComponentProps<typeof Input>) {
	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className="space-y-1.5">
					<Label className="field-label">{label}</Label>
					<FormControl>
						<Input
							className={cn(INPUT_CLASS, className)}
							{...inputProps}
							{...field}
						/>
					</FormControl>
					<FormMessage className="text-xs text-destructive" />
				</FormItem>
			)}
		/>
	);
}

function SideSelect({ control }: { control: Control<FormValues> }) {
	return (
		<FormField
			control={control}
			name="side"
			render={({ field }) => (
				<FormItem className="space-y-1.5">
					<Label className="field-label">Side</Label>
					<Select onValueChange={field.onChange} defaultValue={field.value}>
						<FormControl>
							<SelectTrigger className="border-input bg-background text-sm">
								<SelectValue />
							</SelectTrigger>
						</FormControl>
						<SelectContent>
							<SelectItem value={TradeSide.Long} className="text-success">
								Long
							</SelectItem>
							<SelectItem value={TradeSide.Short} className="text-destructive">
								Short
							</SelectItem>
						</SelectContent>
					</Select>
				</FormItem>
			)}
		/>
	);
}

function NotesField({ control }: { control: Control<FormValues> }) {
	return (
		<FormField
			control={control}
			name="notes"
			render={({ field }) => (
				<FormItem className="space-y-1.5">
					<Label className="field-label">Notes</Label>
					<FormControl>
						<Textarea
							placeholder="Setup context, emotions, plan…"
							className="min-h-20 resize-none border-input bg-background text-sm text-foreground placeholder:text-muted-foreground"
							{...field}
						/>
					</FormControl>
				</FormItem>
			)}
		/>
	);
}

function useLogTrade(onLogged: () => void) {
	const queryClient = useQueryClient();
	const { activeAccount } = useAccounts();
	return useMutation({
		mutationFn: (values: FormValues) => {
			if (!activeAccount) {
				return Promise.reject(new Error("No active account."));
			}
			return createTrade({
				data: {
					...values,
					portfolioId: activeAccount.id,
					entryDate: localDateTimeToIso(values.entryDate),
					exitDate: values.exitDate
						? localDateTimeToIso(values.exitDate)
						: undefined,
				},
			});
		},
		onSuccess: () => {
			invalidateTradeQueries(queryClient);
			onLogged();
		},
		onError: (cause) => {
			toast.error(
				cause instanceof Error
					? cause.message
					: "The trade could not be saved.",
			);
		},
	});
}

export function TradeEntryForm({ onSuccess, onCancel }: TradeEntryFormProps) {
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: emptyValues(),
	});
	const { mutate: logTrade, isPending } = useLogTrade(() => {
		form.reset();
		onSuccess?.();
	});
	const isLong = form.watch("side") === TradeSide.Long;
	const sideLabel = isLong ? "Long" : "Short";
	const { control } = form;

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit((values) => logTrade(values))}
				className="space-y-4"
			>
				<FormInput
					control={control}
					name="symbol"
					label="Symbol"
					placeholder="AAPL"
					className="uppercase"
				/>
				<div className="grid grid-cols-2 gap-3">
					<SideSelect control={control} />
					<FormInput
						control={control}
						name="entryDate"
						label="Entry Date"
						type="datetime-local"
						className="appearance-none"
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<FormInput
						control={control}
						name="entryPrice"
						label="Entry Price"
						type="number"
						step="0.0001"
						placeholder="150.00"
					/>
					<FormInput
						control={control}
						name="quantity"
						label="Quantity"
						type="number"
						step="0.0001"
						placeholder="10"
					/>
				</div>
				<div className="flex items-center gap-3 pt-1">
					<div className="h-px flex-1 bg-border" />
					<span className="field-label">Optional</span>
					<div className="h-px flex-1 bg-border" />
				</div>
				<FormInput
					control={control}
					name="targetPrice"
					label="Planned target price"
					type="number"
					min="0"
					step="any"
					placeholder="Optional"
				/>
				<div className="grid grid-cols-2 gap-3">
					<FormInput
						control={control}
						name="exitPrice"
						label="Exit Price"
						type="number"
						step="0.0001"
						placeholder="155.00"
					/>
					<FormInput
						control={control}
						name="exitDate"
						label="Exit Date"
						type="datetime-local"
						className="appearance-none"
					/>
				</div>
				<FormInput
					control={control}
					name="fees"
					label="Fees"
					type="number"
					step="0.01"
					placeholder="0.00"
				/>
				<NotesField control={control} />
				<div className="flex gap-2 pt-2">
					{onCancel && (
						<Button
							type="button"
							variant="outline"
							className="flex-1 border-border text-muted-foreground"
							onClick={onCancel}
						>
							Cancel
						</Button>
					)}
					<Button
						type="submit"
						disabled={isPending}
						className={cn(
							"flex-1 font-medium transition-colors",
							isLong
								? "bg-success text-success-foreground hover:bg-success/88"
								: "bg-destructive text-destructive-foreground hover:bg-destructive/88",
						)}
					>
						{isPending ? "Logging…" : `Log ${sideLabel}`}
					</Button>
				</div>
			</form>
		</Form>
	);
}
