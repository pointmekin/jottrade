import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoneyWithCode } from "@/lib/currency";
import type { ImportReceipt } from "@/lib/import-batch";
export function ImportBatchReceipt({ batch }: { batch: ImportReceipt }) {
	const [page, setPage] = useState(0);
	const recovery = encodeURIComponent(
		JSON.stringify(
			{
				version: 2,
				fileName: batch.fileName,
				accountId: batch.portfolioId,
				currency: batch.sourceCurrency,
				summary: batch.summary,
				outcomes: batch.outcomes,
				rows: batch.rows,
			},
			null,
			2,
		),
	);
	const rows = batch.outcomes.slice(page * 25, (page + 1) * 25);

	return (
		<>
			<p className="text-sm font-medium">
				{batch.fileName} · {batch.kind} · {batch.state}
			</p>
			<p className="text-sm">
				Source realized net{" "}
				{formatMoneyWithCode(
					Number(batch.summary.sourceNet),
					batch.sourceCurrency,
				)}{" "}
				· Applied account change{" "}
				{formatMoneyWithCode(
					Number(batch.summary.accountDelta),
					batch.sourceCurrency,
				)}
			</p>
			<p className="text-xs">
				Expected change {batch.summary.expectedAccountDelta}; actual change{" "}
				{batch.summary.accountDelta}. {batch.summary.actualMutations ?? 0} of{" "}
				{batch.summary.expectedMutations} expected mutations verified.{" "}
				{batch.summary.reconciled === true
					? "Applied effects reconciled."
					: "Effects have not been reconciled."}{" "}
				{batch.summary.unknownAmounts} unknown amounts ·{" "}
				{batch.summary.excluded} excluded records. Source reconciliation covers
				this CSV, not the complete broker account.
			</p>
			{batch.summary.openRows > 0 && (
				<p className="text-xs text-muted-foreground">
					{batch.summary.openRows} open records · reported net{" "}
					{batch.summary.openNet}. Open results are excluded from realized
					account changes.
				</p>
			)}
			{batch.summary.warnings.map((warning) => (
				<p key={warning} className="text-xs text-amber-600">
					{warning}
				</p>
			))}
			<a
				className="inline-block text-sm underline"
				download={`import-${batch.id}-recovery.json`}
				href={`data:application/json;charset=utf-8,${recovery}`}
			>
				Download source snapshots and recovery details
			</a>
			<ul className="space-y-2">
				{rows.map((row) => (
					<li key={row.rowNumber} className="rounded border p-2 text-xs">
						Record {row.rowNumber}: {row.action}{" "}
						{row.recordId && `#${row.recordId}`} · {row.reason}
						{row.undoState !== "none" && (
							<p>
								Undo: {row.undoState} {row.undoReason}
							</p>
						)}
					</li>
				))}
			</ul>
			{batch.outcomes.length > 25 && (
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={page === 0}
						onClick={() => setPage(page - 1)}
					>
						Previous records
					</Button>
					<span className="text-xs">Page {page + 1}</span>
					<Button
						size="sm"
						variant="outline"
						disabled={(page + 1) * 25 >= batch.outcomes.length}
						onClick={() => setPage(page + 1)}
					>
						Next records
					</Button>
				</div>
			)}
		</>
	);
}
