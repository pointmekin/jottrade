import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
	deleteTradeImage,
	getSignedUploadUrl,
	saveTradeImage,
} from "@/server/imageActions";
import { getStrategies } from "@/server/strategyActions";
import { updateTrade } from "@/server/tradeActions";
import { DeleteTradeDialog } from "./DeleteTradeDialog";
import type { Trade } from "./JournalTable";

const MISTAKE_OPTIONS = [
	"FOMO",
	"Revenge Trading",
	"Oversize Position",
	"Early Exit",
	"Late Exit",
	"No Trading Plan",
	"Moved Stop Loss",
];

const overviewSchema = z.object({
	entryPrice: z.string(),
	exitPrice: z.string().optional(),
	quantity: z.string(),
	fees: z.string().optional(),
	confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
	mistake: z.string().optional(),
	setupId: z.string().optional(),
});
type OverviewValues = z.infer<typeof overviewSchema>;

interface TradeDetailContentProps {
	trade: Trade;
	onDeleted: () => void;
}

export function TradeDetailContent({
	trade,
	onDeleted,
}: TradeDetailContentProps) {
	const qc = useQueryClient();
	const [uploading, setUploading] = useState(false);

	const { data: strategies = [] } = useQuery({
		queryKey: ["strategies"],
		queryFn: () => getStrategies({ data: undefined }),
	});

	const { register, handleSubmit, setValue, watch } = useForm<OverviewValues>({
		resolver: zodResolver(overviewSchema),
		values: {
			entryPrice: trade.entryPrice ?? "",
			exitPrice: trade.exitPrice ?? "",
			quantity: trade.quantity ?? "",
			fees: trade.fees ?? "",
			confidence: trade.confidence ?? undefined,
			mistake: trade.mistake ?? undefined,
			setupId: trade.setupId?.toString() ?? "none",
		},
	});

	const saveMut = useMutation({
		mutationFn: (values: OverviewValues) =>
			updateTrade({
				data: {
					id: trade.id,
					entryPrice: values.entryPrice,
					exitPrice: values.exitPrice,
					quantity: values.quantity,
					fees: values.fees,
					confidence: values.confidence,
					mistake: values.mistake,
					setupId: values.setupId === "none" ? null : Number(values.setupId),
				},
			} as any),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["trades"] });
			qc.invalidateQueries({ queryKey: ["trade"] });
		},
	});

	const noteMut = useMutation({
		mutationFn: (notes: string) =>
			updateTrade({ data: { id: trade.id, notes } } as any),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["trades"] });
			qc.invalidateQueries({ queryKey: ["trade"] });
		},
	});

	const deleteImgMut = useMutation({
		mutationFn: (url: string) =>
			deleteTradeImage({ data: { tradeId: trade.id, url } } as any),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["trades"] });
			qc.invalidateQueries({ queryKey: ["trade"] });
		},
	});

	const onDrop = useCallback(
		async (accepted: File[]) => {
			if (!accepted.length) return;
			setUploading(true);
			try {
				for (const file of accepted) {
					const { signedUrl, publicUrl } = (await getSignedUploadUrl({
						data: {
							tradeId: trade.id,
							fileName: file.name,
							contentType: file.type,
						},
					} as any)) as { signedUrl: string; publicUrl: string };
					await fetch(signedUrl, {
						method: "PUT",
						body: file,
						headers: { "Content-Type": file.type },
					});
					await saveTradeImage({
						data: { tradeId: trade.id, url: publicUrl },
					} as any);
				}
				qc.invalidateQueries({ queryKey: ["trades"] });
				qc.invalidateQueries({ queryKey: ["trade"] });
			} finally {
				setUploading(false);
			}
		},
		[trade, qc],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"] },
		maxSize: 10 * 1024 * 1024,
		maxFiles: 10,
	});

	const screenshots = trade.screenshots ?? [];
	const isLong = trade.side === "LONG";

	return (
		<div className="surface overflow-hidden bg-popover text-popover-foreground">
			{/* Direction accent bar */}
			<div
				className={cn(
					"h-px w-full flex-shrink-0",
					isLong ? "bg-success" : "bg-destructive",
				)}
			/>

			<div className="space-y-6 px-4 py-4 sm:px-5 sm:py-5">
				{/* Overview */}
				<form
					onSubmit={handleSubmit((v) => saveMut.mutate(v))}
					className="space-y-4"
				>
					<div className="grid grid-cols-2 gap-3">
						<FieldGroup label="Entry Price">
							<Input
								{...register("entryPrice")}
								className="border-input bg-background font-data text-sm"
							/>
						</FieldGroup>
						<FieldGroup label="Exit Price">
							<Input
								{...register("exitPrice")}
								className="border-input bg-background font-data text-sm"
							/>
						</FieldGroup>
						<FieldGroup label="Quantity">
							<Input
								{...register("quantity")}
								className="border-input bg-background font-data text-sm"
							/>
						</FieldGroup>
						<FieldGroup label="Fees">
							<Input
								{...register("fees")}
								className="border-input bg-background font-data text-sm"
							/>
						</FieldGroup>
					</div>

					<FieldGroup label="Confidence">
						<Select
							value={watch("confidence") ?? ""}
							onValueChange={(v) =>
								setValue("confidence", v as OverviewValues["confidence"])
							}
						>
							<SelectTrigger className="border-input bg-background">
								<SelectValue placeholder="Select confidence" />
							</SelectTrigger>
							<SelectContent>
								{["HIGH", "MEDIUM", "LOW"].map((c) => (
									<SelectItem key={c} value={c} className="focus:bg-accent">
										{c}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FieldGroup>

					<FieldGroup label="Mistake">
						<Select
							value={watch("mistake") ?? ""}
							onValueChange={(v) => setValue("mistake", v)}
						>
							<SelectTrigger className="border-input bg-background">
								<SelectValue placeholder="Any mistake?" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__none__" className="focus:bg-accent">
									None
								</SelectItem>
								{MISTAKE_OPTIONS.map((m) => (
									<SelectItem key={m} value={m} className="focus:bg-accent">
										{m}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FieldGroup>

					<FieldGroup label="Strategy">
						<Select
							value={watch("setupId") ?? "none"}
							onValueChange={(v) => setValue("setupId", v)}
						>
							<SelectTrigger className="border-input bg-background">
								<SelectValue placeholder="Select strategy" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none" className="focus:bg-accent">
									None
								</SelectItem>
								{(strategies as Array<{ id: number; name: string }>).map(
									(s) => (
										<SelectItem
											key={s.id}
											value={String(s.id)}
											className="focus:bg-accent"
										>
											{s.name}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</FieldGroup>

					<Button
						type="submit"
						disabled={saveMut.isPending}
						className="w-full font-medium"
					>
						{saveMut.isPending ? "Saving…" : "Save Changes"}
					</Button>
				</form>

				{/* Divider */}
				<div className="h-px bg-border" />

				{/* Notes */}
				<div className="space-y-2">
					<p className="field-label">Notes</p>
					<Textarea
						defaultValue={trade.notes ?? ""}
						className="min-h-32 resize-none border-input bg-background text-sm leading-relaxed placeholder:text-muted-foreground"
						placeholder="Add your trade notes here…"
						onBlur={(e) => noteMut.mutate(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">Auto-saved on blur.</p>
				</div>

				{/* Divider */}
				<div className="h-px bg-border" />

				{/* Images */}
				<div className="space-y-3 pb-6">
					<p className="field-label">Images</p>
					<div
						{...getRootProps()}
						className={cn(
							"cursor-pointer border border-dashed p-6 text-center transition-colors",
							isDragActive
								? "border-ring bg-accent/60"
								: "border-border hover:bg-accent/35",
						)}
					>
						<input {...getInputProps()} />
						<Upload className="mx-auto mb-2.5 h-5 w-5 text-ring" />
						<p className="text-sm font-medium">
							{uploading
								? "Uploading…"
								: isDragActive
									? "Drop images here"
									: "Drag & drop or click to upload"}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Max 10MB · JPEG, PNG, WebP, GIF · Up to 10 files
						</p>
					</div>

					{screenshots.length > 0 && (
						<div className="grid grid-cols-2 gap-2">
							{screenshots.map((url) => (
								<div
									key={url}
									className="group relative overflow-hidden border border-border bg-muted"
								>
									<img
										src={url}
										alt="Trade screenshot"
										className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-105"
									/>
									<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200" />
									<button
										type="button"
										onClick={() => deleteImgMut.mutate(url)}
										className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/90"
									>
										<X className="h-3 w-3 text-white" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="h-px bg-border" />

				<div className="flex items-center justify-between gap-4 pb-2">
					<div>
						<p className="text-sm font-medium">Delete this trade</p>
						<p className="text-xs text-muted-foreground">
							Permanently remove it from your journal.
						</p>
					</div>
					<DeleteTradeDialog trade={trade} onDeleted={onDeleted} />
				</div>
			</div>
		</div>
	);
}

function FieldGroup({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="field-label">{label}</Label>
			{children}
		</div>
	);
}
