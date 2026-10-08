import { Download, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/app-page-header";
import { Button } from "@/components/ui/button";
import { useExportDownload } from "@/hooks/use-export-download";
import { exportArchive } from "@/server/exportActions";

export function DataExport() {
	const download = useExportDownload(async () => {
		const result = await exportArchive();
		const { accounts, trades, cashFlows } = result.counts;
		return {
			fileName: result.fileName,
			content: result.json,
			mimeType: "application/json;charset=utf-8",
			summary: `Archived ${accounts} accounts, ${trades} trades, ${cashFlows} funding entries`,
		};
	});

	return (
		<div className="surface mt-6 space-y-4 p-5">
			<SectionHeading title="Your data" detail="Full archive" />
			<div className="flex flex-wrap items-center justify-between gap-5">
				<p className="max-w-prose text-sm text-muted-foreground">
					One JSON file with all your accounts, trades, funding entries,
					strategies, tags and reviews. Screenshots are listed by link and are
					not included. It holds no password or sign-in data.
				</p>
				<Button
					variant="outline"
					disabled={download.isPending}
					onClick={() => download.mutate()}
				>
					{download.isPending ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Download className="mr-2 h-4 w-4" />
					)}
					Download archive
				</Button>
			</div>
		</div>
	);
}
