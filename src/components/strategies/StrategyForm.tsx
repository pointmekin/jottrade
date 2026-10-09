import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef } from "react";
import { useForm } from "react-hook-form";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	type PlaybookFields,
	playbookFieldsSchema,
	type Strategy,
} from "@/lib/playbook";
import { QueryKey } from "@/lib/query-keys";
import { createStrategy, updateStrategy } from "@/server/strategyActions";
import { PlaybookCriteriaFields } from "./playbook-criteria-fields";
import { StrategyPerformance } from "./StrategyPerformance";

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
	const riskGuidanceId = useId();
	const {
		register,
		control,
		handleSubmit,
		formState: { errors, isDirty },
		reset,
		setFocus,
	} = useForm<PlaybookFields>({
		resolver: zodResolver(playbookFieldsSchema),
		values: {
			name: strategy?.name ?? "",
			description: strategy?.description ?? "",
			criteria: strategy?.criteria ?? [],
			riskGuidance: strategy?.riskGuidance ?? "",
		},
	});

	const saveMut = useMutation({
		mutationFn: (values: PlaybookFields) =>
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

	// A create selects the new strategy; its "Saved." must stay.
	const shownId = useRef(strategy?.id);
	useEffect(() => {
		if (shownId.current === strategy?.id) return;
		shownId.current = strategy?.id;
		if (saveMut.data?.id !== strategy?.id) saveMut.reset();
	});

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
			<section className="space-y-4" aria-label="Playbook">
				<SectionHeading
					title="Playbook"
					detail="The rules you check for each trade"
				/>
				<PlaybookCriteriaFields
					control={control}
					register={register}
					setFocus={setFocus}
					errors={errors}
				/>
				<div className="space-y-1">
					<Label htmlFor={riskGuidanceId}>Risk guidance</Label>
					<Textarea
						id={riskGuidanceId}
						{...register("riskGuidance")}
						className="bg-background"
						rows={2}
						placeholder="e.g. Risk 1% of the account or less"
					/>
				</div>
			</section>
			<Button type="submit" disabled={saveMut.isPending} className="w-full">
				{saveMut.isPending ? "Saving…" : submitLabel}
			</Button>
			{saveMut.isError && (
				<p role="alert" className="text-sm text-destructive">
					{saveMut.error.message}
				</p>
			)}
			{saveMut.isSuccess && !isDirty && (
				<output className="block text-sm text-muted-foreground">Saved.</output>
			)}

			{strategy && <StrategyPerformance strategyId={strategy.id} />}
		</form>
	);
}
