import { useEffect } from "react";

function isCommandShortcut(event: KeyboardEvent) {
	return (
		event.key.toLowerCase() === "k" &&
		(event.metaKey || event.ctrlKey) &&
		!event.altKey &&
		!event.isComposing &&
		!event.repeat
	);
}

export function useCommandShortcut({
	enabled,
	onToggle,
}: {
	enabled: boolean;
	onToggle: () => void;
}) {
	useEffect(() => {
		if (!enabled) return;
		const handleKey = (event: KeyboardEvent) => {
			if (!isCommandShortcut(event)) return;
			event.preventDefault();
			onToggle();
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [enabled, onToggle]);
}
