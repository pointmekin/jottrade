// Safari can cancel the download if the URL is revoked right after the click.
const REVOKE_DELAY_MS = 10_000;

export function downloadTextFile(
	fileName: string,
	content: string,
	mimeType: string,
) {
	const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
