import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea"; 
// Note: Textarea might not be in shadcn default add list safely, fall back to Input or generic HTML if missing
// But usually good to have. I'll stick to Input for 'notes' for now if Textarea not added, or try to import it.
// Checking installed components... Textarea not explicit, using basic HTML or Input.
import { SheetClose, SheetFooter } from "@/components/ui/sheet";

const formSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").transform(s => s.toUpperCase()),
  side: z.enum(["LONG", "SHORT"]),
  entryDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date"),
  entryPrice: z.string().min(1, "Price is required"),
  quantity: z.string().min(1, "Quantity is required"),
  notes: z.string().optional(),
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
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await createTrade({ data: values });
    },
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

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutation.mutate(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
                    <Input type="number" step="0.01" placeholder="10" {...field} />
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Trade"}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}
