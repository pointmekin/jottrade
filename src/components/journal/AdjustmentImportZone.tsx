import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ADJUSTMENT_REQUIRED_HEADERS } from "@/lib/adjustment-import";
import { ImportKind } from "@/lib/import-batch";
import { QueryKey } from "@/lib/query-keys";
import { ImportBatchZone } from "./import-batch-zone";

async function loadExportScript() {
	const response = await fetch("/exness-adjustments-export.js");
	if (!response.ok)
		throw Error("The Exness export script could not be loaded.");
	return response.text();
}
export function AdjustmentImportZone({
	onSuccess,
}: {
	onSuccess?: () => void;
}) {
	const { data: script, error } = useQuery({
		queryKey: [QueryKey.ExnessExportScript],
		queryFn: loadExportScript,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const [copyError, setCopyError] = useState<string | null>(null);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(script ?? "");
			setCopyError(null);
		} catch {
			setCopyError("Could not copy. Select the script and copy it manually.");
		}
	};
	return (
		<div className="space-y-4">
			<details>
				<summary className="cursor-pointer text-sm">
					Create an Exness adjustment CSV
				</summary>
				<p className="mt-2 text-xs">
					Open the Exness Dividends page for the intended account, open your
					browser console, and run this script. Upload the downloaded CSV below.
					Check collection warnings against the broker page.
				</p>
				<Button size="sm" className="my-2" disabled={!script} onClick={copy}>
					Copy script
				</Button>
				<pre className="max-h-28 overflow-auto whitespace-pre-wrap bg-muted p-3 text-[11px]">
					{script ?? "Loading script…"}
				</pre>
				{(error || copyError) && (
					<p role="alert" className="text-xs text-destructive">
						{copyError ?? error?.message}
					</p>
				)}
			</details>
			<p className="text-xs leading-5 text-muted-foreground">
				Required columns: {ADJUSTMENT_REQUIRED_HEADERS.join(", ")}. The export
				script above creates them.
			</p>
			<ImportBatchZone kind={ImportKind.Adjustments} onSuccess={onSuccess} />
		</div>
	);
}
