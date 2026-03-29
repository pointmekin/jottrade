import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTrade } from "@/server/tradeActions";
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
import { cn } from "@/lib/utils";

const formSchema = z.object({
	symbol: z
		.string()
		.min(1, "Symbol is required")
		.transform((s) => s.toUpperCase()),
	side: z.enum(["LONG", "SHORT"]),
	entryDate: z
		.string()
		.refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
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
	"bg-zinc-900 border-zinc-800 text-white font-mono text-sm focus-visible:border-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors placeholder:text-zinc-700";

const labelCls =
	"text-zinc-500 text-[10px] uppercase tracking-widest font-semibold";

export function TradeEntryForm({ onSuccess, onCancel }: TradeEntryFormProps) {
	const queryClient = useQueryClient();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			symbol: "",
			side: "LONG",
			entryDate: new Date().toISOString().slice(0, 16),
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
			createTrade({ data: values }),
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
							<FormMessage className="text-red-400 text-xs" />
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
										<SelectTrigger className="bg-zinc-900 border-zinc-800 text-white focus:ring-0 focus:ring-offset-0 focus:border-zinc-600 text-sm">
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent className="bg-zinc-900 border-zinc-800 text-white">
										<SelectItem
											value="LONG"
											className="focus:bg-zinc-800 focus:text-white text-emerald-400"
										>
											▲ Long
										</SelectItem>
										<SelectItem
											value="SHORT"
											className="focus:bg-zinc-800 focus:text-white text-red-400"
										>
											▼ Short
										</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage className="text-red-400 text-xs" />
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
								<FormMessage className="text-red-400 text-xs" />
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
								<FormMessage className="text-red-400 text-xs" />
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
								<FormMessage className="text-red-400 text-xs" />
							</FormItem>
						)}
					/>
				</div>

				{/* Optional divider */}
				<div className="flex items-center gap-3 pt-1">
					<div className="h-px flex-1 bg-zinc-800" />
					<span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">
						Optional
					</span>
					<div className="h-px flex-1 bg-zinc-800" />
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
									className="bg-zinc-900 border-zinc-800 text-white text-sm resize-none min-h-20 focus-visible:border-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors placeholder:text-zinc-700"
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
							className="flex-1 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
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
								? "bg-emerald-600 hover:bg-emerald-500 text-white"
								: "bg-red-600 hover:bg-red-500 text-white",
						)}
					>
						{isPending ? "Logging…" : `Log ${isLong ? "Long" : "Short"}`}
					</Button>
				</div>
			</form>
		</Form>
	);
}
