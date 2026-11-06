import { createShader, playSweep } from "glimm";
import { useEffect, useRef } from "react";

/** glimm suggests about 0.85 so the band does not read as harsh white on dark. */
const DARK_BRIGHTNESS = 0.85;
const SWEEP_MS = 750;
const OUTRO_MS = 150;
/** Keeps the band a soft glow behind the palette, not the focus. */
const PEAK_ALPHA = 0.5;
/** Higher than the glimm default of 14, for a thinner band. */
const BAND_TIGHT = 22;
/** The band's ends trail its middle, so it bows down like a wave from the palette. */
const BAND_CURVE = 0.18;
/** Share of the viewport width the band covers, centred on the palette. */
const BAND_SPAN = 0.55;

/** Plays a glimm band down the page behind the palette each time it opens. */
export function CommandGlimmer() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
		const ctrl = createShader({
			canvas,
			bandTight: BAND_TIGHT,
			curve: BAND_CURVE,
			span: BAND_SPAN,
		});
		if (!ctrl) return;
		const isDark = document.documentElement.classList.contains("dark");
		const sweep = playSweep(ctrl, {
			direction: "ttb",
			easing: "easeOutCubic",
			sweepMs: SWEEP_MS,
			outroMs: OUTRO_MS,
			peakAlpha: PEAK_ALPHA,
			brightness: isDark ? DARK_BRIGHTNESS : 1,
		});
		return () => {
			sweep.cancel();
			ctrl.destroy();
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			className="pointer-events-none absolute inset-0 size-full"
		/>
	);
}
