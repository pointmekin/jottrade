import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importTrades } from "@/server/importActions";
import { UploadCloud, AlertCircle, Loader2 } from "lucide-react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export function ImportZone({ onSuccess }: { onSuccess?: () => void }) {
	const [parsedData, setParsedData] = useState<any[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);

	const queryClient = useQueryClient();

	// Mapping logic for standard MT4/5 CSV
	// ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission_usd,swap_usd,profit_usd,equity_usd,margin_level,close_reason
	const mapCsvToTrade = (row: any) => {
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
	};

	const onDrop = useCallback((acceptedFiles: File[]) => {
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

				const mapped: any[] = [];
				results.data.forEach((row: any) => {
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
				setError("Failed to read file: " + err.message);
			},
		});
	}, []);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		multiple: false,
	});

	const { mutate: doImport, isPending } = useMutation({
		mutationFn: (trades: any[]) => importTrades({ data: { trades } }),
		onSuccess: (res) => {
			queryClient.invalidateQueries({ queryKey: ["trades"] });
			setParsedData([]);
			setPreviewOpen(false);
			// Toast success?
			alert(`Success! Imported ${res.count} trades.`);
			if (onSuccess) onSuccess();
		},
		onError: (err) => {
			setError("Import failed: " + err.message);
		},
	});

	if (previewOpen && parsedData.length > 0) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold text-zinc-100">
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

				<div className="border border-zinc-800 rounded-md max-h-[400px] overflow-auto">
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
							{parsedData.slice(0, 50).map((row, idx) => (
								<TableRow key={idx}>
									<TableCell>{row.entryDate?.substring(0, 10)}</TableCell>
									<TableCell>{row.symbol}</TableCell>
									<TableCell>{row.side}</TableCell>
									<TableCell>{row.quantity}</TableCell>
									<TableCell
										className={
											parseFloat(row.netPnl) >= 0
												? "text-green-500"
												: "text-red-500"
										}
									>
										{row.netPnl}
									</TableCell>
								</TableRow>
							))}
							{parsedData.length > 50 && (
								<TableRow>
									<TableCell colSpan={5} className="text-center text-zinc-500">
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
				className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
        ${isDragActive ? "border-primary bg-primary/10" : "border-zinc-800 hover:bg-zinc-900/50"}
        ${error ? "border-red-500/50 bg-red-500/10" : ""}`}
			>
				<input {...getInputProps()} />
				<div className="flex flex-col items-center justify-center space-y-4">
					<div className="p-4 bg-zinc-900 rounded-full border border-zinc-800">
						<UploadCloud className="h-8 w-8 text-zinc-400" />
					</div>
					<div>
						<p className="text-lg font-medium text-zinc-200">
							{isDragActive ? "Drop CSV here" : "Drag & drop CSV file"}
						</p>
						<p className="text-sm text-zinc-500 mt-1">
							Supports Standard Format (MT4/5)
						</p>
					</div>
				</div>
			</div>

			{error && (
				<div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-md flex items-center text-red-400 text-sm">
					<AlertCircle className="h-4 w-4 mr-2" />
					{error}
				</div>
			)}
		</div>
	);
}
