import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import { QueryKey } from "@/lib/query-keys";
import { getImportHistory } from "@/server/importActions";
import { ImportBatchDetail } from "./import-batch-detail";

function AccountImportHistory({ accountId }: { accountId: number }) {
	const { data: session } = authClient.useSession();
	const [cursors, setCursors] = useState<
		({ createdAt: string; id: string } | undefined)[]
	>([undefined]);
	const cursor = cursors.at(-1);
	const [selected, setSelected] = useState<string | null>(null);
	const query = useQuery({
		queryKey: [QueryKey.ImportBatches, session?.user.id, accountId, cursor],
		queryFn: () =>
			getImportHistory({ data: { portfolioId: accountId, cursor } }),
		enabled: Boolean(session?.user.id),
	});
	const batch = query.data?.find((item) => item.id === selected);
	if (batch)
		return (
			<ImportBatchDetail
				key={batch.id}
				initial={batch}
				onClose={() => setSelected(null)}
			/>
		);
	return (
		<div className="space-y-3">
			<p className="text-sm">Recent imports for the selected account</p>
			<p className="text-xs text-muted-foreground">
				Legacy imports have no historical batch or undo. Reimport their original
				source to match them safely.
			</p>
			{query.isPending && <p className="text-sm">Loading history…</p>}
			{query.error && (
				<p role="alert" className="text-sm text-destructive">
					{query.error.message}
				</p>
			)}
			{query.data?.length === 0 && (
				<p className="text-sm">No import batches yet.</p>
			)}
			<ul className="space-y-2">
				{query.data?.map((item) => (
					<li
						key={item.id}
						className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
					>
						<div>
							<p className="text-sm">{item.fileName}</p>
							<p className="text-xs text-muted-foreground">
								{item.kind} · {item.state} · {item.summary.rows} source records
								·{" "}
								{new Date(item.createdAt)
									.toISOString()
									.replace("T", " ")
									.slice(0, 19)}{" "}
								UTC
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setSelected(item.id)}
						>
							Details and recovery
						</Button>
					</li>
				))}
			</ul>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={cursors.length === 1 || query.isPending}
					onClick={() => setCursors((values) => values.slice(0, -1))}
				>
					Newer batches
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={query.isPending || (query.data?.length ?? 0) < 50}
					onClick={() => {
						const last = query.data?.at(-1);
						if (last)
							setCursors((values) => [
								...values,
								{
									createdAt: new Date(last.createdAt).toISOString(),
									id: last.id,
								},
							]);
					}}
				>
					Older batches
				</Button>
			</div>
		</div>
	);
}
export function ImportHistory() {
	const { activeAccount } = useAccounts();
	if (!activeAccount)
		return <p className="text-sm">Choose an account to view import history.</p>;
	return (
		<AccountImportHistory key={activeAccount.id} accountId={activeAccount.id} />
	);
}
