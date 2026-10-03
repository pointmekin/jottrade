import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoneyWithCode } from "@/lib/currency";
import {
	ImportAction,
	type ImportDecision,
	ImportKind,
	type ImportPreviewRow,
	type ImportReceipt,
} from "@/lib/import-batch";
import { buildImportPlan } from "@/lib/import-plan";
import { summarizeImport } from "@/lib/import-reconciliation";
import { recordNet } from "@/lib/import-record";
import type { CsvRow } from "@/lib/import-values";
import { ImportExecutionFacts } from "./import-execution-facts";
import { ImportRiskEffect } from "./import-risk-effect";
import { ImportRowEditor } from "./import-row-editor";

const PAGE_SIZE = 25;
function rowDecision(row: ImportPreviewRow, value: string): ImportDecision {
	if (value.startsWith("correct:")) {
		const targetId = Number(value.slice(8));
		const candidate = row.candidates.find((item) => item.id === targetId);
		return {
			rowNumber: row.rowNumber,
			action: ImportAction.Correct,
			targetId,
			expectedRevision: candidate?.revision,
		};
	}
	return { rowNumber: row.rowNumber, action: value as ImportAction };
}
function decisionValue(
	decision: ImportDecision | undefined,
	row: ImportPreviewRow,
): string {
	if (decision?.action === ImportAction.Correct)
		return `correct:${decision.targetId}`;
	return decision?.action ?? row.action;
}
function ImportDecisionRow({
	row,
	decision,
	pending,
	onDecision,
	onRepair,
	currency,
}: {
	row: ImportPreviewRow;
	decision: ImportDecision | undefined;
	pending: boolean;
	onDecision: (value: ImportDecision) => void;
	onRepair: (rowNumber: number, source: CsvRow) => void;
	currency: string;
}) {
	const resolved = decisionValue(decision, row);
	const selectable =
		row.action === ImportAction.Ambiguous ||
		row.action === ImportAction.Error ||
		row.action === ImportAction.Insert;
	return (
		<li className="border border-border p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<p className="text-sm font-medium">
						Record {row.rowNumber} ·{" "}
						{row.record?.kind === ImportKind.Trades
							? row.record.symbol
							: "Adjustment"}{" "}
						· {recordNet(row.record)}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">{row.reason}</p>
				</div>
				<select
					aria-label={`Decision for record ${row.rowNumber}`}
					className="max-w-full rounded border bg-background p-2 text-sm"
					value={resolved}
					disabled={pending}
					onChange={(event) => onDecision(rowDecision(row, event.target.value))}
				>
					<option value={row.action}>{row.action}</option>
					{selectable && row.record && (
						<option value={ImportAction.Insert}>
							Insert as a distinct execution
						</option>
					)}
					{row.reason.includes("removed") && (
						<option value={ImportAction.Reimport}>
							Reimport removed version
						</option>
					)}
					{row.action !== ImportAction.Duplicate &&
						row.action !== ImportAction.Superseded &&
						row.candidates.map((candidate) => (
							<option key={candidate.id} value={`correct:${candidate.id}`}>
								Correct #{candidate.id}: {recordNet(candidate.snapshot)} →{" "}
								{recordNet(row.record)}
							</option>
						))}
					{row.action !== ImportAction.Exclude && (
						<option value={ImportAction.Exclude}>
							Explicitly exclude this record
						</option>
					)}
				</select>
			</div>
			{row.candidates.length > 0 && row.record && (
				<details className="mt-2">
					<summary className="cursor-pointer text-xs">
						Compare broker execution facts before choosing a correction
					</summary>
					<p className="my-2 text-xs font-medium">New source record</p>
					<ImportExecutionFacts record={row.record} />
					{row.candidates.map((candidate) => (
						<div key={candidate.id} className="mt-3 border-t pt-2">
							<p className="mb-2 text-xs font-medium">
								Existing record #{candidate.id}
							</p>
							<ImportExecutionFacts record={candidate.snapshot} />
							<ImportRiskEffect
								candidate={candidate}
								incoming={row.record as NonNullable<typeof row.record>}
								currency={currency}
							/>
						</div>
					))}
				</details>
			)}
			{row.issues.map((issue) => (
				<p
					key={`${issue.column}-${issue.message}`}
					className="mt-1 text-xs text-destructive"
				>
					{issue.column}: {issue.message}
				</p>
			))}
			{selectable && (
				<ImportRowEditor row={row} pending={pending} onRepair={onRepair} />
			)}
		</li>
	);
}
export function ImportPreview({
	batch,
	pending,
	onCancel,
	onConfirm,
	onRepair,
}: {
	batch: ImportReceipt;
	pending: boolean;
	onCancel: () => void;
	onConfirm: (decisions: ImportDecision[]) => void;
	onRepair: (rowNumber: number, source: CsvRow) => void;
}) {
	const [decisions, setDecisions] = useState<Record<number, ImportDecision>>(
		{},
	);
	const [page, setPage] = useState(0);
	const selected = Object.values(decisions);
	let error: string | null = null;
	let summary = batch.summary;
	try {
		const plan = buildImportPlan(batch.rows, selected);
		summary = summarizeImport(
			batch.rows.map((row, index) => ({ ...row, action: plan[index].action })),
			plan,
		);
	} catch (cause) {
		error =
			cause instanceof Error ? cause.message : "Resolve every source record.";
	}
	const rows = batch.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
	return (
		<div className="space-y-3">
			<p className="text-sm">
				{batch.fileName} · pinned account #{batch.portfolioId} ·{" "}
				{batch.sourceCurrency}
			</p>
			<div className="rounded border p-3 text-sm">
				<p>
					{summary.rows} source records ·{" "}
					{Object.entries(summary.counts)
						.map(([action, count]) => `${count} ${action}`)
						.join(" · ")}
				</p>
				<p className="mt-1">
					Source realized net:{" "}
					{formatMoneyWithCode(Number(summary.sourceNet), batch.sourceCurrency)}{" "}
					· Account change:{" "}
					{formatMoneyWithCode(
						Number(summary.accountDelta),
						batch.sourceCurrency,
					)}
				</p>
				<p className="text-xs text-muted-foreground">
					Gross {summary.gross} · signed commission {summary.commission} ·
					signed swap {summary.swap}
				</p>
				{summary.unknownAmounts > 0 && (
					<p className="mt-1 text-destructive">
						{summary.unknownAmounts} unreadable amounts. Source total is
						incomplete.
					</p>
				)}
				{summary.excluded > 0 && (
					<p className="mt-1 text-amber-600">
						{summary.excluded} records excluded. This is a partial import.
					</p>
				)}
			</div>
			{summary.openRows > 0 && (
				<p className="text-xs text-muted-foreground">
					{summary.openRows} open records · reported net {summary.openNet}. Open
					results are excluded from realized account changes.
				</p>
			)}
			{summary.warnings.map((warning) => (
				<p key={warning} className="text-xs text-amber-600">
					{warning}
				</p>
			))}
			{error && <p className="text-xs text-amber-600">{error}</p>}
			<ul className="space-y-2">
				{rows.map((row) => (
					<ImportDecisionRow
						key={row.rowNumber}
						row={row}
						currency={batch.sourceCurrency}
						decision={decisions[row.rowNumber]}
						pending={pending}
						onDecision={(decision) =>
							setDecisions({ ...decisions, [row.rowNumber]: decision })
						}
						onRepair={onRepair}
					/>
				))}
			</ul>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={page === 0}
						onClick={() => setPage(page - 1)}
					>
						Previous
					</Button>
					<span className="text-xs">
						{page + 1} / {Math.max(1, Math.ceil(batch.rows.length / PAGE_SIZE))}
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={(page + 1) * PAGE_SIZE >= batch.rows.length}
						onClick={() => setPage(page + 1)}
					>
						Next
					</Button>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" disabled={pending} onClick={onCancel}>
						Cancel
					</Button>
					<Button
						disabled={pending || Boolean(error)}
						onClick={() => onConfirm(selected)}
					>
						{pending ? "Saving…" : "Apply import"}
					</Button>
				</div>
			</div>
		</div>
	);
}
