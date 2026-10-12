import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/use-accounts";
import { authClient } from "@/lib/auth-client";
import type {
	ImportDecision,
	ImportKind,
	ImportReceipt,
} from "@/lib/import-batch";
import type { CsvRow } from "@/lib/import-values";
import {
	invalidateAccountEntryQueries,
	invalidateImportQueries,
	invalidateTradeQueries,
} from "@/lib/query-keys";
import {
	commitImport,
	repairImportRow,
	stageImport,
} from "@/server/importActions";
import { ImportPreview } from "./import-preview";
import { ImportSourceUpload } from "./import-source-upload";

function ScopedImportBatchZone({
	kind,
	onSuccess,
}: {
	kind: ImportKind;
	onSuccess?: () => void;
}) {
	const { accounts } = useAccounts();
	const queryClient = useQueryClient();
	const [batch, setBatch] = useState<ImportReceipt | null>(null);
	const updateStage = (receipt: ImportReceipt) => {
		setBatch(receipt);
		invalidateImportQueries(queryClient);
	};
	const stage = useMutation({
		mutationFn: async ({
			file,
			portfolioId,
			currency,
		}: {
			file: File;
			portfolioId: number;
			currency: string;
		}) =>
			stageImport({
				data: {
					portfolioId,
					kind,
					fileName: file.name,
					csv: await file.text(),
					sourceCurrency: currency,
				},
			}),
		onSuccess: updateStage,
	});
	const repair = useMutation({
		mutationFn: repairImportRow,
		onSuccess: updateStage,
	});
	const commit = useMutation({
		mutationFn: commitImport,
		onSuccess: (receipt) => {
			setBatch(receipt);
			invalidateTradeQueries(queryClient);
			invalidateAccountEntryQueries(queryClient);
			toast.success(
				`Import applied. Account change ${receipt.summary.accountDelta} ${receipt.sourceCurrency}.`,
			);
			onSuccess?.();
		},
	});
	const pending = stage.isPending || repair.isPending || commit.isPending;
	const error = stage.error ?? repair.error ?? commit.error;
	const apply = (decisions: ImportDecision[]) => {
		if (batch)
			commit.mutate({
				data: { batchId: batch.id, revision: batch.revision, decisions },
			});
	};
	const repairRow = (rowNumber: number, source: CsvRow) => {
		if (batch)
			repair.mutate({
				data: {
					batchId: batch.id,
					revision: batch.revision,
					rowNumber,
					source: Object.fromEntries(
						Object.entries(source).map(([key, value]) => [key, value ?? ""]),
					),
				},
			});
	};
	return (
		<div className="space-y-3">
			{error && (
				<p
					role="alert"
					className="rounded border border-destructive p-3 text-sm text-destructive"
				>
					{error.message} Your preview remains available for repair or retry.
				</p>
			)}
			{batch?.state === "staged" && (
				<ImportPreview
					key={`${batch.id}:${batch.revision}`}
					batch={batch}
					pending={pending}
					onCancel={() => setBatch(null)}
					onConfirm={apply}
					onRepair={repairRow}
				/>
			)}{" "}
			{batch && batch.state !== "staged" && (
				<div className="rounded border p-3 text-sm">
					Applied {batch.summary.rows} source records. Open Import history for
					row outcomes, undo and recovery.
				</div>
			)}
			{!batch && (
				<ImportSourceUpload
					pending={pending}
					onStage={(file, portfolioId, currency) => {
						stage.reset();
						repair.reset();
						commit.reset();
						stage.mutate({ file, portfolioId, currency });
					}}
				/>
			)}
			{batch && (
				<p className="text-xs text-muted-foreground">
					Pinned target:{" "}
					{accounts.find((account) => account.id === batch.portfolioId)?.name ??
						`account #${batch.portfolioId}`}
					.
				</p>
			)}
		</div>
	);
}

export function ImportBatchZone(props: {
	kind: ImportKind;
	onSuccess?: () => void;
}) {
	const { data: session } = authClient.useSession();
	if (!session?.user.id)
		return <p className="text-sm">Sign in to import into your account.</p>;
	return <ScopedImportBatchZone key={session.user.id} {...props} />;
}
