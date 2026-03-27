import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { createStrategy, updateStrategy } from "@/server/strategyActions";
import { getTrades } from "@/server/getTrades";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const schema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(1000).optional(),
});
type FormValues = z.infer<typeof schema>;

type Strategy = { id: number; name: string; description: string | null };

interface StrategyFormProps {
	strategy: Strategy | null; // null = creating new
	onSaved: (s: Strategy) => void;
}

export function StrategyForm({ strategy, onSaved }: StrategyFormProps) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm<FormValues>({
		resolver: zodResolver(schema),
		values: {
			name: strategy?.name ?? "",
			description: strategy?.description ?? "",
		},
	});

	const saveMut = useMutation({
		mutationFn: (values: FormValues) =>
			strategy
				? updateStrategy({ data: { id: strategy.id, ...values } })
				: createStrategy({ data: values }),
		onSuccess: (saved) => {
			qc.invalidateQueries({ queryKey: ["strategies"] });
			onSaved(saved as Strategy);
			if (!strategy) reset();
		},
	});

	// Performance summary for existing strategy
	const { data: allTrades } = useQuery({
		queryKey: ["trades"],
		queryFn: () => getTrades({ data: undefined }),
		enabled: !!strategy,
	});
	// getTrades returns { trades, total, page, pageSize } — destructure accordingly
	const stratTrades =
		((allTrades as any)?.trades as any[] | undefined)?.filter(
			(t: any) => t.setupId === strategy?.id && t.status === "CLOSED",
		) ?? [];
	const totalPnl = stratTrades.reduce(
		(a: number, t: any) => a + Number(t.netPnl ?? 0),
		0,
	);
	const winRate = stratTrades.length
		? (stratTrades.filter((t: any) => Number(t.netPnl) > 0).length /
				stratTrades.length) *
			100
		: 0;

	return (
		<form
			onSubmit={handleSubmit((v) => saveMut.mutate(v))}
			className="space-y-4"
		>
			<div className="space-y-1">
				<Label className="text-zinc-300">Name</Label>
				<Input
					{...register("name")}
					className="bg-zinc-900 border-zinc-700 text-white"
					placeholder="e.g. Breakout"
				/>
				{errors.name && (
					<p className="text-red-400 text-xs">{errors.name.message}</p>
				)}
			</div>
			<div className="space-y-1">
				<Label className="text-zinc-300">Description</Label>
				<Textarea
					{...register("description")}
					className="bg-zinc-900 border-zinc-700 text-white"
					rows={3}
					placeholder="Describe this setup..."
				/>
			</div>
			<Button type="submit" disabled={saveMut.isPending} className="w-full">
				{saveMut.isPending
					? "Saving…"
					: strategy
						? "Save Changes"
						: "Create Strategy"}
			</Button>

			{strategy && stratTrades.length > 0 && (
				<div className="mt-6 pt-6 border-t border-zinc-800 grid grid-cols-2 gap-3">
					{[
						{ label: "Trades", value: stratTrades.length },
						{ label: "Win Rate", value: `${winRate.toFixed(1)}%` },
						{
							label: "Avg P&L",
							value: `$${(totalPnl / stratTrades.length).toFixed(2)}`,
						},
						{ label: "Total P&L", value: `$${totalPnl.toFixed(2)}` },
					].map(({ label, value }) => (
						<div key={label} className="bg-zinc-900 rounded-lg p-3">
							<p className="text-xs text-zinc-500">{label}</p>
							<p className="text-sm font-medium text-white">{value}</p>
						</div>
					))}
				</div>
			)}
		</form>
	);
}
