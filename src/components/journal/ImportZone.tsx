import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useCallback, useState } from "react";
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
import { accountsQueryKey, useAccounts } from "@/hooks/use-accounts";
import { parseUtcDate } from "@/lib/date";
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
const MAX_CSV_SIZE = 5 * 1024 * 1024;

// Exness names the money columns `profit`/`commission`/`swap`; some MT4/5
// exports suffix them with `_usd`. Both spellings map to the same field.
const COLUMN_ALIASES = {
	ticket: ["ticket"],
	symbol: ["symbol"],
	type: ["type"],
	lots: ["lots"],
	openingTime: ["opening_time_utc"],
	closingTime: ["closing_time_utc"],
	openingPrice: ["opening_price"],
	closingPrice: ["closing_price"],
	profit: ["profit", "profit_usd"],
	commission: ["commission", "commission_usd"],
	swap: ["swap", "swap_usd"],
	closeReason: ["close_reason"],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;
type ColumnMap = Partial<Record<ColumnKey, string>>;

const REQUIRED_COLUMNS: ColumnKey[] = [
	"ticket",
	"symbol",
	"type",
	"lots",
	"openingTime",
	"openingPrice",
	"profit",
];

function resolveColumns(fields: string[]): ColumnMap {
	const present = new Set(fields.map((f) => f.trim().toLowerCase()));
	const resolved: ColumnMap = {};
	for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
		const match = COLUMN_ALIASES[key].find((alias) => present.has(alias));
		if (match) resolved[key] = match;
	}
	return resolved;
}

function cell(row: CsvRow, columns: ColumnMap, key: ColumnKey) {
	const column = columns[key];
	return column ? row[column] : undefined;
}

/** Exness leaves a numeric cell empty to mean zero, so a blank is not an error. */
function parseNumber(value: string | undefined): number | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed.replace(/[\s,]/g, ""));
	return Number.isFinite(parsed) ? parsed : null;
}

export function ImportZone({ onSuccess }: { onSuccess?: () => void }) {
	const [parsedData, setParsedData] = useState<ImportedTrade[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);

	const queryClient = useQueryClient();

	// Mapping logic for standard MT4/5 and Exness CSV exports
	// ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
	const mapCsvToTrade = useCallback(
		(row: CsvRow, columns: ColumnMap): ImportedTrade | null => {
			const ticket = cell(row, columns, "ticket")?.trim();
			const symbol = cell(row, columns, "symbol")?.trim();
			const side = cell(row, columns, "type")?.trim();
			const entryDate = parseUtcDate(cell(row, columns, "openingTime"));
			const entryPrice = parseNumber(cell(row, columns, "openingPrice"));
			const quantity = parseNumber(cell(row, columns, "lots"));

			if (!ticket || !symbol || !side) return null;
			if (!entryDate || entryPrice === null || quantity === null) return null;

			const profit = parseNumber(cell(row, columns, "profit")) ?? 0;
			const commission = parseNumber(cell(row, columns, "commission")) ?? 0;
			const swap = parseNumber(cell(row, columns, "swap")) ?? 0;

			// The broker reports profit gross of costs; commission and swap arrive signed.
			const netPnl = profit + commission + swap;
			const fees = Math.abs(commission) + Math.abs(swap);
			const closeReason = cell(row, columns, "closeReason")?.trim();

			return {
				ticket,
				symbol,
				side, // 'buy' or 'sell'
				entryDate,
				entryPrice: String(entryPrice),
				quantity: String(quantity),
				exitDate: parseUtcDate(cell(row, columns, "closingTime")),
				exitPrice: parseNumber(cell(row, columns, "closingPrice"))?.toString(),
				fees: fees.toFixed(2),
				netPnl: netPnl.toFixed(2),
				notes: `Ticket: ${ticket} | Reason: ${closeReason || "N/A"}`,
			};
		},
		[],
	);

	const onDrop = useCallback(
		(acceptedFiles: File[]) => {
			setError(null);
			const file = acceptedFiles[0];
			if (!file) return;

			if (
				file.type !== "text/csv" &&
				!file.name.toLowerCase().endsWith(".csv")
			) {
				setError("Please upload a CSV file.");
				return;
			}

			Papa.parse<CsvRow>(file, {
				header: true,
				skipEmptyLines: true,
				complete: (results) => {
					if (results.errors.length > 0) {
						console.error(results.errors);
						setError("Error parsing CSV. Check console.");
						return;
					}

					const columns = resolveColumns(results.meta.fields ?? []);
					const missing = REQUIRED_COLUMNS.filter((key) => !columns[key]);
					if (missing.length > 0) {
						const names = missing
							.map((key) => COLUMN_ALIASES[key].join(" or "))
							.join(", ");
						setError(`CSV is missing required columns: ${names}.`);
						return;
					}

					const mapped: ImportedTrade[] = [];
					let skipped = 0;
					results.data.forEach((row) => {
						const trade = mapCsvToTrade(row, columns);
						if (trade) {
							mapped.push(trade);
						} else {
							skipped++;
						}
					});

					if (mapped.length === 0) {
						setError("No valid trades found in CSV. Check format.");
						return;
					}

					// A profit column that is blank on every row means the wrong export
					// variant. Importing it would silently flatten the equity curve.
					if (mapped.every((trade) => Number(trade.netPnl) === 0)) {
						setError(
							`Every row has zero P&L. Check that the "${columns.profit}" column holds values.`,
						);
						return;
					}

					if (skipped > 0) {
						setError(
							`${skipped} row(s) skipped: incomplete or unreadable values.`,
						);
					}
					setParsedData(mapped);
					setPreviewOpen(true);
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
		onDropRejected: () => setError("Choose one CSV file smaller than 5 MB."),
		multiple: false,
		maxSize: MAX_CSV_SIZE,
		accept: { "text/csv": [".csv"] },
	});

	const { activeAccount } = useAccounts();

	const { mutate: doImport, isPending } = useMutation({
		mutationFn: (trades: ImportedTrade[]) => {
			if (!activeAccount) {
				return Promise.reject(new Error("No active account."));
			}
			return importTrades({
				data: { trades, portfolioId: activeAccount.id },
			} as never);
		},
		onSuccess: (res) => {
			queryClient.invalidateQueries({ queryKey: ["trades"] });
			queryClient.invalidateQueries({ queryKey: accountsQueryKey });
			setParsedData([]);
			setPreviewOpen(false);
			// Toast success?
			const duplicates = res.skipped
				? ` ${res.skipped} duplicate(s) skipped.`
				: "";
			toast.success(`Imported ${res.count} trades.${duplicates}`);
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
								<TableRow
									key={`${row.ticket}-${row.exitDate ?? row.entryDate}`}
								>
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
