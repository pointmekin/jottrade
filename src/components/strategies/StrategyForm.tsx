import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryKey } from "@/lib/query-keys";
import { createStrategy, updateStrategy } from "@/server/strategyActions";
import { StrategyPerformance } from "./StrategyPerformance";

const schema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(1000).optional(),
});
type FormValues = z.infer<typeof schema>;

type Strategy = { id: number; name: string; description: string | null };

interface StrategyFormProps {
	strategy: Strategy | null;
	onSaved: (s: Strategy) => void;
}

export function StrategyForm({ strategy, onSaved }: StrategyFormProps) {
	// React Compiler caches register("name") on the stable register identity.
	// The form then never re-registers its fields, so a new strategy keeps the
	// previous values in the DOM.
	"use no memo";

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
			qc.invalidateQueries({ queryKey: [QueryKey.Strategies] });
			onSaved(saved);
			if (!strategy) reset();
		},
	});
	const submitLabel = strategy ? "Save Changes" : "Create Strategy";

	return (
		<form
			onSubmit={handleSubmit((v) => saveMut.mutate(v))}
			className="space-y-4"
		>
			<div className="space-y-1">
				<Label>Name</Label>
				<Input
					{...register("name")}
					className="bg-background"
					placeholder="e.g. Breakout"
				/>
				{errors.name && (
					<p className="text-xs text-destructive">{errors.name.message}</p>
				)}
			</div>
			<div className="space-y-1">
				<Label>Description</Label>
				<Textarea
					{...register("description")}
					className="bg-background"
					rows={3}
					placeholder="Describe this setup..."
				/>
			</div>
			<Button type="submit" disabled={saveMut.isPending} className="w-full">
				{saveMut.isPending ? "Saving…" : submitLabel}
			</Button>

			{strategy && <StrategyPerformance strategyId={strategy.id} />}
		</form>
	);
}
