import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportPreviewRow } from "@/lib/import-batch";
import type { CsvRow } from "@/lib/import-values";
export function ImportRowEditor({
	row,
	pending,
	onRepair,
}: {
	row: ImportPreviewRow;
	pending: boolean;
	onRepair: (rowNumber: number, source: CsvRow) => void;
}) {
	const id = useId();
	const [source, setSource] = useState(() => ({
		...row.source,
		...Object.fromEntries(
			row.issues
				.filter((issue) => !Object.hasOwn(row.source, issue.column))
				.map((issue) => [issue.column, ""]),
		),
	}));
	return (
		<details className="mt-2">
			<summary className="cursor-pointer text-xs">Repair source values</summary>
			<div className="mt-2 grid gap-2 sm:grid-cols-2">
				{Object.entries(source).map(([column, value]) => (
					<label htmlFor={`${id}-${column}`} key={column} className="text-xs">
						{column}
						<Input
							id={`${id}-${column}`}
							aria-label={`Record ${row.rowNumber} ${column}`}
							value={value ?? ""}
							onChange={(event) =>
								setSource({ ...source, [column]: event.target.value })
							}
						/>
					</label>
				))}
			</div>
			<Button
				size="sm"
				className="mt-2"
				disabled={pending}
				onClick={() => onRepair(row.rowNumber, source)}
			>
				Validate repaired record
			</Button>
		</details>
	);
}
