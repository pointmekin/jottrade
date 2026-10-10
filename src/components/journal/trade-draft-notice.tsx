import { format, isToday } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const TOUCH = "max-sm:h-11";

function changeTime(savedAt: string) {
	const date = new Date(savedAt);
	return format(date, isToday(date) ? "HH:mm" : "d MMM, HH:mm");
}

function DiscardDraft({ onDiscard }: { onDiscard: () => void }) {
	const [isConfirming, setIsConfirming] = useState(false);
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className={TOUCH}
				aria-expanded={isConfirming}
				onClick={() => setIsConfirming(!isConfirming)}
			>
				Discard draft
			</Button>
			{isConfirming && (
				<>
					<span className="w-full text-sm">
						Delete this draft from the device?
					</span>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						className={TOUCH}
						onClick={() => {
							setIsConfirming(false);
							onDiscard();
						}}
					>
						Discard
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={TOUCH}
						onClick={() => setIsConfirming(false)}
					>
						Keep draft
					</Button>
				</>
			)}
		</div>
	);
}

export function TradeDraftNotice({
	savedAt,
	isUnreadable,
	storageError,
	onDiscard,
}: {
	savedAt: string | null;
	isUnreadable: boolean;
	storageError: string | null;
	onDiscard: () => void;
}) {
	if (!savedAt && !isUnreadable && !storageError) return null;
	return (
		<div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
			{storageError && (
				<p role="alert" className="text-destructive">
					{storageError}
				</p>
			)}
			{isUnreadable && (
				<p role="alert" className="text-destructive">
					This draft cannot be read. Discard it.
				</p>
			)}
			{savedAt && !isUnreadable && (
				<output className="block">
					Draft on this device. Not in your journal yet. Last change{" "}
					{changeTime(savedAt)}.
				</output>
			)}
			{(savedAt || isUnreadable) && <DiscardDraft onDiscard={onDiscard} />}
		</div>
	);
}

export function TradeDraftChoice({
	savedAt,
	onContinue,
	onStartNew,
}: {
	savedAt: string | null;
	onContinue: () => void;
	onStartNew: () => void;
}) {
	return (
		<div className="space-y-3 text-sm">
			<p>
				This account has a draft on this device
				{savedAt && ` from ${changeTime(savedAt)}`}. It is not in your journal
				yet.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button type="button" className={TOUCH} onClick={onContinue}>
					Continue your draft
				</Button>
				<Button
					type="button"
					variant="outline"
					className={TOUCH}
					onClick={onStartNew}
				>
					Start new
				</Button>
			</div>
		</div>
	);
}
