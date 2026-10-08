import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import { JournalIntent, JournalView } from "@/lib/journal-search";
import { OnboardingStep } from "@/lib/onboarding";
import { QueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { setOnboardingDismissed } from "@/server/onboardingActions";
import { FirstAccountDialog } from "./first-account-dialog";

interface StepCopy {
	title: string;
	description: string;
	actionLabel: string;
}

const STEP_COPY: Record<OnboardingStep, StepCopy> = {
	[OnboardingStep.Account]: {
		title: "Set up your account",
		description: "Choose its name, currency and timezone.",
		actionLabel: "Set up account",
	},
	[OnboardingStep.Funding]: {
		title: "Record your opening funds",
		description:
			"Add a deposit so your balance and returns start from the right number.",
		actionLabel: "Add a deposit",
	},
	[OnboardingStep.Trades]: {
		title: "Add your trades",
		description:
			"Log a trade, or import an Exness MT4/MT5 CSV. For other brokers, log trades by hand.",
		actionLabel: "Log a trade",
	},
	[OnboardingStep.Review]: {
		title: "Complete your first daily review",
		description: "Write what you did and the one change you will make.",
		actionLabel: "Start review",
	},
};

function StepAction({
	step,
	variant,
	onSetupAccount,
}: {
	step: OnboardingStep;
	variant: "default" | "ghost";
	onSetupAccount: () => void;
}) {
	const { actionLabel } = STEP_COPY[step];
	const buttonProps = { variant, size: "sm" } as const;
	if (step === OnboardingStep.Account) {
		return (
			<Button {...buttonProps} onClick={onSetupAccount}>
				{actionLabel}
			</Button>
		);
	}
	let link: ReactNode;
	if (step === OnboardingStep.Funding) {
		link = (
			<Link to="/journal" search={{ view: JournalView.Funding }}>
				{actionLabel}
			</Link>
		);
	} else if (step === OnboardingStep.Trades) {
		link = (
			<Link to="/journal" search={{ intent: JournalIntent.Log }}>
				{actionLabel}
			</Link>
		);
	} else {
		link = <Link to="/reviews">{actionLabel}</Link>;
	}
	return (
		<Button asChild {...buttonProps}>
			{link}
		</Button>
	);
}

export function OnboardingChecklist() {
	const queryClient = useQueryClient();
	const { progress, isChecklistVisible } = useOnboarding();
	const titleId = useId();
	const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
	const dismiss = useMutation({
		mutationFn: () => setOnboardingDismissed({ data: { isDismissed: true } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: [QueryKey.Onboarding] }),
	});

	if (!progress || !isChecklistVisible) return null;

	const percent = (progress.doneCount / progress.totalCount) * 100;

	return (
		<section aria-labelledby={titleId} className="surface mt-4 p-4 sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 id={titleId} className="text-base font-semibold">
						Get to your first review
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{progress.doneCount} of {progress.totalCount} steps done. Skip any
						step and come back later.
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Dismiss setup guide"
					onClick={() => dismiss.mutate()}
					disabled={dismiss.isPending}
				>
					<X className="size-4" />
				</Button>
			</div>
			<div
				role="progressbar"
				aria-label="Setup progress"
				aria-valuemin={0}
				aria-valuemax={progress.totalCount}
				aria-valuenow={progress.doneCount}
				className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<ol className="mt-3 divide-y divide-border">
				{progress.steps.map(({ step, isDone }) => {
					const copy = STEP_COPY[step];
					const isNext = step === progress.nextStep;
					return (
						<li
							key={step}
							className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
						>
							<span
								aria-hidden
								className={cn(
									"flex size-5 shrink-0 items-center justify-center rounded-full border",
									isDone
										? "border-transparent bg-success text-white"
										: "border-input",
								)}
							>
								{isDone && (
									<Check className="size-3 animate-in zoom-in-50 duration-300 motion-reduce:animate-none" />
								)}
							</span>
							<div className="min-w-0 flex-1 basis-56">
								<p
									className={cn(
										"text-sm font-medium",
										isDone && "text-muted-foreground line-through",
									)}
								>
									{copy.title}
									{isDone && <span className="sr-only"> (done)</span>}
								</p>
								{!isDone && (
									<p className="text-sm text-muted-foreground">
										{copy.description}
									</p>
								)}
							</div>
							{!isDone && (
								<StepAction
									step={step}
									variant={isNext ? "default" : "ghost"}
									onSetupAccount={() => setIsAccountDialogOpen(true)}
								/>
							)}
						</li>
					);
				})}
			</ol>
			<FirstAccountDialog
				open={isAccountDialogOpen}
				onOpenChange={setIsAccountDialogOpen}
			/>
		</section>
	);
}
