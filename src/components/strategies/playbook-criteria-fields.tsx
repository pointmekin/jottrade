import { Plus, X } from "lucide-react";
import { useRef } from "react";
import {
	type Control,
	Controller,
	type FieldErrors,
	type UseFormRegister,
	type UseFormSetFocus,
	useFieldArray,
	useWatch,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	MAX_CRITERIA_PER_KIND,
	PlaybookCriterionKind,
	type PlaybookFields,
} from "@/lib/playbook";

const LISTS = [
	{
		kind: PlaybookCriterionKind.Entry,
		legend: "Entry criteria",
		item: "Entry criterion",
		empty: "Add the conditions you check before you enter.",
	},
	{
		kind: PlaybookCriterionKind.Invalidation,
		legend: "Invalidation criteria",
		item: "Invalidation criterion",
		empty: "Add the conditions that cancel the setup or force the exit.",
	},
];

interface PlaybookCriteriaFieldsProps {
	control: Control<PlaybookFields>;
	register: UseFormRegister<PlaybookFields>;
	setFocus: UseFormSetFocus<PlaybookFields>;
	errors: FieldErrors<PlaybookFields>;
}

export function PlaybookCriteriaFields({
	control,
	register,
	setFocus,
	errors,
}: PlaybookCriteriaFieldsProps) {
	const { fields, append, remove } = useFieldArray({
		control,
		name: "criteria",
	});
	const values = useWatch({ control, name: "criteria" }) ?? [];
	const addButtons = useRef<Partial<Record<string, HTMLButtonElement>>>({});

	// Focus moves before the remove: the kept row and the button keep their DOM nodes.
	const removeRow = (
		rows: { index: number }[],
		position: number,
		kind: string,
	) => {
		const next = rows[position - 1] ?? rows[position + 1];
		if (next) setFocus(`criteria.${next.index}.text`);
		else addButtons.current[kind]?.focus();
		remove(rows[position].index);
	};

	return (
		<>
			{LISTS.map((list) => {
				const rows = fields
					.map((field, index) => ({ field, index }))
					.filter(({ field }) => field.kind === list.kind);
				return (
					<fieldset
						key={list.kind}
						aria-labelledby={`criteria-${list.kind}`}
						className="min-w-0 space-y-2"
					>
						<div className="flex items-center justify-between gap-2">
							<h3 id={`criteria-${list.kind}`} className="text-sm font-medium">
								{list.legend}
							</h3>
							<Button
								type="button"
								variant="outline"
								size="sm"
								ref={(node) => {
									addButtons.current[list.kind] = node ?? undefined;
								}}
								className="h-11 sm:h-8"
								disabled={rows.length >= MAX_CRITERIA_PER_KIND}
								onClick={() =>
									append(
										{
											id: crypto.randomUUID(),
											kind: list.kind,
											text: "",
											required: true,
										},
										{ focusName: `criteria.${fields.length}.text` },
									)
								}
							>
								<Plus className="size-4" /> Add criterion
							</Button>
						</div>
						{!rows.length && (
							<p className="text-xs text-muted-foreground">{list.empty}</p>
						)}
						<ul className="m-0 list-none space-y-2 p-0">
							{rows.map(({ field, index }, position) => (
								<li
									key={field.id}
									className="flex flex-wrap items-center gap-x-2"
								>
									<Input
										{...register(`criteria.${index}.text`)}
										aria-label={`${list.item} ${position + 1}`}
										className="w-full bg-background sm:w-auto sm:flex-1"
										placeholder="e.g. Price closes above the range"
									/>
									<Label
										htmlFor={`${field.id}-required`}
										className="flex h-11 cursor-pointer items-center gap-2 text-xs font-normal"
									>
										<Controller
											control={control}
											name={`criteria.${index}.required`}
											render={({ field: required }) => (
												<Checkbox
													id={`${field.id}-required`}
													checked={required.value}
													onCheckedChange={(checked) =>
														required.onChange(checked === true)
													}
												/>
											)}
										/>
										Required
									</Label>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="ml-auto size-11 text-muted-foreground sm:ml-0"
										aria-label={`Remove criterion: ${values[index]?.text ?? ""}`}
										onClick={() => removeRow(rows, position, list.kind)}
									>
										<X className="size-4" />
									</Button>
									{errors.criteria?.[index]?.text && (
										<p className="basis-full text-xs text-destructive">
											{errors.criteria[index].text.message}
										</p>
									)}
								</li>
							))}
						</ul>
					</fieldset>
				);
			})}
			{errors.criteria?.root && (
				<p className="text-xs text-destructive">
					{errors.criteria.root.message}
				</p>
			)}
		</>
	);
}
