import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { ImportReceipt } from "@/lib/import-batch";
import {
	invalidateAccountEntryQueries,
	invalidateTradeQueries,
	QueryKey,
} from "@/lib/query-keys";
import {
	getImportBatch,
	getImportUndoPreview,
	undoImportBatch,
} from "@/server/importActions";
import { ImportBatchReceipt } from "./import-batch-receipt";
export function ImportBatchDetail({
	initial,
	onClose,
}: {
	initial: ImportReceipt;
	onClose: () => void;
}) {
	const { data: session } = authClient.useSession();
	const userId = session?.user.id;
	const queryClient = useQueryClient();
	const [showUndo, setShowUndo] = useState(false);
	const details = useQuery({
		queryKey: [QueryKey.ImportBatch, userId, initial.id],
		queryFn: () => getImportBatch({ data: { batchId: initial.id } }),
		enabled: Boolean(userId),
	});
	const batch = details.data ?? initial;
	const preview = useQuery({
		queryKey: [QueryKey.ImportUndo, userId, batch.id, batch.revision],
		queryFn: () => getImportUndoPreview({ data: { batchId: batch.id } }),
		enabled: Boolean(userId) && showUndo,
	});
	const undo = useMutation({
		mutationFn: () => undoImportBatch({ data: { batchId: batch.id } }),
		onSuccess: () => {
			invalidateTradeQueries(queryClient);
			invalidateAccountEntryQueries(queryClient);
			setShowUndo(false);
		},
	});
	const error = details.error ?? preview.error ?? undo.error;
	return (
		<div className="space-y-3">
			<Button size="sm" variant="outline" onClick={onClose}>
				Back to history
			</Button>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error.message}
				</p>
			)}
			{details.isPending && <p className="text-sm">Loading batch records…</p>}
			{details.data && <ImportBatchReceipt batch={batch} />}
			{["applied", "partially-undone"].includes(batch.state) && (
				<Button variant="outline" onClick={() => setShowUndo(true)}>
					Preview selected batch undo
				</Button>
			)}
			{showUndo && (
				<div className="space-y-2 rounded border p-3">
					<p className="text-sm">
						Undo checks the latest state again when confirmed. Edited records
						and all persisted review references are protected.
					</p>
					{preview.isPending && <p className="text-xs">Checking records…</p>}
					{preview.data?.map((row) => (
						<p key={row.outcome.rowNumber} className="text-xs">
							Record {row.outcome.rowNumber}: {row.reason ?? "Eligible to undo"}
						</p>
					))}
					<Button
						disabled={
							preview.isPending || Boolean(preview.error) || undo.isPending
						}
						onClick={() => undo.mutate()}
					>
						{undo.isPending
							? "Undoing…"
							: "Undo eligible records in this batch"}
					</Button>
					<Button
						variant="outline"
						disabled={undo.isPending}
						onClick={() => setShowUndo(false)}
					>
						Cancel
					</Button>
				</div>
			)}
		</div>
	);
}
