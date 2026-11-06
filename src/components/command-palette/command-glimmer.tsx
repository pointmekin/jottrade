import { useEffect, useRef } from "react";
import {
	getGlimmer,
	playSweep,
	prefersReducedMotion,
} from "@/components/command-palette/glimmer-shader";

/** Plays a glimm band down the page behind the palette each time it opens. */
export function CommandGlimmer() {
	const hostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = hostRef.current;
		if (!host || prefersReducedMotion()) return;
		const current = getGlimmer();
		if (!current) return;
		host.appendChild(current.canvas);
		const isDark = document.documentElement.classList.contains("dark");
		const stop = playSweep(current.ctrl, isDark);
		return () => {
			stop();
			current.canvas.remove();
		};
	}, []);

	return (
		<div
			ref={hostRef}
			aria-hidden
			className="pointer-events-none absolute inset-0"
		/>
	);
}
