import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TradeCaptureDraft } from "@/lib/trade-capture";
import { cn } from "@/lib/utils";
import { TradeEntryForm } from "./TradeEntryForm";

export function LogTradeDrawer({
	defaultOpen,
	initialDraft,
	trigger,
	disabled,
}: {
	defaultOpen: boolean;
	initialDraft?: TradeCaptureDraft;
	trigger?: ReactNode;
	disabled?: boolean;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const isDesktop = !useIsMobile();
	const close = () => setIsOpen(false);

	return (
		<>
			<Button onClick={() => setIsOpen(true)} disabled={disabled}>
				{trigger ?? (
					<>
						<Plus className="mr-2 h-4 w-4" />
						Log Trade
					</>
				)}
			</Button>
			<Drawer
				open={isOpen}
				onOpenChange={setIsOpen}
				direction={isDesktop ? "right" : "bottom"}
			>
				<DrawerContent
					className={cn(
						"bg-popover text-popover-foreground",
						isDesktop
							? "inset-y-0 right-0 left-auto mt-0 h-screen w-[440px] max-w-[90vw] flex-col rounded-md border-l"
							: "inset-x-0 bottom-0 top-auto max-h-[92vh] flex-col rounded-md border-t",
					)}
				>
					<div className="h-px w-full flex-shrink-0 bg-ring" />
					{!isDesktop && (
						<div className="flex flex-shrink-0 justify-center pt-3 pb-1">
							<div className="h-1 w-10 bg-border" />
						</div>
					)}
					<DrawerHeader className="flex-shrink-0 border-b border-border px-5 pt-5 pb-4">
						<DrawerTitle className="text-lg font-semibold tracking-tight">
							Log New Trade
						</DrawerTitle>
						<DrawerDescription className="mt-1 text-sm text-muted-foreground">
							Record the setup, execution, and outcome in one place.
						</DrawerDescription>
					</DrawerHeader>
					<div className="flex-1 overflow-y-auto px-5 py-5">
						<TradeEntryForm
							key={initialDraft?.portfolioId}
							initialDraft={initialDraft}
							onSuccess={close}
							onCancel={close}
						/>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
