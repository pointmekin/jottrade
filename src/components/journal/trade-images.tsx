import { useMutation } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
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

type ImageContentType = Parameters<
	typeof getSignedUploadUrl
>[0]["data"]["contentType"];

async function uploadImage(tradeId: number, file: File) {
	const { signedUrl, publicUrl } = await getSignedUploadUrl({
		data: {
			tradeId,
			fileName: file.name,
			contentType: file.type as ImageContentType,
		},
	});
	const response = await fetch(signedUrl, {
		method: "PUT",
		body: file,
		headers: { "Content-Type": file.type },
	});
	if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
	await saveTradeImage({ data: { tradeId, url: publicUrl } });
}

function dropzoneLabel(isUploading: boolean, isDragActive: boolean) {
	if (isUploading) return "Uploading…";
	if (isDragActive) return "Drop images here";
	return "Drag & drop or click to upload";
}

export function TradeImages({
	trade,
	onChange,
}: {
	trade: Trade;
	onChange: () => void;
}) {
	const [isUploading, setIsUploading] = useState(false);
	const remove = useMutation({
		mutationFn: (url: string) =>
			deleteTradeImage({ data: { tradeId: trade.id, url } }),
		onSuccess: onChange,
	});
	const onDrop = async (accepted: File[]) => {
		if (!accepted.length) return;
		setIsUploading(true);
		try {
			// One at a time: each save appends to the stored list, so parallel saves would drop images.
			// react-doctor-disable-next-line react-doctor/async-await-in-loop
			for (const file of accepted) await uploadImage(trade.id, file);
			onChange();
		} finally {
			setIsUploading(false);
		}
	};
	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: IMAGE_TYPES,
		maxSize: MAX_IMAGE_BYTES,
		maxFiles: MAX_IMAGES,
	});
	const screenshots = trade.screenshots ?? [];

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
								className="absolute top-1.5 right-1.5 rounded-md bg-black/70 p-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/90"
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
