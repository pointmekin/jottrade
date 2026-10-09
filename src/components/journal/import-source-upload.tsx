import { useId, useState } from "react";
import { ErrorCode, useDropzone } from "react-dropzone";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/use-accounts";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { IMPORT_TOO_LARGE, MAX_IMPORT_BYTES } from "@/lib/import-source";

const REJECTION_MESSAGES: Record<string, string> = {
	[ErrorCode.FileInvalidType]:
		"This file is not a CSV. Upload the .csv file from Exness.",
	[ErrorCode.FileTooLarge]: IMPORT_TOO_LARGE,
	[ErrorCode.FileTooSmall]:
		"This file is empty. Download the CSV from Exness again.",
	[ErrorCode.TooManyFiles]: "Upload one file at a time.",
};
export function ImportSourceUpload({
	pending,
	onStage,
}: {
	pending: boolean;
	onStage: (file: File, portfolioId: number, currency: string) => void;
}) {
	const sourceId = useId();
	const { activeAccount } = useAccounts();
	const [sourceCurrency, setSourceCurrency] = useState("");
	const [confirmation, setConfirmation] = useState<string | null>(null);
	const currency =
		sourceCurrency || activeAccount?.currency || DEFAULT_CURRENCY;
	const confirmationScope = `${activeAccount?.id}:${currency}`;
	const confirmed = confirmation === confirmationScope;
	const dropzone = useDropzone({
		multiple: false,
		minSize: 1,
		maxSize: MAX_IMPORT_BYTES,
		accept: { "text/csv": [".csv"] },
		disabled: pending,
		onDrop: ([file]) => {
			const target = activeAccount;
			if (!file || !target || !confirmed) return;
			onStage(file, target.id, currency);
		},
	});
	const rejection = dropzone.fileRejections[0]?.errors[0];

	return (
		<>
			<p className="text-sm">
				Target: {activeAccount?.name ?? "Choose an account"} ·{" "}
				{activeAccount?.currency}
			</p>
			<label htmlFor={sourceId} className="block text-xs">
				Source money currency
				<Input
					id={sourceId}
					aria-label="Source money currency"
					value={currency}
					maxLength={3}
					onChange={(event) => {
						setSourceCurrency(event.target.value.toUpperCase());
						setConfirmation(null);
					}}
				/>
			</label>
			<label className="flex items-start gap-2 text-xs">
				<input
					type="checkbox"
					checked={confirmed}
					onChange={(event) =>
						setConfirmation(event.target.checked ? confirmationScope : null)
					}
				/>
				I confirm that source amounts use this currency and this is the intended
				trading account. No FX conversion is applied.
			</label>
			<div
				{...dropzone.getRootProps()}
				className="cursor-pointer rounded border border-dashed p-8 text-center"
			>
				<input
					{...dropzone.getInputProps()}
					disabled={!confirmed || !activeAccount}
				/>
				<p>{pending ? "Reading source…" : "Drop one CSV or click to choose"}</p>
				<p className="mt-1 text-xs text-muted-foreground">
					Up to 5 MB and 5000 records. Broker exports may be capped at 1000
					records.
				</p>
			</div>
			{rejection && (
				<p role="alert" className="text-sm text-destructive">
					{REJECTION_MESSAGES[rejection.code] ?? rejection.message}
				</p>
			)}
		</>
	);
}
