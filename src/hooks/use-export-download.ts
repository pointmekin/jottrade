import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { downloadTextFile } from "@/lib/download-file";

type Download = { fileName: string; content: string; mimeType: string };

export function useExportDownload<Variables>(
	run: (variables: Variables) => Promise<Download & { summary: string }>,
	onDone?: () => void,
) {
	return useMutation({
		mutationFn: run,
		onSuccess: ({ fileName, content, mimeType, summary }) => {
			downloadTextFile(fileName, content, mimeType);
			toast.success(summary, { description: fileName });
			onDone?.();
		},
		onError: (error) => {
			console.error("Export failed", error);
			toast.error("Export failed. Nothing was downloaded.", {
				description: "Try again, or narrow the filters.",
			});
		},
	});
}
