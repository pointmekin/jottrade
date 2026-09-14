import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import { cn } from "@/lib/utils";
import { createTrade } from "@/server/tradeActions";

const formSchema = z.object({
	symbol: z
		.string()
		.min(1, "Symbol is required")
		.transform((s) => s.toUpperCase()),
	side: z.enum(["LONG", "SHORT"]),
	entryDate: z
		.string()
		.refine((val) => !Number.isNaN(Date.parse(val)), "Invalid date"),
	entryPrice: z.string().min(1, "Price is required"),
	quantity: z.string().min(1, "Quantity is required"),
	notes: z.string().optional(),
	exitPrice: z.string().optional(),
	exitDate: z.string().optional(),
	fees: z.string().optional(),
});

interface TradeEntryFormProps {
	onSuccess?: () => void;
	onCancel?: () => void;
}

const inputCls =
	"bg-background border-input text-foreground font-data text-sm placeholder:text-muted-foreground";

const labelCls = "field-label";

export function TradeEntryForm({ onSuccess, onCancel }: TradeEntryFormProps) {
	const queryClient = useQueryClient();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			symbol: "",
			side: "LONG",
			entryDate: toDateTimeLocalValue(new Date()),
			entryPrice: "",
			quantity: "",
			notes: "",
			exitPrice: "",
			exitDate: "",
			fees: "",
		},
	});

	const side = form.watch("side");
	const isLong = side === "LONG";

	const { mutate: logTrade, isPending } = useMutation({
		mutationFn: (values: z.infer<typeof formSchema>) =>
			createTrade({
				data: {
					...values,
					entryDate: localDateTimeToIso(values.entryDate),
					exitDate: values.exitDate
						? localDateTimeToIso(values.exitDate)
						: undefined,
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["trades"] });
			form.reset();
			onSuccess?.();
		},
	});

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit((values) => logTrade(values))}
				className="space-y-4"
			>
				{/* Symbol */}
				<FormField
					control={form.control}
					name="symbol"
					render={({ field }) => (
						<FormItem className="space-y-1.5">
							<Label className={labelCls}>Symbol</Label>
							<FormControl>
								<Input
									placeholder="AAPL"
									className={cn(inputCls, "uppercase")}
									{...field}
								/>
							</FormControl>
							<FormMessage className="text-xs text-destructive" />
						</FormItem>
					)}
				/>

				{/* Side + Entry Date */}
				<div className="grid grid-cols-2 gap-3">
					<FormField
						control={form.control}
						name="side"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<Label className={labelCls}>Side</Label>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value}
								>
									<FormControl>
										<SelectTrigger className="border-input bg-background text-sm">
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="LONG" className="text-success">
											Long
										</SelectItem>
										<SelectItem value="SHORT" className="text-destructive">
											Short
										</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage className="text-xs text-destructive" />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="entryDate"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<Label className={labelCls}>Entry Date</Label>
								<FormControl>
									<Input
										type="datetime-local"
										className={cn(inputCls, "appearance-none")}
										{...field}
									/>
								</FormControl>
								<FormMessage className="text-xs text-destructive" />
							</FormItem>
						)}
					/>
				</div>

				{/* Entry Price + Quantity */}
				<div className="grid grid-cols-2 gap-3">
					<FormField
						control={form.control}
						name="entryPrice"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<Label className={labelCls}>Entry Price</Label>
								<FormControl>
									<Input
										type="number"
										step="0.0001"
										placeholder="150.00"
										className={inputCls}
										{...field}
									/>
								</FormControl>
								<FormMessage className="text-xs text-destructive" />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="quantity"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<Label className={labelCls}>Quantity</Label>
								<FormControl>
									<Input
										type="number"
										step="0.0001"
										placeholder="10"
										className={inputCls}
										{...field}
									/>
								</FormControl>
								<FormMessage className="text-xs text-destructive" />
							</FormItem>
						)}
					/>
				</div>

				{/* Optional divider */}
				<div className="flex items-center gap-3 pt-1">
					<div className="h-px flex-1 bg-border" />
					<span className="field-label">Optional</span>
					<div className="h-px flex-1 bg-border" />
				</div>

				{/* Exit Price + Exit Date */}
				<div className="grid grid-cols-2 gap-3">
					<FormField
						control={form.control}
						name="exitPrice"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<Label className={labelCls}>Exit Price</Label>
								<FormControl>
									<Input
										type="number"
										step="0.0001"
										placeholder="155.00"
										className={inputCls}
										{...field}
									/>
								</FormControl>
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="exitDate"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<Label className={labelCls}>Exit Date</Label>
								<FormControl>
									<Input
										type="datetime-local"
										className={cn(inputCls, "appearance-none")}
										{...field}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				</div>

				{/* Fees */}
				<FormField
					control={form.control}
					name="fees"
					render={({ field }) => (
						<FormItem className="space-y-1.5">
							<Label className={labelCls}>Fees</Label>
							<FormControl>
								<Input
									type="number"
									step="0.01"
									placeholder="0.00"
									className={inputCls}
									{...field}
								/>
							</FormControl>
						</FormItem>
					)}
				/>

				{/* Notes */}
				<FormField
					control={form.control}
					name="notes"
					render={({ field }) => (
						<FormItem className="space-y-1.5">
							<Label className={labelCls}>Notes</Label>
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

				{/* Actions */}
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
							"flex-1 font-medium transition-all",
							isLong
								? "bg-success text-success-foreground hover:bg-success/88"
								: "bg-destructive text-destructive-foreground hover:bg-destructive/88",
						)}
					>
						{isPending ? "Logging…" : `Log ${isLong ? "Long" : "Short"}`}
					</Button>
				</div>
			</form>
		</Form>
	);
}
