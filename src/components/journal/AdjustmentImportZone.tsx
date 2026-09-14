import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertCircle,
	Check,
	Clipboard,
	Loader2,
	UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	type ImportedAdjustment,
	parseAdjustmentCsv,
} from "@/lib/adjustment-import";
import { importAdjustments } from "@/server/portfolioActions";

const MAX_CSV_SIZE = 5 * 1024 * 1024;

export function AdjustmentImportZone({
	onSuccess,
}: {
	onSuccess?: () => void;
}) {
	const queryClient = useQueryClient();
	const [script, setScript] = useState("");
	const [parsedData, setParsedData] = useState<ImportedAdjustment[]>([]);
	const [skippedRows, setSkippedRows] = useState(0);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/exness-adjustments-export.js")
			.then((response) => {
				if (!response.ok) throw new Error("Script unavailable");
				return response.text();
			})
			.then((text) => setScript(text.trimEnd()))
			.catch(() => setError("The Exness export script could not be loaded."));
	}, []);

	const copyScript = async () => {
		if (!script) return;
		try {
			await navigator.clipboard.writeText(script);
			toast.success("Exness export script copied");
		} catch {
			setError("Could not copy the script. Select and copy it manually.");
		}
	};

	const onDrop = useCallback(async (acceptedFiles: File[]) => {
		setError(null);
		const file = acceptedFiles[0];
		if (!file) return;

		try {
			const result = parseAdjustmentCsv(await file.text());
			if (result.adjustments.length === 0) {
				setError("No valid adjustment rows were found in this CSV.");
				return;
			}
			setParsedData(result.adjustments);
			setSkippedRows(result.skipped);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "The adjustment CSV could not be read.",
			);
		}
	}, []);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		onDropRejected: () => setError("Choose one CSV file smaller than 5 MB."),
		multiple: false,
		maxSize: MAX_CSV_SIZE,
		accept: { "text/csv": [".csv"] },
	});

	const importMutation = useMutation({
		mutationFn: (adjustments: ImportedAdjustment[]) =>
			importAdjustments({ data: { adjustments } } as never),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["cash-flows"] });
			queryClient.invalidateQueries({ queryKey: ["analytics"] });
			queryClient.invalidateQueries({ queryKey: ["advanced-analytics"] });
			const duplicates = result.skipped
				? ` ${result.skipped} duplicate(s) skipped.`
				: "";
			toast.success(`Imported ${result.count} adjustments.${duplicates}`);
			setParsedData([]);
			onSuccess?.();
		},
		onError: (cause) => {
			setError(
				cause instanceof Error
					? cause.message
					: "The import could not be saved.",
			);
		},
	});

	if (parsedData.length > 0) {
		return (
			<div className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 className="text-base font-semibold">
							Review {parsedData.length} adjustments
						</h3>
						{skippedRows > 0 && (
							<p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
								{skippedRows} incomplete row(s) will be skipped.
							</p>
						)}
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => setParsedData([])}>
							Cancel
						</Button>
						<Button
							onClick={() => importMutation.mutate(parsedData)}
							disabled={importMutation.isPending}
						>
							{importMutation.isPending && (
								<Loader2 className="size-4 animate-spin" />
							)}
							Confirm import
						</Button>
					</div>
				</div>

				<div className="max-h-80 overflow-auto border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Timestamp</TableHead>
								<TableHead>Symbol</TableHead>
								<TableHead>Position</TableHead>
								<TableHead className="text-right">Adjustment</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{parsedData.slice(0, 50).map((row) => (
								<TableRow
									key={`${row.positionId}-${row.occurredAt}-${row.amount}`}
								>
									<TableCell className="whitespace-nowrap">
										{new Date(row.occurredAt).toLocaleString()}
									</TableCell>
									<TableCell>{row.symbol || "—"}</TableCell>
									<TableCell>{row.positionId || "—"}</TableCell>
									<TableCell
										className={`text-right font-data ${row.amount >= 0 ? "text-success" : "text-destructive"}`}
									>
										{row.amount >= 0 ? "+" : ""}
										{row.amount.toFixed(2)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="space-y-3 rounded-md border border-border bg-background/45 p-4">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-sm font-medium">Create the adjustment CSV</p>
						<ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
							<li>Open the Exness Dividends page and select the account.</li>
							<li>Open your browser developer tools, then open Console.</li>
							<li>Copy the script below, paste it into Console, and run it.</li>
							<li>Upload the downloaded adjustment CSV below.</li>
						</ol>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={copyScript}
						disabled={!script}
					>
						<Clipboard className="size-4" />
						Copy script
					</Button>
				</div>
				<pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-sm bg-muted p-3 font-mono text-[11px] leading-4 text-muted-foreground">
					{script || "Loading export script…"}
				</pre>
			</div>

			<div
				{...getRootProps()}
				className={`cursor-pointer border border-dashed p-8 text-center transition-colors ${
					isDragActive
						? "border-ring bg-accent/60"
						: "border-border hover:bg-accent/35"
				} ${error ? "border-destructive/50 bg-destructive/10" : ""}`}
			>
				<input {...getInputProps()} />
				<div className="flex flex-col items-center gap-3">
					<div className="border border-border bg-background p-4">
						{isDragActive ? (
							<Check className="size-8 text-ring" />
						) : (
							<UploadCloud className="size-8 text-ring" />
						)}
					</div>
					<div>
						<p className="text-base font-semibold">
							{isDragActive
								? "Drop adjustment CSV here"
								: "Upload adjustment CSV"}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Only CSVs created by the Exness adjustment script
						</p>
					</div>
				</div>
			</div>

			{error && (
				<div className="flex items-center border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
					<AlertCircle className="mr-2 size-4 shrink-0" />
					{error}
				</div>
			)}
		</div>
	);
}
