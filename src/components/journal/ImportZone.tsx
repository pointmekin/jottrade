import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/use-accounts";
import { invalidateTradeQueries } from "@/lib/query-keys";
import {
	type CsvRow,
	type ImportedTrade,
	parseTradeRows,
} from "@/lib/trade-import";
import { cn } from "@/lib/utils";
import { importTrades } from "@/server/importActions";
import { ImportPreview } from "./import-preview";

const MAX_CSV_SIZE = 5 * 1024 * 1024;

const isCsv = (file: File) =>
	file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");

function useImportTrades(
	onImported: () => void,
	onFailed: (message: string) => void,
) {
	const queryClient = useQueryClient();
	const { activeAccount } = useAccounts();
	return useMutation({
		mutationFn: (trades: ImportedTrade[]) => {
			if (!activeAccount) {
				return Promise.reject(new Error("No active account."));
			}
			return importTrades({ data: { trades, portfolioId: activeAccount.id } });
		},
		onSuccess: (result) => {
			invalidateTradeQueries(queryClient);
			const duplicates = result.skipped
				? ` ${result.skipped} duplicate(s) skipped.`
				: "";
			toast.success(`Imported ${result.count} trades.${duplicates}`);
			onImported();
		},
		onError: (cause) => onFailed(`Import failed: ${cause.message}`),
	});
}

export function ImportZone({ onSuccess }: { onSuccess?: () => void }) {
	const [preview, setPreview] = useState<ImportedTrade[]>([]);
	const [error, setError] = useState<string | null>(null);
	const importMutation = useImportTrades(() => {
		setPreview([]);
		onSuccess?.();
	}, setError);

	const readFile = (file: File) => {
		Papa.parse<CsvRow>(file, {
			header: true,
			skipEmptyLines: true,
			complete: (results) => {
				if (results.errors.length > 0) {
					setError(`Error parsing CSV: ${results.errors[0].message}`);
					return;
				}
				const parsed = parseTradeRows(results.data, results.meta.fields ?? []);
				if ("error" in parsed) {
					setError(parsed.error);
					return;
				}
				if (parsed.skipped > 0) {
					setError(
						`${parsed.skipped} row(s) skipped: incomplete or unreadable values.`,
					);
				}
				setPreview(parsed.trades);
			},
			error: (cause) => setError(`Failed to read file: ${cause.message}`),
		});
	};
	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: ([file]) => {
			setError(null);
			if (!file) return;
			if (!isCsv(file)) {
				setError("Please upload a CSV file.");
				return;
			}
			readFile(file);
		},
		onDropRejected: () => setError("Choose one CSV file smaller than 5 MB."),
		multiple: false,
		maxSize: MAX_CSV_SIZE,
		accept: { "text/csv": [".csv"] },
	});

	if (preview.length > 0) {
		return (
			<ImportPreview
				trades={preview}
				isImporting={importMutation.isPending}
				onCancel={() => setPreview([])}
				onConfirm={() => importMutation.mutate(preview)}
			/>
		);
	}

	return (
		<div className="w-full">
			<div
				{...getRootProps()}
				className={cn(
					"cursor-pointer border border-dashed p-8 text-center transition-colors",
					isDragActive
						? "border-ring bg-accent/60"
						: "border-border hover:bg-accent/35",
					error && "border-destructive/50 bg-destructive/10",
				)}
			>
				<input {...getInputProps()} />
				<div className="flex flex-col items-center justify-center space-y-4">
					<div className="border border-border bg-background p-4">
						<UploadCloud className="h-8 w-8 text-ring" />
					</div>
					<div>
						<p className="text-lg font-semibold">
							{isDragActive ? "Drop CSV here" : "Drag & drop CSV file"}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Supports Standard Format (MT4/5)
						</p>
					</div>
				</div>
			</div>
			{error && (
				<div className="mt-4 flex items-center border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
					<AlertCircle className="mr-2 h-4 w-4" />
					{error}
				</div>
			)}
		</div>
	);
}
