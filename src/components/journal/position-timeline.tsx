import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExecutionFill } from "@/db/positions";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/lib/currency";
import { toDateTimeLocalValue } from "@/lib/date";
import { resolveInstrumentSpec } from "@/lib/instruments";
import { formatEntryDate } from "@/lib/journal-format";
import {
	ExecutionKind,
	formatQuantity,
	type PositionStep,
	positionErrorMessage,
	positionSummary,
} from "@/lib/position";
import { invalidateTradeQueries, QueryKey } from "@/lib/query-keys";
import type { Trade } from "@/lib/trade";
import {
	deleteExecution,
	getPositionExecutions,
} from "@/server/positionActions";
import { ExecutionDrawer, type FillDraft } from "./execution-form";

const ACTION_CLASS = "h-11 sm:h-9";
const ICON_ACTION_CLASS = "size-11 sm:size-8";
const KIND_LABEL = {
	[ExecutionKind.Entry]: "Entry",
	[ExecutionKind.Exit]: "Exit",
} as const;

const formatPrice = (value: number) =>
	value.toLocaleString("en-US", {
		maximumFractionDigits: 6,
		useGrouping: false,
	});

type FillContext = {
	tradeId: number;
	revision: number;
	unit: string;
	currency: string;
	isEditable: boolean;
	onEdit: (draft: FillDraft) => void;
};

export function PositionTimeline({ trade }: { trade: Trade }) {
	const currency = useCurrency();
	const [draft, setDraft] = useState<FillDraft | null>(null);
	const isImported = Boolean(trade.importHash || trade.brokerSource);
	const unit = resolveInstrumentSpec(trade.symbol).quantityUnit.toLowerCase();
	const query = useQuery({
		queryKey: [QueryKey.PositionExecutions, trade.id],
		queryFn: () => getPositionExecutions({ data: { tradeId: trade.id } }),
	});
	const replay = query.data?.replay;
	const steps = replay?.ok ? replay.steps : [];
	const open = positionSummary(steps).open;
	const context: FillContext = {
		tradeId: trade.id,
		revision: query.data?.editRevision ?? 0,
		unit,
		currency,
		isEditable: !isImported && Boolean(query.data?.isMaterialized),
		onEdit: setDraft,
	};

	return (
		<section className="space-y-3" aria-labelledby={`fills-${trade.id}`}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id={`fills-${trade.id}`} className="text-sm font-medium">
					Fills
				</h2>
				{!isImported && replay?.ok && (
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							className={ACTION_CLASS}
							onClick={() =>
								setDraft({
									title: "Add entry",
									values: { kind: ExecutionKind.Entry },
								})
							}
						>
							Add entry
						</Button>
						<Button
							type="button"
							variant="outline"
							className={ACTION_CLASS}
							onClick={() =>
								setDraft({
									title: "Close part",
									values: {
										kind: ExecutionKind.Exit,
										quantity: open > 0 ? String(open) : "",
									},
								})
							}
						>
							Close part
						</Button>
					</div>
				)}
			</div>
			{isImported && (
				<p className="text-sm text-muted-foreground">
					Broker rows cannot get manual fills.
				</p>
			)}
			{query.isLoading && <TimelineSkeleton />}
			{query.isError && <TimelineError onRetry={() => query.refetch()} />}
			{replay && !replay.ok && (
				<p role="alert" className="text-sm text-destructive">
					{positionErrorMessage(replay)}
				</p>
			)}
			{replay?.ok && (
				<>
					<PositionTotals steps={steps} unit={unit} currency={currency} />
					<ol className="divide-y divide-border rounded-md border border-border">
						{steps.map((step) => (
							<FillRow
								key={(step.fill as ExecutionFill).id ?? step.fill.kind}
								step={step}
								context={context}
							/>
						))}
					</ol>
				</>
			)}
			<ExecutionDrawer
				tradeId={trade.id}
				expectedRevision={context.revision}
				unit={unit}
				draft={draft}
				onDone={() => setDraft(null)}
			/>
		</section>
	);
}

function PositionTotals({
	steps,
	unit,
	currency,
}: {
	steps: PositionStep[];
	unit: string;
	currency: string;
}) {
	const summary = positionSummary(steps);
	const price = (value: number | null) =>
		value === null ? "—" : formatPrice(value);
	const items = [
		["Entered", `${formatQuantity(summary.entered)} ${unit}`],
		["Closed", `${formatQuantity(summary.closed)} ${unit}`],
		["Open", `${formatQuantity(summary.open)} ${unit}`],
		["Average entry", price(summary.averageEntryPrice)],
		["Average exit", price(summary.averageExitPrice)],
		["Fees allocated", formatMoney(summary.allocatedFees, currency)],
		["Fees not yet allocated", formatMoney(summary.unallocatedFees, currency)],
		["Realized", formatMoney(summary.realizedPnl, currency, { signed: true })],
	];
	return (
		<dl
			aria-label="Position totals"
			className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-4"
		>
			{items.map(([label, value]) => (
				<div key={label} className="min-w-0">
					<dt className="text-xs text-muted-foreground">{label}</dt>
					<dd className="font-data tabular-nums">{value}</dd>
				</div>
			))}
		</dl>
	);
}

function stepState(step: PositionStep, unit: string, currency: string) {
	const realized = formatMoney(step.cumulativeRealizedPnl, currency, {
		signed: true,
	});
	if (step.remainingQty === 0) return `Closed · realized ${realized}`;
	return `Open ${formatQuantity(step.remainingQty)} ${unit} · avg ${formatPrice(step.averageEntryPrice)} · realized ${realized}`;
}

function FillRow({
	step,
	context,
}: {
	step: PositionStep;
	context: FillContext;
}) {
	const fill = step.fill as ExecutionFill;
	const label = `${KIND_LABEL[fill.kind]} at ${formatEntryDate(fill.executedAt)}`;
	return (
		<li className="section-enter space-y-2 p-3" aria-label={label}>
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm">
					<span className="font-medium">{KIND_LABEL[fill.kind]}</span>{" "}
					<span className="text-muted-foreground">
						{formatEntryDate(fill.executedAt)}
					</span>
				</p>
				{context.isEditable && fill.id && (
					<div className="flex gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className={ICON_ACTION_CLASS}
							aria-label={`Edit ${label}`}
							onClick={() =>
								context.onEdit({
									title: "Edit fill",
									executionId: fill.id,
									values: {
										kind: fill.kind,
										executedAt: toDateTimeLocalValue(new Date(fill.executedAt)),
										price: fill.price,
										quantity: fill.quantity,
										fees: fill.fees ?? "",
										exitQuoteToAccountRate: fill.exitQuoteToAccountRate ?? "",
									},
								})
							}
						>
							<Pencil className="size-4" />
						</Button>
						<DeleteFillButton
							executionId={fill.id}
							label={label}
							context={context}
						/>
					</div>
				)}
			</div>
			<dl className="grid grid-cols-3 gap-2 text-sm">
				<FillValue
					label="Quantity"
					value={formatQuantity(Number(fill.quantity))}
				/>
				<FillValue label="Price" value={formatPrice(Number(fill.price))} />
				<FillValue
					label="Fee"
					value={formatMoney(Number(fill.fees || 0), context.currency)}
				/>
			</dl>
			<p className="font-data text-xs text-muted-foreground">
				{stepState(step, context.unit, context.currency)}
			</p>
		</li>
	);
}

function FillValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="font-data tabular-nums">{value}</dd>
		</div>
	);
}

function DeleteFillButton({
	executionId,
	label,
	context,
}: {
	executionId: number;
	label: string;
	context: FillContext;
}) {
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);
	const remove = useMutation({
		mutationFn: () =>
			deleteExecution({
				data: {
					tradeId: context.tradeId,
					expectedRevision: context.revision,
					executionId,
				},
			}),
		onSuccess: async () => {
			await invalidateTradeQueries(queryClient);
			setIsOpen(false);
		},
	});
	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(next) => {
				if (remove.isPending) return;
				if (next) remove.reset();
				setIsOpen(next);
			}}
		>
			<AlertDialogTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className={ICON_ACTION_CLASS}
					aria-label={`Delete ${label}`}
				>
					<Trash2 className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent className="border-border bg-popover text-popover-foreground">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this fill?</AlertDialogTitle>
					<AlertDialogDescription>
						{label}. The totals update from the other fills.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{remove.error && (
					<p role="alert" className="text-sm text-destructive">
						{remove.error.message}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={remove.isPending}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={remove.isPending}
						onClick={(event) => {
							event.preventDefault();
							remove.mutate();
						}}
					>
						{remove.isPending ? "Deleting…" : "Delete fill"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function TimelineSkeleton() {
	return (
		<div className="space-y-2" aria-hidden="true">
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-20 w-full" />
		</div>
	);
}

function TimelineError({ onRetry }: { onRetry: () => void }) {
	return (
		<div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
			<span className="text-destructive">The fills could not be loaded.</span>
			<Button
				type="button"
				variant="outline"
				className={ACTION_CLASS}
				onClick={onRetry}
			>
				<RefreshCw className="size-4" />
				Retry
			</Button>
		</div>
	);
}
