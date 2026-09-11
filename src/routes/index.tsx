import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

const sampleTrades = [
	{
		time: "09:42",
		symbol: "XAUUSD",
		setup: "Range reclaim",
		result: "+$184.20",
		positive: true,
	},
	{
		time: "11:06",
		symbol: "EURUSD",
		setup: "Failed breakout",
		result: "-$62.40",
		positive: false,
	},
	{
		time: "14:18",
		symbol: "NAS100",
		setup: "Trend pullback",
		result: "+$246.80",
		positive: true,
	},
];

function Home() {
	return (
		<main className="min-h-screen p-4 md:p-6 lg:p-8">
			<div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[96rem] border border-border md:min-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,0.85fr)_minmax(34rem,1.15fr)]">
				<section className="flex flex-col justify-between border-b border-border p-6 lg:border-b-0 lg:border-r lg:p-10">
					<div className="flex items-center gap-3">
						<Crosshair className="size-5 text-ring" />
						<span className="font-semibold tracking-[-0.02em]">JotTrade</span>
					</div>
					<div className="py-16 lg:py-8">
						<h1 className="max-w-3xl text-balance text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
							Know why every trade worked.
						</h1>
						<p className="mt-8 max-w-lg text-base leading-7 text-muted-foreground">
							Record or import a trade, then connect the setup, execution,
							outcome, and lesson in one private workspace.
						</p>
						<div className="mt-8 flex flex-wrap gap-2">
							<Button asChild size="lg">
								<Link to="/sign-up">
									Start a journal <ArrowRight className="size-4" />
								</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link to="/sign-in">Sign in</Link>
							</Button>
						</div>
					</div>
					<p className="border-t border-border pt-3 text-xs text-muted-foreground">
						Private trading journal
					</p>
				</section>

				<section
					className="surface relative flex min-h-[42rem] flex-col border-0 p-4 md:p-8 lg:p-10"
					aria-label="Synthetic journal example"
				>
					<div className="flex items-center justify-between border-b border-border pb-3">
						<div>
							<p className="text-sm font-semibold">Tuesday</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Synthetic example
							</p>
						</div>
						<span className="status-pill border-success/35 bg-success/10 text-success">
							Net +$368.60
						</span>
					</div>
					<div className="relative flex flex-1 items-center py-10">
						<div className="absolute inset-y-10 left-[42%] w-px bg-ring/70" />
						<div className="w-full">
							<div className="grid grid-cols-[42%_1fr] items-center">
								<p className="pr-6 text-right font-data text-xs text-muted-foreground">
									08:00 / OPEN
								</p>
								<div className="border-t border-ring pl-6">
									<p className="-mt-3 inline-block bg-card px-2 font-data text-lg font-semibold">
										$10,000.00
									</p>
								</div>
							</div>
							<div className="my-14 grid grid-cols-[42%_1fr] items-center">
								<div className="pr-6 text-right">
									<p className="text-sm font-semibold">Range reclaim</p>
									<p className="font-data text-xs text-muted-foreground">
										XAUUSD / LONG
									</p>
								</div>
								<div className="relative border-t border-success pl-6">
									<span className="absolute -left-1.5 -top-1.5 size-3 border-2 border-success bg-background" />
									<p className="-mt-3 inline-block bg-card px-2 font-data text-2xl font-semibold text-success">
										+$184.20
									</p>
								</div>
							</div>
							<div className="grid grid-cols-[42%_1fr] items-center">
								<p className="pr-6 text-right font-data text-xs text-muted-foreground">
									16:00 / CLOSE
								</p>
								<div className="border-t border-ring pl-6">
									<p className="-mt-3 inline-block bg-card px-2 font-data text-lg font-semibold">
										$10,368.60
									</p>
								</div>
							</div>
						</div>
					</div>
					<div className="border-t border-border">
						{sampleTrades.map((trade) => (
							<div
								key={trade.time}
								className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 border-b border-border py-3 text-xs"
							>
								<span className="font-data text-muted-foreground">
									{trade.time}
								</span>
								<span>
									<strong>{trade.symbol}</strong>
									<span className="ml-2 text-muted-foreground">
										{trade.setup}
									</span>
								</span>
								<span
									className={`font-data font-semibold ${trade.positive ? "text-success" : "text-destructive"}`}
								>
									{trade.result}
								</span>
							</div>
						))}
					</div>
				</section>
			</div>
		</main>
	);
}
