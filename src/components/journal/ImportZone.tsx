import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { importTrades } from "@/server/importActions";

type ImportedTrade = {
	ticket: string;
	symbol: string;
	side: string;
	entryDate: string;
	entryPrice: string;
	quantity: string;
	exitDate?: string;
	exitPrice?: string;
	fees: string;
	netPnl: string;
	notes: string;
};

type CsvRow = Record<string, string | undefined>;

export function ImportZone({ onSuccess }: { onSuccess?: () => void }) {
	const [parsedData, setParsedData] = useState<ImportedTrade[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);

	const queryClient = useQueryClient();

	// Mapping logic for standard MT4/5 CSV
	// ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission_usd,swap_usd,profit_usd,equity_usd,margin_level,close_reason
	const mapCsvToTrade = useCallback((row: CsvRow): ImportedTrade | null => {
		// Basic validation
		if (!row.ticket || !row.symbol) return null;

		const profit = parseFloat(row.profit_usd || 0);
		const commission = parseFloat(row.commission_usd || 0);
		const swap = parseFloat(row.swap_usd || 0);

		// MT4/5: Profit is usually Gross. Net = Profit + Commission + Swap
		// Commission and swap are usually negative values in the CSV loop, but let's just add them algebraically.
		const netPnl = profit + commission + swap;

		// Fees: usually we want to see the total cost.
		// If commission is -5 and swap is -1, fees are 6.
		const fees = Math.abs(commission) + Math.abs(swap);

		return {
			ticket: row.ticket,
			symbol: row.symbol,
			side: row.type, // 'buy' or 'sell'
			entryDate: row.opening_time_utc,
			entryPrice: row.opening_price,
			quantity: row.lots,
			exitDate: row.closing_time_utc,
			exitPrice: row.closing_price,
			fees: fees.toFixed(2),
			netPnl: netPnl.toFixed(2),
			notes: `Ticket: ${row.ticket} | Reason: ${row.close_reason || "N/A"}`,
		};
	}, []);

	const onDrop = useCallback(
		(acceptedFiles: File[]) => {
			setError(null);
			const file = acceptedFiles[0];
			if (!file) return;

			if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
				setError("Please upload a CSV file.");
				return;
			}

			Papa.parse(file, {
				header: true,
				skipEmptyLines: true,
				complete: (results) => {
					if (results.errors.length > 0) {
						console.error(results.errors);
						setError("Error parsing CSV. Check console.");
						return;
					}

					const mapped: ImportedTrade[] = [];
					results.data.forEach((row) => {
						const trade = mapCsvToTrade(row);
						if (trade) mapped.push(trade);
					});

					if (mapped.length === 0) {
						setError("No valid trades found in CSV. Check format.");
					} else {
						setParsedData(mapped);
						setPreviewOpen(true);
					}
				},
				error: (err) => {
					setError(`Failed to read file: ${err.message}`);
				},
			});
		},
		[mapCsvToTrade],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		multiple: false,
	});

	const { mutate: doImport, isPending } = useMutation({
		mutationFn: (trades: ImportedTrade[]) => importTrades({ data: { trades } }),
		onSuccess: (res) => {
			queryClient.invalidateQueries({ queryKey: ["trades"] });
			setParsedData([]);
			setPreviewOpen(false);
			// Toast success?
			alert(`Success! Imported ${res.count} trades.`);
			if (onSuccess) onSuccess();
		},
		onError: (err) => {
			setError(`Import failed: ${err.message}`);
		},
	});

	if (previewOpen && parsedData.length > 0) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">
						Review Import ({parsedData.length} trades)
					</h3>
					<div className="space-x-2">
						<Button
							variant="outline"
							onClick={() => {
								setParsedData([]);
								setPreviewOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button onClick={() => doImport(parsedData)} disabled={isPending}>
							{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Confirm Import
						</Button>
					</div>
				</div>

				<div className="max-h-[400px] overflow-auto border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Symbol</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Lots</TableHead>
								<TableHead>Net P&L</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{parsedData.slice(0, 50).map((row) => (
								<TableRow key={row.ticket}>
									<TableCell>{row.entryDate?.substring(0, 10)}</TableCell>
									<TableCell>{row.symbol}</TableCell>
									<TableCell>{row.side}</TableCell>
									<TableCell>{row.quantity}</TableCell>
									<TableCell
										className={
											parseFloat(row.netPnl) >= 0
												? "text-success"
												: "text-destructive"
										}
									>
										{row.netPnl}
									</TableCell>
								</TableRow>
							))}
							{parsedData.length > 50 && (
								<TableRow>
									<TableCell
										colSpan={5}
										className="text-center text-muted-foreground"
									>
										... and {parsedData.length - 50} more
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full">
			<div
				{...getRootProps()}
				className={`cursor-pointer border border-dashed p-8 text-center transition-colors
        ${isDragActive ? "border-ring bg-accent/60" : "border-border hover:bg-accent/35"}
        ${error ? "border-destructive/50 bg-destructive/10" : ""}`}
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
					<AlertCircle className="h-4 w-4 mr-2" />
					{error}
				</div>
			)}
		</div>
	);
}
