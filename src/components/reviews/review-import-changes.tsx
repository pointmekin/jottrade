import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ImportBatchReceipt } from "@/components/journal/import-batch-receipt";
import { Button } from "@/components/ui/button";
import type { ReviewImportChange } from "@/db/review-import-history";
import { authClient } from "@/lib/auth-client";
import { QueryKey } from "@/lib/query-keys";
import { getImportBatch } from "@/server/importActions";

export function ReviewImportChanges({
	changes,
}: {
	changes: ReviewImportChange[];
}) {
	const [selected, setSelected] = useState<string | null>(null);
	const { data: session } = authClient.useSession();
	const batch = useQuery({
		queryKey: [QueryKey.ImportBatch, session?.user.id, selected],
		queryFn: () => getImportBatch({ data: { batchId: selected as string } }),
		enabled: Boolean(selected && session?.user.id),
	});
	if (!changes.length) return null;
	return (
		<details className="text-sm">
			<summary>Import history for these sources</summary>
			<ul className="mt-2 space-y-2">
				{changes.map((change) => (
					<li key={`${change.batchId}:${change.rowNumber}`}>
						<Button
							variant="link"
							className="h-auto max-w-full whitespace-normal p-0 text-left"
							onClick={() => setSelected(change.batchId)}
						>
							{change.fileName} · {change.action} #{change.recordId}
						</Button>
						<p className="text-xs text-muted-foreground">{change.reason}</p>
					</li>
				))}
			</ul>
			{batch.isError && <p role="alert">{batch.error.message}</p>}
			{selected && batch.isPending && <p>Loading batch...</p>}
			{batch.data && (
				<div className="mt-3 border-t pt-3">
					<ImportBatchReceipt batch={batch.data} />
				</div>
			)}
		</details>
	);
}
