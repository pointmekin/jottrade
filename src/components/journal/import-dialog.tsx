import { Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdjustmentImportZone } from "./AdjustmentImportZone";
import { ImportZone } from "./ImportZone";
import { ImportHistory } from "./import-history";

export function ImportDialog() {
	const [isOpen, setIsOpen] = useState(false);
	const close = () => setIsOpen(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Upload className="mr-2 h-4 w-4" />
					Import CSV
				</Button>
			</DialogTrigger>
			<DialogContent className="bg-card sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Import journal data</DialogTitle>
					<DialogDescription>
						Choose the file type first. Trade history and account adjustments
						use different CSV formats.
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="trades" className="mt-2">
					<TabsList className="grid h-auto w-full grid-cols-3">
						<TabsTrigger
							className="min-w-0 whitespace-normal text-xs sm:text-sm"
							value="trades"
						>
							Trade history CSV
						</TabsTrigger>
						<TabsTrigger
							className="min-w-0 whitespace-normal text-xs sm:text-sm"
							value="adjustments"
						>
							Adjustment CSV
						</TabsTrigger>
						<TabsTrigger
							className="min-w-0 whitespace-normal text-xs sm:text-sm"
							value="history"
						>
							Import history
						</TabsTrigger>
					</TabsList>
					{/* A fixed body height keeps the dialog still when the tab changes. */}
					<div className="mt-4 h-[26rem] overflow-y-auto">
						<TabsContent value="trades" className="space-y-3">
							<p className="text-xs leading-5 text-muted-foreground">
								In Exness History of orders, choose the account and date range,
								download the trade CSV, then upload it here.
							</p>
							<ImportZone onSuccess={close} />
						</TabsContent>
						<TabsContent value="adjustments">
							<AdjustmentImportZone onSuccess={close} />
						</TabsContent>
						<TabsContent value="history">
							<ImportHistory />
						</TabsContent>
					</div>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
