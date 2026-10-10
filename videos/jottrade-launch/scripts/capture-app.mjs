// Captures real JotTrade screens from a local dev server that has the demo seed.
// Usage: node scripts/capture-app.mjs [baseUrl] [shot ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import pg from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, "..", "capture", "screens");
const csv = path.join(dir, "exness-demo-export.csv");
const [baseUrl = "http://localhost:3107", ...only] = process.argv.slice(2);
const DEMO = { email: "demo@jottrade.test", password: "jottrade-dev-password" };
const HIDE_DEV_TOOLS = `
  [class*="tsqd"], [class*="TanStackDevtools"], [class*="tanstack-devtools"],
  #tanstack-devtools, [data-testid*="devtools"], button[aria-label*="evtools" i] { display: none !important; }
`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
	baseURL: baseUrl,
	viewport: { width: 1600, height: 1000 },
	deviceScaleFactor: 2,
	colorScheme: "dark",
	reducedMotion: "reduce",
});
await context.addInitScript(() =>
	localStorage.setItem("vite-ui-theme", "dark"),
);
const page = await context.newPage();
const signIn = await page.request.post("/api/auth/sign-in/email", {
	data: DEMO,
});
if (!signIn.ok()) throw new Error(`sign in failed: ${signIn.status()}`);

const rects = {};
const metrics = {};

async function settle() {
	await page.waitForLoadState("networkidle");
	await page.addStyleTag({ content: HIDE_DEV_TOOLS });
	await page.evaluate(() => {
		for (const el of document.querySelectorAll("body > *")) {
			const text = el.textContent ?? "";
			if (
				el.shadowRoot ||
				/tanstack/i.test(el.id) ||
				(text.length < 40 && /TANSTACK/i.test(text))
			)
				el.remove();
		}
	});
	await page.waitForTimeout(1200);
}

async function measure(name, selectors) {
	rects[name] = {};
	for (const [key, selector] of Object.entries(selectors)) {
		const box = await page.locator(selector).first().boundingBox();
		if (box) rects[name][key] = box;
	}
}

async function shoot(name, options = {}) {
	await page.screenshot({ path: path.join(outDir, `${name}.png`), ...options });
	process.stdout.write(`captured ${name}\n`);
}

async function dismissOnboarding() {
	const close = page.getByRole("button", { name: /dismiss|close/i }).first();
	if (await close.isVisible().catch(() => false)) {
		await close.click();
		await page.waitForTimeout(400);
	}
}

async function findDemoTrade() {
	process.loadEnvFile(".env");
	const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	const { rows } = await client.query(
		`select t.id from trades t join strategies s on s.id = t.setup_id
		 where t.user_id = 'demo-trader' and s.name = 'London Breakout' and t.status = 'CLOSED'
		   and t.playbook_check is null and t.net_pnl::numeric > 0
		 order by (t.symbol = 'XAUUSD') desc, t.entry_date desc limit 1`,
	);
	await client.end();
	return rows[0].id;
}

async function scrollToText(text, offset = 140) {
	const y = await page
		.getByText(text, { exact: true })
		.first()
		.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
	await page.evaluate((top) => window.scrollTo(0, top), y - offset);
	await page.waitForTimeout(400);
}

const REVIEW_NOTES = [
	[
		"What was the plan?",
		"London open only. Two setups at most, 1% risk on each.",
	],
	[
		"What followed or broke the plan?",
		"Both entries waited for the candle close. I skipped the news spike.",
	],
	[
		"What did you learn?",
		"Gold respects the Asian range high better than the low.",
	],
	[
		"One improvement to take into the next review",
		"Set an alert at the range edge. Stop watching every tick.",
	],
];

const SHOTS = {
	async dashboard() {
		await page.goto("/dashboard");
		await settle();
		await dismissOnboarding();
		await settle();
		await shoot("dashboard");
		await shoot("dashboard-full", { fullPage: true });
		await measure("dashboard", {
			balance: "text=Account balance",
			netPnl: "text=Net P&L",
			winRate: "text=Win rate",
			equity: "text=Equity curve",
		});
		await page.getByRole("button", { name: "Trading P&L" }).click();
		await page.waitForTimeout(1500);
		await shoot("dashboard-pnl");
		metrics.dashboard = await page.evaluate(() =>
			[...document.querySelectorAll("main *")]
				.filter(
					(el) =>
						el.childElementCount === 0 &&
						getComputedStyle(el).fontSize === "24px" &&
						getComputedStyle(el).fontFamily.includes("Azeret"),
				)
				.map((el) => {
					const r = el.getBoundingClientRect();
					const cs = getComputedStyle(el);
					return {
						text: el.textContent.trim(),
						rect: { x: r.x, y: r.y, width: r.width, height: r.height },
						color: cs.color,
						letterSpacing: cs.letterSpacing,
						lineHeight: cs.lineHeight,
					};
				})
				.filter((m) => m.rect.y < 300),
		);
		await page.addStyleTag({
			content:
				".recharts-line-curve, .recharts-area-area, .recharts-area-curve, .recharts-dot, .recharts-active-dot { opacity: 0 !important; }",
		});
		await page.waitForTimeout(300);
		await shoot("dashboard-pnl-nocurve");
		await page.evaluate(() => {
			for (const el of document.querySelectorAll("main *")) {
				const cs = getComputedStyle(el);
				if (
					el.childElementCount === 0 &&
					cs.fontSize === "24px" &&
					cs.fontFamily.includes("Azeret") &&
					el.getBoundingClientRect().y < 300
				)
					el.style.color = "transparent";
			}
		});
		await shoot("dashboard-pnl-empty");
	},
	async journal() {
		await page.goto("/journal");
		await settle();
		await shoot("journal");
	},
	async import() {
		await page.goto("/journal");
		await settle();
		await page.getByRole("button", { name: "Import CSV" }).click();
		const dialog = page.getByRole("dialog", { name: "Import journal data" });
		await page.waitForTimeout(500);
		await shoot("import-empty");
		await dialog.getByRole("checkbox", { name: /I confirm/ }).check();
		await dialog.locator('input[type="file"]').setInputFiles(csv);
		await page.waitForTimeout(2500);
		await shoot("import-preview");
		await dialog.evaluate((el) => {
			const scroller = [...el.querySelectorAll("*")].find(
				(n) => n.scrollHeight > n.clientHeight + 20,
			);
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
		});
		await page.waitForTimeout(500);
		await shoot("import-preview-bottom");
	},
	async calendar() {
		await page.goto("/calendar");
		await settle();
		await page
			.getByRole("button", { name: /previous/i })
			.first()
			.click();
		await settle();
		await shoot("calendar");
		await page.addStyleTag({
			content:
				'main button[aria-label*="net P&L"] { background: transparent !important; } main button[aria-label*="net P&L"] > div { visibility: hidden; }',
		});
		await page.waitForTimeout(300);
		await shoot("calendar-empty");
	},
	async strategies() {
		await page.goto("/strategies");
		await settle();
		await page.getByText("London Breakout").first().click();
		await settle();
		await shoot("strategies");
		await shoot("strategies-full", { fullPage: true });
	},
	async trade() {
		const id = await findDemoTrade();
		await page.goto(`/journal/${id}`);
		await settle();
		await shoot("trade");
		await scrollToText("Playbook check", 120);
		await measure("trade-check", {
			heading: "text=Playbook check",
			saveCheck: "button:has-text('Save check')",
		});
		await shoot("trade-check-0");
		const followed = page.getByRole("radio", { name: "Followed" });
		for (let i = 0; i < 4; i++) {
			await followed.nth(i).check({ force: true });
			await page.waitForTimeout(350);
			await shoot(`trade-check-${i + 1}`);
		}
		await page.getByRole("button", { name: "Save check" }).click();
		await page.waitForTimeout(1500);
		await shoot("trade-check-saved");
	},
	async review() {
		await page.goto("/reviews");
		await settle();
		await page.locator('input[type="date"]').fill("2026-10-09");
		await page.locator("h1, h2").first().click();
		await settle();
		await shoot("review");
		await measure(
			"review",
			Object.fromEntries(
				REVIEW_NOTES.map((_, i) => [`note${i}`, `textarea >> nth=${i}`]),
			),
		);
		for (const [i, [, text]] of REVIEW_NOTES.entries()) {
			await page.locator("textarea").nth(i).fill(text);
			await page.waitForTimeout(250);
			await shoot(`review-note-${i + 1}`);
		}
		await page.waitForTimeout(1500);
		await shoot("review-filled");
	},
	async adherence() {
		await page.goto("/strategies");
		await settle();
		await page.getByText("London Breakout").first().click();
		await settle();
		await scrollToText("Performance", 40);
		await shoot("adherence");
	},
	async _palette() {
		await page.goto("/dashboard");
		await settle();
		await page.keyboard.press("Meta+k");
		await page.waitForTimeout(600);
		await shoot("palette");
		await page.keyboard.type("gold", { delay: 60 });
		await page.waitForTimeout(1200);
		await shoot("palette-search");
	},
};

for (const [name, run] of Object.entries(SHOTS)) {
	if (only.length && !only.includes(name)) continue;
	await run();
}
await writeFile(
	path.join(outDir, "rects.json"),
	JSON.stringify({ rects, metrics }, null, 2),
);
await browser.close();
