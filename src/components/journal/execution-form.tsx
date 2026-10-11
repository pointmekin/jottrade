import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import {
	type FieldPath,
	useForm,
	useFormState,
	useWatch,
} from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { localDateTimeToIso, toDateTimeLocalValue } from "@/lib/date";
import {
	ExecutionKind,
	executionInputSchema,
	PositionError,
	positionErrorOf,
} from "@/lib/position";
import { invalidateTradeQueries } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { addExecution, updateExecution } from "@/server/positionActions";

type ExecutionValues = z.infer<typeof executionInputSchema>;

export type FillDraft = {
	title: string;
	values: Partial<ExecutionValues>;
	executionId?: number;
};

const ERROR_FIELD: Record<PositionError, FieldPath<ExecutionValues>> = {
	[PositionError.InvalidQuantity]: "quantity",
	[PositionError.InvalidPrice]: "price",
	[PositionError.InvalidFee]: "fees",
	[PositionError.ExitBeforeEntry]: "executedAt",
	[PositionError.OverClose]: "quantity",
	[PositionError.Reopen]: "executedAt",
};
const FIELD_CLASS = "h-11 font-data sm:h-9";

type ExecutionFormProps = {
	tradeId: number;
	expectedRevision: number;
	unit: string;
	draft: FillDraft;
	onDone: () => void;
};

export function ExecutionDrawer({
	draft,
	onDone,
	...props
}: Omit<ExecutionFormProps, "draft"> & { draft: FillDraft | null }) {
	const isDesktop = !useIsMobile();
	return (
		<Drawer
			open={draft !== null}
			onOpenChange={(isOpen) => !isOpen && onDone()}
			direction={isDesktop ? "right" : "bottom"}
		>
			<DrawerContent
				className={cn(
					"bg-popover text-popover-foreground",
					isDesktop
						? "inset-y-0 right-0 left-auto mt-0 h-screen w-[400px] max-w-[90vw] flex-col rounded-md border-l"
						: "inset-x-0 bottom-0 top-auto max-h-[92vh] w-full flex-col rounded-md border-t",
				)}
			>
				<DrawerHeader className="flex-shrink-0 border-b border-border px-5 pt-5 pb-4">
					<DrawerTitle className="text-lg font-semibold tracking-tight">
						{draft?.title}
					</DrawerTitle>
					<DrawerDescription className="mt-1 text-sm text-muted-foreground">
						The totals update from all fills, in time order.
					</DrawerDescription>
				</DrawerHeader>
				<div className="flex-1 overflow-y-auto px-5 py-5">
					{draft && <ExecutionForm {...props} draft={draft} onDone={onDone} />}
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function ExecutionForm({
	tradeId,
	expectedRevision,
	unit,
	draft,
	onDone,
}: ExecutionFormProps) {
	const queryClient = useQueryClient();
	const kindId = useId();
	const form = useForm<ExecutionValues>({
		resolver: zodResolver(executionInputSchema),
		defaultValues: {
			kind: ExecutionKind.Entry,
			executedAt: toDateTimeLocalValue(new Date()),
			price: "",
			quantity: "",
			fees: "",
			exitQuoteToAccountRate: "",
			...draft.values,
		},
	});
	const kind = useWatch({ control: form.control, name: "kind" });
	const rootError = useFormState({ control: form.control }).errors.root;
	const save = useMutation({
		mutationFn: (values: ExecutionValues) => {
			const data = {
				...values,
				executedAt: localDateTimeToIso(values.executedAt),
				exitQuoteToAccountRate:
					values.kind === ExecutionKind.Exit
						? values.exitQuoteToAccountRate
						: "",
				tradeId,
				expectedRevision,
			};
			return draft.executionId
				? updateExecution({ data: { ...data, executionId: draft.executionId } })
				: addExecution({ data });
		},
		onSuccess: async () => {
			await invalidateTradeQueries(queryClient);
			onDone();
		},
		onError: (error) => {
			const kind = positionErrorOf(error.message);
			form.setError(kind ? ERROR_FIELD[kind] : "root", {
				message: error.message,
			});
		},
	});

	return (
		<form
			onSubmit={form.handleSubmit((values) => save.mutate(values))}
			className="space-y-4"
			noValidate
		>
			<div className="space-y-1.5">
				<Label htmlFor={kindId}>Kind</Label>
				<select
					id={kindId}
					{...form.register("kind")}
					className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:h-9"
				>
					<option value={ExecutionKind.Entry}>Entry</option>
					<option value={ExecutionKind.Exit}>Exit</option>
				</select>
			</div>
			<FillField
				form={form}
				name="executedAt"
				label="Time"
				type="datetime-local"
			/>
			<div className="grid grid-cols-2 gap-3">
				<FillField form={form} name="quantity" label={`Quantity (${unit})`} />
				<FillField form={form} name="price" label="Price" />
			</div>
			<FillField form={form} name="fees" label="Fee (account currency)" />
			{kind === ExecutionKind.Exit && (
				<FillField
					form={form}
					name="exitQuoteToAccountRate"
					label="Exit FX rate (account money per quote unit)"
				/>
			)}
			{rootError && (
				<p role="alert" className="text-sm text-destructive">
					{rootError.message}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					type="submit"
					disabled={save.isPending}
					className="h-11 flex-1 sm:h-9"
				>
					{save.isPending ? "Saving…" : "Save fill"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={onDone}
					className="h-11 sm:h-9"
				>
					Cancel
				</Button>
			</div>
		</form>
	);
}

function FillField({
	form,
	name,
	label,
	type = "text",
}: {
	form: ReturnType<typeof useForm<ExecutionValues>>;
	name: Exclude<FieldPath<ExecutionValues>, "kind">;
	label: string;
	type?: string;
}) {
	const id = useId();
	const error = useFormState({ control: form.control, name }).errors[name]
		?.message;
	return (
		<div className="min-w-0 space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				inputMode={type === "text" ? "decimal" : undefined}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? `${id}-error` : undefined}
				{...form.register(name)}
				className={FIELD_CLASS}
			/>
			{error && (
				<p id={`${id}-error`} role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
