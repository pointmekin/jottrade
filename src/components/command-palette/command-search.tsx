import { MicIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import type { useSpeechInput } from "@/hooks/use-speech-input";
import {
	type CommandCandidate,
	IntentType,
	isWriteIntent,
} from "@/lib/commands/types";

type Speech = ReturnType<typeof useSpeechInput>;

export function CommandSearch({
	query,
	onQueryChange,
	speech,
	candidates,
	interpreting,
	offerFallback,
	error,
	onChoose,
	onInterpret,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	speech: Speech;
	candidates: CommandCandidate[];
	interpreting: boolean;
	offerFallback: boolean;
	error?: string;
	onChoose: (candidate: CommandCandidate) => void;
	onInterpret: () => void;
}) {
	return (
		<Command shouldFilter={false}>
			<div className="relative">
				<CommandInput
					aria-label="Search commands"
					placeholder="Search or tell JotTrade what to do"
					value={query}
					onValueChange={onQueryChange}
					className={speech.supported ? "pr-16" : "pr-8"}
				/>
				{speech.supported && (
					<DictationButton speech={speech} disabled={interpreting} />
				)}
			</div>
			{speech.listening && <ListeningStatus interim={speech.interim} />}
			<CommandList className="max-h-[min(360px,60dvh)] p-2">
				<CommandEmpty>
					No matching commands. Try “short gold” or “deposit 1000”.
				</CommandEmpty>
				{candidates.map((candidate) => (
					<CandidateItem
						key={candidate.id}
						candidate={candidate}
						disabled={interpreting}
						onSelect={() => onChoose(candidate)}
					/>
				))}
				{offerFallback && (
					<CommandItem
						value="interpret"
						onSelect={onInterpret}
						className="min-h-11"
					>
						<div className="min-w-0">
							<p className="flex items-center gap-2">
								{interpreting && <Spinner className="size-3.5" />}
								{interpreting ? "Interpreting…" : "Interpret with Gemini"}
							</p>
							<p className="text-xs text-muted-foreground">
								Sends this command text to Google. Nothing saves without your
								confirmation.
							</p>
						</div>
					</CommandItem>
				)}
			</CommandList>
			{error && (
				<p role="alert" className="border-t px-3 py-2 text-sm text-destructive">
					{error}
				</p>
			)}
			<CommandHints />
		</Command>
	);
}

function DictationButton({
	speech,
	disabled,
}: {
	speech: Speech;
	disabled: boolean;
}) {
	// Sits left of the dialog close button, on its centre line.
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			aria-label={speech.listening ? "Stop dictation" : "Dictate a command"}
			aria-pressed={speech.listening}
			disabled={disabled}
			className="absolute top-2 right-7 size-8 opacity-70 transition-opacity hover:bg-transparent hover:opacity-100"
			onClick={() => (speech.listening ? speech.stop() : speech.start())}
		>
			{speech.listening ? (
				<SquareIcon className="size-3.5 fill-destructive text-destructive" />
			) : (
				<MicIcon className="size-4" />
			)}
		</Button>
	);
}

function ListeningStatus({ interim }: { interim: string }) {
	return (
		<output className="block space-y-1 border-b px-3 py-2 text-xs text-muted-foreground">
			<span className="flex items-center gap-2">
				<span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
				<span className="truncate">
					{interim || "Listening… speak your command."}
				</span>
			</span>
			<span className="block">
				Most browsers send the audio to their own speech service.
			</span>
		</output>
	);
}

function CandidateItem({
	candidate,
	disabled,
	onSelect,
}: {
	candidate: CommandCandidate;
	disabled: boolean;
	onSelect: () => void;
}) {
	const { intent } = candidate;
	return (
		<CommandItem
			value={candidate.id}
			disabled={disabled}
			onSelect={onSelect}
			className="min-h-11"
		>
			<div className="min-w-0">
				<p>{candidate.title}</p>
				{intent.type === IntentType.Navigation && (
					<p className="text-xs text-muted-foreground">Go to {intent.path}</p>
				)}
				{isWriteIntent(intent) && (
					<p className="text-xs text-muted-foreground">
						Review details before saving
					</p>
				)}
			</div>
		</CommandItem>
	);
}

function CommandHints() {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
			<span className="flex items-center gap-1.5">
				<KbdGroup>
					<Kbd>↑</Kbd>
					<Kbd>↓</Kbd>
				</KbdGroup>
				to choose
			</span>
			<span className="flex items-center gap-1.5">
				<Kbd>Enter</Kbd>
				to continue
			</span>
			<span className="flex items-center gap-1.5">
				<Kbd>Esc</Kbd>
				to close
			</span>
		</div>
	);
}
