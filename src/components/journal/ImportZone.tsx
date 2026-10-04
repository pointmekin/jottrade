import { ImportKind } from "@/lib/import-batch";
import { ImportBatchZone } from "./import-batch-zone";
export function ImportZone({ onSuccess }: { onSuccess?: () => void }) {
	return <ImportBatchZone kind={ImportKind.Trades} onSuccess={onSuccess} />;
}
