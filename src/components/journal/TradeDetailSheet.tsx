import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
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

interface TradeDetailSheetProps {
	trade: Trade | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(false);
	useEffect(() => {
		const mql = window.matchMedia("(min-width: 768px)");
		setIsDesktop(mql.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);
	return isDesktop;
}

export function TradeDetailSheet({
	trade,
	open,
	onOpenChange,
}: TradeDetailSheetProps) {
	const qc = useQueryClient();
	const [uploading, setUploading] = useState(false);
	const isDesktop = useIsDesktop();

	const { data: strategies = [] } = useQuery({
		queryKey: ["strategies"],
		queryFn: () => getStrategies({ data: undefined }),
	});

	const { register, handleSubmit, setValue, watch } = useForm<OverviewValues>({
		resolver: zodResolver(overviewSchema),
		values: {
			entryPrice: trade?.entryPrice ?? "",
			exitPrice: trade?.exitPrice ?? "",
			quantity: trade?.quantity ?? "",
			fees: (trade as any)?.fees ?? "",
			confidence: (trade as any)?.confidence ?? undefined,
			mistake: (trade as any)?.mistake ?? undefined,
			setupId: (trade as any)?.setupId?.toString() ?? "none",
		},
	});

	const saveMut = useMutation({
		mutationFn: (values: OverviewValues) =>
			updateTrade({
				data: {
					id: trade!.id,
					entryPrice: values.entryPrice,
					exitPrice: values.exitPrice,
					quantity: values.quantity,
					fees: values.fees,
					confidence: values.confidence as any,
					mistake: values.mistake,
					setupId: values.setupId === "none" ? null : Number(values.setupId),
				},
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
	});

	const noteMut = useMutation({
		mutationFn: (notes: string) =>
			updateTrade({ data: { id: trade!.id, notes } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
	});

	const deleteImgMut = useMutation({
		mutationFn: (url: string) =>
			deleteTradeImage({ data: { tradeId: trade!.id, url } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
	});

	const onDrop = useCallback(
		async (accepted: File[]) => {
			if (!trade || !accepted.length) return;
			setUploading(true);
			try {
				for (const file of accepted) {
					const { signedUrl, publicUrl } = (await getSignedUploadUrl({
						data: {
							tradeId: trade.id,
							fileName: file.name,
							contentType: file.type,
						},
					})) as { signedUrl: string; publicUrl: string };
					await fetch(signedUrl, {
						method: "PUT",
						body: file,
						headers: { "Content-Type": file.type },
					});
					await saveTradeImage({
						data: { tradeId: trade.id, url: publicUrl },
					});
				}
				qc.invalidateQueries({ queryKey: ["trades"] });
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

	const screenshots: string[] = (trade as any)?.screenshots ?? [];
	const netPnl = trade?.netPnl ? parseFloat(trade.netPnl) : null;
	const isLong = trade?.side === "LONG";

	if (!trade) return null;

	return (
		<Drawer
			open={open}
			onOpenChange={onOpenChange}
			direction={isDesktop ? "right" : "bottom"}
		>
			<DrawerContent
				className={cn(
					"border-border bg-popover text-popover-foreground",
					isDesktop
						? "inset-y-0 right-0 left-auto h-screen w-[480px] max-w-[90vw] mt-0 rounded-md border-l flex-col"
						: "inset-x-0 bottom-0 top-auto max-h-[92vh] rounded-md border-t flex-col",
				)}
			>
				{/* Direction accent bar */}
				<div
					className={cn(
						"h-px w-full flex-shrink-0",
						isLong ? "bg-success" : "bg-destructive",
					)}
				/>

				{/* Mobile drag handle */}
				{!isDesktop && (
					<div className="flex justify-center pt-3 pb-1 flex-shrink-0">
						<div className="h-1 w-10 bg-border" />
					</div>
				)}

				{/* Header */}
				<DrawerHeader className="flex-shrink-0 border-b border-border px-5 pb-3 pt-4">
					<div className="flex items-start justify-between gap-3">
						<div className="flex items-center gap-2.5 flex-wrap">
							<DrawerTitle className="text-xl font-semibold tracking-tight">
								{trade.symbol}
							</DrawerTitle>
							<span
								className={cn(
									"status-pill",
									isLong
										? "border-success/35 bg-success/10 text-success"
										: "border-destructive/35 bg-destructive/10 text-destructive",
								)}
							>
								{trade.side}
							</span>
							<span className="status-pill bg-muted text-muted-foreground">
								{trade.status}
							</span>
						</div>
						{netPnl !== null && (
							<div
								className={cn(
									"text-right flex-shrink-0",
									netPnl >= 0 ? "text-success" : "text-destructive",
								)}
							>
								<p className="font-data text-lg font-semibold leading-none">
									{netPnl >= 0 ? "+" : ""}
									{netPnl.toFixed(2)}
								</p>
								<p className="mt-0.5 text-xs text-muted-foreground">
									net P&amp;L
								</p>
							</div>
						)}
					</div>
				</DrawerHeader>

				{/* Scrollable content */}
				<div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
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
								onValueChange={(v) => setValue("confidence", v as any)}
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
									{(strategies as any[]).map((s: any) => (
										<SelectItem
											key={s.id}
											value={String(s.id)}
											className="focus:bg-accent"
										>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FieldGroup>

						<Button
							type="submit"
							disabled={saveMut.isPending}
							className={cn(
								"w-full font-medium transition-all",
								isLong
									? "bg-success text-success-foreground hover:bg-success/88"
									: "bg-destructive text-destructive-foreground hover:bg-destructive/88",
							)}
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
							defaultValue={(trade as any)?.notes ?? ""}
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
				</div>
			</DrawerContent>
		</Drawer>
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
