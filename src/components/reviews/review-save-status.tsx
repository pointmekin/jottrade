import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/lib/review-autosave";

const LABELS: Record<SaveStatus, string> = {
	saved: "Saved",
	local: "Changes saved on this device",
	saving: "Saving...",
	error: "Couldn't save to your account. Your draft is kept.",
	conflict:
		"Changed elsewhere. Reload to compare before choosing which text to save.",
	"storage-error": "Device storage failed. Copy your text before leaving.",
};
export function ReviewSaveStatus({
	status,
	error,
	retry,
	reload,
	resolve,
	serverText,
}: {
	status: SaveStatus;
	error: string | null;
	retry: () => void;
	reload: () => void;
	resolve: (keep: boolean) => void;
	serverText: string;
}) {
	return (
		<div className="space-y-2 text-xs" aria-live="polite">
			<p
				role={
					status === "error" || status === "storage-error" ? "alert" : "status"
				}
			>
				{LABELS[status]}
			</p>
			{error && <p className="text-destructive">{error}</p>}
			{(status === "error" || status === "storage-error") && (
				<Button variant="outline" size="sm" onClick={retry}>
					Retry save
				</Button>
			)}
			{status === "conflict" && (
				<div className="space-y-2">
					<pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border p-2">
						Server text: {serverText || "Empty"}
					</pre>
					<div className="flex flex-wrap gap-2">
						<Button size="sm" variant="outline" onClick={reload}>
							Reload server text
						</Button>
						<Button size="sm" onClick={() => resolve(true)}>
							Keep my draft
						</Button>
						<Button size="sm" variant="outline" onClick={() => resolve(false)}>
							Use server text
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
