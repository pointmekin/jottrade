import { useMutation } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import type { Trade } from "@/lib/trade";
import { cn } from "@/lib/utils";
import {
	deleteTradeImage,
	getSignedUploadUrl,
	saveTradeImage,
} from "@/server/imageActions";

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"] };

const UploadStatus = { Uploading: "uploading", Failed: "failed" } as const;
type UploadStatus = (typeof UploadStatus)[keyof typeof UploadStatus];

type PendingUpload = {
	uploadId: string;
	file: File;
	status: UploadStatus;
	error?: string;
};

type ImageContentType = Parameters<
	typeof getSignedUploadUrl
>[0]["data"]["contentType"];

async function uploadImage(tradeId: number, { uploadId, file }: PendingUpload) {
	const { signedUrl, publicUrl } = await getSignedUploadUrl({
		data: { tradeId, uploadId, contentType: file.type as ImageContentType },
	});
	const response = await fetch(signedUrl, {
		method: "PUT",
		body: file,
		headers: { "Content-Type": file.type },
	});
	if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
	await saveTradeImage({ data: { tradeId, url: publicUrl } });
}

function useImageUploads(tradeId: number, onChange: () => void) {
	const [pending, setPending] = useState<PendingUpload[]>([]);
	const update = (uploadId: string, change: Partial<PendingUpload>) =>
		setPending((list) =>
			list.map((item) =>
				item.uploadId === uploadId ? { ...item, ...change } : item,
			),
		);
	const remove = (uploadId: string) =>
		setPending((list) => list.filter((item) => item.uploadId !== uploadId));
	// A retry keeps the upload id, so it replaces the same object and the save is idempotent.
	const run = async (upload: PendingUpload) => {
		update(upload.uploadId, {
			status: UploadStatus.Uploading,
			error: undefined,
		});
		try {
			await uploadImage(tradeId, upload);
			remove(upload.uploadId);
			onChange();
		} catch (cause) {
			update(upload.uploadId, {
				status: UploadStatus.Failed,
				error: cause instanceof Error ? cause.message : "Upload failed",
			});
		}
	};
	const add = async (files: File[]) => {
		const uploads = files.map((file) => ({
			uploadId: crypto.randomUUID(),
			file,
			status: UploadStatus.Uploading,
		}));
		setPending((list) => [...list, ...uploads]);
		// One at a time: each save appends to the stored list, so parallel saves would drop images.
		// react-doctor-disable-next-line react-doctor/async-await-in-loop
		for (const upload of uploads) await run(upload);
	};
	return { pending, add, retry: run, remove };
}

function dropzoneLabel(isUploading: boolean, isDragActive: boolean) {
	if (isUploading) return "Uploading…";
	if (isDragActive) return "Drop images here";
	return "Drag & drop or click to upload";
}

function PendingUploadRow({
	upload,
	onRetry,
	onRemove,
}: {
	upload: PendingUpload;
	onRetry: () => void;
	onRemove: () => void;
}) {
	const name = upload.file.name;
	if (upload.status === UploadStatus.Uploading) {
		return (
			<li className="flex min-h-11 items-center gap-3 border border-border px-3 py-2 text-sm">
				<span className="min-w-0 flex-1 truncate">{name}</span>
				<output className="text-muted-foreground">Uploading</output>
			</li>
		);
	}
	return (
		<li className="flex flex-wrap items-center gap-2 border border-destructive/50 px-3 py-2 text-sm">
			<div className="min-w-0 flex-1">
				<p className="truncate">{name}</p>
				<p role="alert" className="text-xs text-destructive">
					Failed: {upload.error}
				</p>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="max-sm:h-11"
				aria-label={`Retry ${name}`}
				onClick={onRetry}
			>
				Retry
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="max-sm:h-11"
				aria-label={`Remove ${name}`}
				onClick={onRemove}
			>
				Remove
			</Button>
		</li>
	);
}

export function TradeImages({
	trade,
	onChange,
}: {
	trade: Trade;
	onChange: () => void;
}) {
	const uploads = useImageUploads(trade.id, onChange);
	const remove = useMutation({
		mutationFn: (url: string) =>
			deleteTradeImage({ data: { tradeId: trade.id, url } }),
		onSuccess: onChange,
	});
	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: uploads.add,
		accept: IMAGE_TYPES,
		maxSize: MAX_IMAGE_BYTES,
		maxFiles: MAX_IMAGES,
	});
	const screenshots = trade.screenshots ?? [];
	const isUploading = uploads.pending.some(
		(upload) => upload.status === UploadStatus.Uploading,
	);

	return (
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
					{dropzoneLabel(isUploading, isDragActive)}
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					Max 10MB · JPEG, PNG, WebP, GIF · Up to 10 files
				</p>
			</div>
			{uploads.pending.length > 0 && (
				<ul className="grid grid-cols-1 gap-2">
					{uploads.pending.map((upload) => (
						<PendingUploadRow
							key={upload.uploadId}
							upload={upload}
							onRetry={() => uploads.retry(upload)}
							onRemove={() => uploads.remove(upload.uploadId)}
						/>
					))}
				</ul>
			)}
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
								className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
							<div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/30" />
							<button
								type="button"
								aria-label="Delete screenshot"
								onClick={() => remove.mutate(url)}
								className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-md bg-black/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/90 focus-visible:opacity-100 pointer-coarse:opacity-100 max-sm:opacity-100 sm:size-7"
							>
								<X className="h-3 w-3 text-white" />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
