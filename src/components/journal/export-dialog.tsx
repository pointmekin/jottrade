import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useAccounts } from "@/hooks/use-accounts";
import { useExportDownload } from "@/hooks/use-export-download";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { type JournalSearch, toTradeQuery } from "@/lib/journal-search";
import { describePeriod, resolvePeriod } from "@/lib/period";
import { exportTradesCsv } from "@/server/exportActions";

interface ExportDialogProps {
	search: JournalSearch;
	total: number;
}

export function ExportDialog({ search, total }: ExportDialogProps) {
	const [isOpen, setIsOpen] = useState(false);
	const { activeAccount } = useAccounts();
	const download = useExportDownload(
		async (portfolioId: number) => {
			const filter = toTradeQuery(
				search,
				resolvePeriod({
					preset: search.period,
					from: search.dateFrom,
					to: search.dateTo,
				}),
			);
			const result = await exportTradesCsv({
				data: { ...filter, portfolioId },
			});
			return {
				fileName: result.fileName,
				content: result.csv,
				mimeType: "text/csv;charset=utf-8",
				summary: `Exported ${result.rowCount} ${result.rowCount === 1 ? "trade" : "trades"}`,
			};
		},
		() => setIsOpen(false),
	);
	const tradeNoun = total === 1 ? "trade" : "trades";
	const downloadLabel =
		total === 0 ? "No trades to export" : `Download ${total} ${tradeNoun}`;
	const periodLabel = describePeriod({
		preset: search.period,
		from: search.dateFrom,
		to: search.dateTo,
	});

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" disabled={!activeAccount}>
					<Download className="mr-2 h-4 w-4" />
					Export
				</Button>
			</DialogTrigger>
			<DialogContent className="bg-card sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Export trades to CSV</DialogTitle>
					<DialogDescription>
						The file holds every trade that matches the current filters, not
						only the page you see.
					</DialogDescription>
				</DialogHeader>
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
					<dt className="text-muted-foreground">Trades</dt>
					<dd className="font-medium tabular-nums">{total}</dd>
					<dt className="text-muted-foreground">Account</dt>
					<dd>
						{activeAccount?.name} ({activeAccount?.currency ?? DEFAULT_CURRENCY}
						)
					</dd>
					<dt className="text-muted-foreground">Period</dt>
					<dd>{periodLabel}</dd>
				</dl>
				<p className="text-xs leading-5 text-muted-foreground">
					Amounts are exact decimals in the account currency. Times are UTC. The
					file opens in Excel and Google Sheets. To keep funding, reviews and
					strategies, download the full archive in Settings.
				</p>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setIsOpen(false)}>
						Cancel
					</Button>
					<Button
						disabled={!activeAccount || total === 0 || download.isPending}
						onClick={() => activeAccount && download.mutate(activeAccount.id)}
					>
						{download.isPending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Download className="mr-2 h-4 w-4" />
						)}
						{downloadLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
