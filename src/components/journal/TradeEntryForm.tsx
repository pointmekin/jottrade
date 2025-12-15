import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTrade } from "@/server/tradeActions";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";

const formSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").transform(s => s.toUpperCase()),
  side: z.enum(["LONG", "SHORT"]),
  entryDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
  entryPrice: z.string().min(1, "Price is required"),
  quantity: z.string().min(1, "Quantity is required"),
  notes: z.string().optional(),
  exitPrice: z.string().optional(),
  exitDate: z.string().optional(),
  fees: z.string().optional(),
});

interface TradeEntryFormProps {
  onSuccess?: () => void;
}

export function TradeEntryForm({ onSuccess }: TradeEntryFormProps) {
  const queryClient = useQueryClient();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      symbol: "",
      side: "LONG",
      entryDate: new Date().toISOString().slice(0, 16), // datetime-local format
      entryPrice: "",
      quantity: "",
      notes: "",
      exitPrice: "",
      exitDate: "",
      fees: "",
    },
  });

  const { mutate: logTrade, isPending } = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) => createTrade({ data: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      form.reset();
      onSuccess?.();
    },
    onError: (error) => {
        console.error("Failed to create trade", error);
        // Add toast here potentially
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => logTrade(values))} className="space-y-4 py-4">
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Symbol</FormLabel>
              <FormControl>
                <Input placeholder="AAPL" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="side"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Side</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select side" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    <SelectItem value="LONG">Long</SelectItem>
                    <SelectItem value="SHORT">Short</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
            
            <FormField
            control={form.control}
            name="entryDate"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Entry Date</FormLabel>
                <FormControl>
                    <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <div className="grid grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="entryPrice"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Entry Price</FormLabel>
                <FormControl>
                    <Input type="number" step="0.0001" placeholder="150.00" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                    <Input type="number" step="0.0001" placeholder="10" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <div className="pt-2 border-t border-zinc-800">
             <p className="text-sm font-medium text-zinc-400 mb-2">Outcome (Optional)</p>
             <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="exitPrice"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Exit Price</FormLabel>
                    <FormControl>
                        <Input type="number" step="0.0001" placeholder="155.00" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />

                <FormField
                control={form.control}
                name="exitDate"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Exit Date</FormLabel>
                    <FormControl>
                        <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
             <FormField
                control={form.control}
                name="fees"
                render={({ field }) => (
                    <FormItem className="mt-4">
                    <FormLabel>Fees</FormLabel>
                    <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                {/* Fallback to Input just in case Textarea isn't ready, can swap later */}
                <Input placeholder="Setup context, emotions..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SheetFooter className="pt-4">
          <SheetClose asChild>
            <Button variant="outline" type="button">Cancel</Button>
          </SheetClose>
          <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Logging..." : "Log Trade"}
        </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
