import { createShader, EASINGS, type ShaderController } from "glimm";

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
/**
 * The longest step one frame may add to the sweep (about 30 fps). A longer
 * frame, such as a Safari GPU stall, pauses the band instead of skipping it.
 */
const MAX_FRAME_MS = 1000 / 30;
/** Low enough to be invisible, but still a real draw that compiles the pipeline. */
const WARM_ALPHA = 0.001;

type Glimmer = { canvas: HTMLCanvasElement; ctrl: ShaderController };

let glimmer: Glimmer | null = null;
let isPlaying = false;

export const prefersReducedMotion = () =>
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Safari links and compiles the shader on the main thread and then stalls the
 * first GPU frame, about 0.4 s in total. One shared canvas, made and drawn once
 * ahead of time, keeps that cost out of the palette open.
 */
export function getGlimmer(): Glimmer | null {
	if (glimmer) return glimmer;
	const canvas = document.createElement("canvas");
	canvas.setAttribute("aria-hidden", "true");
	canvas.className = "pointer-events-none absolute inset-0 size-full";
	const ctrl = createShader({
		canvas,
		direction: "ttb",
		bandTight: BAND_TIGHT,
		curve: BAND_CURVE,
		span: BAND_SPAN,
	});
	if (!ctrl) return null;
	canvas.addEventListener(
		"webglcontextlost",
		() => {
			ctrl.destroy();
			glimmer = null;
		},
		{ once: true },
	);
	glimmer = { canvas, ctrl };
	ctrl.setAlpha(WARM_ALPHA);
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			if (!isPlaying) ctrl.setAlpha(0);
		}),
	);
	return glimmer;
}

/** Prepares the shader before the first open, so the band starts on time. */
export function warmCommandGlimmer() {
	if (!prefersReducedMotion()) getGlimmer();
}

export function playSweep(ctrl: ShaderController, isDark: boolean) {
	isPlaying = true;
	ctrl.setBrightness(isDark ? DARK_BRIGHTNESS : 1);
	ctrl.setProgress(0);
	ctrl.setAlpha(PEAK_ALPHA);
	let elapsed = 0;
	let last: number | undefined;
	let frame = 0;
	const tick = (now: number) => {
		elapsed += last === undefined ? 0 : Math.min(now - last, MAX_FRAME_MS);
		last = now;
		ctrl.setProgress(EASINGS.easeOutCubic(Math.min(1, elapsed / SWEEP_MS)));
		const outro = Math.min(1, Math.max(0, (elapsed - SWEEP_MS) / OUTRO_MS));
		ctrl.setAlpha(PEAK_ALPHA * (1 - EASINGS.easeInOutCubic(outro)));
		if (outro < 1) frame = requestAnimationFrame(tick);
		else isPlaying = false;
	};
	frame = requestAnimationFrame(tick);
	return () => {
		cancelAnimationFrame(frame);
		isPlaying = false;
		ctrl.setAlpha(0);
	};
}
