import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ImportedTrade } from "@/lib/trade-import";

const PREVIEW_ROWS = 50;

export function ImportPreview({
	trades,
	isImporting,
	onCancel,
	onConfirm,
}: {
	trades: ImportedTrade[];
	isImporting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold">
					Review Import ({trades.length} trades)
				</h3>
				<div className="space-x-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={onConfirm} disabled={isImporting}>
						{isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
							<TableHead>{"Net P&L"}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{trades.slice(0, PREVIEW_ROWS).map((row) => (
							<TableRow key={`${row.ticket}-${row.exitDate ?? row.entryDate}`}>
								<TableCell>{row.entryDate.substring(0, 10)}</TableCell>
								<TableCell>{row.symbol}</TableCell>
								<TableCell>{row.side}</TableCell>
								<TableCell>{row.quantity}</TableCell>
								<TableCell
									className={
										Number(row.netPnl) >= 0
											? "text-success"
											: "text-destructive"
									}
								>
									{row.netPnl}
								</TableCell>
							</TableRow>
						))}
						{trades.length > PREVIEW_ROWS && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-center text-muted-foreground"
								>
									... and {trades.length - PREVIEW_ROWS} more
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
