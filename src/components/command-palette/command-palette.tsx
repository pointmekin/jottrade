import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CommandPreview } from "@/components/command-palette/command-preview";
import { useTheme } from "@/components/theme-provider";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { matchCommands } from "@/lib/commands/matcher";
import type { CommandCandidate } from "@/lib/commands/types";

export function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const { setTheme } = useTheme();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<CommandCandidate>();
	const [saving, setSaving] = useState(false);
	const candidates = matchCommands(query);
	useEffect(() => {
		if (!open) {
			setQuery("");
			setSelected(undefined);
		}
	}, [open]);
	useEffect(() => {
		if (!session) return;
		const handleKey = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() !== "k" ||
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.isComposing ||
				event.repeat
			)
				return;
			event.preventDefault();
			if (!saving) onOpenChange(!open);
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [session, open, onOpenChange, saving]);
	if (!session) return null;
	const choose = (candidate: CommandCandidate) => {
		const intent = candidate.intent;
		if (intent.type === "navigation") {
			void navigate({ to: intent.path });
			onOpenChange(false);
		} else if (intent.type === "theme") {
			setTheme(intent.theme);
			onOpenChange(false);
		} else setSelected(candidate);
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!saving) onOpenChange(next);
			}}
		>
			<DialogContent
				className="max-h-[85dvh] overflow-y-auto p-0 sm:max-w-lg"
				showCloseButton={!saving}
			>
				<DialogTitle className="sr-only">JotTrade commands</DialogTitle>
				<DialogDescription className="sr-only">
					Navigate, change the theme, or review a trade or account entry before
					saving.
				</DialogDescription>
				{selected &&
				(selected.intent.type === "trade" ||
					selected.intent.type === "account-entry") ? (
					<CommandPreview
						intent={selected.intent}
						warning={selected.warning}
						onBack={() => setSelected(undefined)}
						onSuccess={() => onOpenChange(false)}
						onSavingChange={setSaving}
					/>
				) : (
					<Command shouldFilter={false}>
						<CommandInput
							aria-label="Search commands"
							placeholder="Search or tell JotTrade what to do"
							value={query}
							onValueChange={setQuery}
							className="pr-8"
						/>
						<CommandList className="max-h-[min(360px,60dvh)] p-2">
							<CommandEmpty>
								No matching commands. Try “short gold” or “deposit 1000”.
							</CommandEmpty>
							{candidates.map((candidate) => (
								<CommandItem
									key={candidate.id}
									value={candidate.id}
									onSelect={() => choose(candidate)}
									className="min-h-11"
								>
									<div className="min-w-0">
										<p>{candidate.title}</p>
										{candidate.intent.type === "navigation" && (
											<p className="text-xs text-muted-foreground">
												Go to {candidate.intent.path}
											</p>
										)}
										{(candidate.intent.type === "trade" ||
											candidate.intent.type === "account-entry") && (
											<p className="text-xs text-muted-foreground">
												Review details before saving
											</p>
										)}
									</div>
								</CommandItem>
							))}
						</CommandList>
						<p className="border-t px-3 py-2 text-xs text-muted-foreground">
							↑ ↓ to choose · Enter to continue · Esc to close
						</p>
					</Command>
				)}
			</DialogContent>
		</Dialog>
	);
}
