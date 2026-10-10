import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { useAccounts } from "@/hooks/use-accounts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHasTradeDraft } from "@/hooks/use-trade-draft";
import { authClient } from "@/lib/auth-client";
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
	const { data: session } = authClient.useSession();
	const { activeAccount } = useAccounts();
	const hasDraft = useHasTradeDraft(session?.user.id, activeAccount?.id);

	return (
		<Drawer
			open={isOpen}
			onOpenChange={setIsOpen}
			direction={isDesktop ? "right" : "bottom"}
		>
			<DrawerTrigger asChild>
				<Button disabled={disabled}>
					{trigger ?? (
						<>
							<Plus className="mr-2 h-4 w-4" />
							Log Trade
							{hasDraft && (
								<span className="ml-2 rounded-sm bg-primary-foreground/20 px-1.5 text-xs">
									Draft
								</span>
							)}
						</>
					)}
				</Button>
			</DrawerTrigger>
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
	);
}
