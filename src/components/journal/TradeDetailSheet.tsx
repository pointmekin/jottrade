import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2, Upload, X } from 'lucide-react';
import { updateTrade } from '@/server/tradeActions';
import { getSignedUploadUrl, saveTradeImage, deleteTradeImage } from '@/server/imageActions';
import { getStrategies } from '@/server/strategyActions';
import type { Trade } from './JournalTable';

const MISTAKE_OPTIONS = [
  'FOMO', 'Revenge Trading', 'Oversize Position', 'Early Exit',
  'Late Exit', 'No Trading Plan', 'Moved Stop Loss',
];

const overviewSchema = z.object({
  entryPrice: z.string(),
  exitPrice: z.string().optional(),
  quantity: z.string(),
  fees: z.string().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  mistake: z.string().optional(),
  setupId: z.string().optional(), // stringified number or "none"
});
type OverviewValues = z.infer<typeof overviewSchema>;

interface TradeDetailSheetProps {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeDetailSheet({ trade, open, onOpenChange }: TradeDetailSheetProps) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies({ data: undefined }),
  });

  const { register, handleSubmit, setValue, watch } = useForm<OverviewValues>({
    resolver: zodResolver(overviewSchema),
    values: {
      entryPrice: trade?.entryPrice ?? '',
      exitPrice: trade?.exitPrice ?? '',
      quantity: trade?.quantity ?? '',
      fees: (trade as any)?.fees ?? '',
      confidence: (trade as any)?.confidence ?? undefined,
      mistake: (trade as any)?.mistake ?? undefined,
      setupId: (trade as any)?.setupId?.toString() ?? 'none',
    },
  });

  const saveMut = useMutation({
    mutationFn: (values: OverviewValues) =>
      updateTrade({
        data: {
          id: trade!.id,
          entryPrice: values.entryPrice,
          exitPrice: values.exitPrice,
          quantity: values.quantity,
          fees: values.fees,
          confidence: values.confidence as any,
          mistake: values.mistake,
          setupId: values.setupId === 'none' ? null : Number(values.setupId),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const noteMut = useMutation({
    mutationFn: (notes: string) => updateTrade({ data: { id: trade!.id, notes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const deleteImgMut = useMutation({
    mutationFn: (url: string) => deleteTradeImage({ data: { tradeId: trade!.id, url } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!trade || !accepted.length) return;
    setUploading(true);
    try {
      for (const file of accepted) {
        const { signedUrl, publicUrl } = await getSignedUploadUrl({
          data: { tradeId: trade.id, fileName: file.name, contentType: file.type },
        }) as { signedUrl: string; publicUrl: string };
        await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        await saveTradeImage({ data: { tradeId: trade.id, url: publicUrl } });
      }
      qc.invalidateQueries({ queryKey: ['trades'] });
    } finally {
      setUploading(false);
    }
  }, [trade, qc]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 10,
  });

  const screenshots: string[] = (trade as any)?.screenshots ?? [];
  const netPnl = trade?.netPnl ? parseFloat(trade.netPnl) : null;

  if (!trade) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-zinc-950 border-l-zinc-800 text-white overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-white text-xl">{trade.symbol}</SheetTitle>
            <Badge className={trade.side === 'LONG' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}>
              {trade.side}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs uppercase">
              {trade.status}
            </Badge>
            {netPnl !== null && (
              <span className={`text-sm font-medium ml-auto ${netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}
              </span>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="images">Images {screenshots.length > 0 && `(${screenshots.length})`}</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Entry Price</Label>
                  <Input {...register('entryPrice')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Exit Price</Label>
                  <Input {...register('exitPrice')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Quantity</Label>
                  <Input {...register('quantity')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-400 text-xs">Fees</Label>
                  <Input {...register('fees')} className="bg-zinc-900 border-zinc-700 text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Confidence</Label>
                <Select value={watch('confidence') ?? ''} onValueChange={(v) => setValue('confidence', v as any)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Select confidence" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {['HIGH', 'MEDIUM', 'LOW'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Mistake</Label>
                <Select value={watch('mistake') ?? ''} onValueChange={(v) => setValue('mistake', v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Any mistake?" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="__none__">None</SelectItem>
                    {MISTAKE_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-zinc-400 text-xs">Strategy</Label>
                <Select value={watch('setupId') ?? 'none'} onValueChange={(v) => setValue('setupId', v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="none">None</SelectItem>
                    {(strategies as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={saveMut.isPending} className="w-full">
                {saveMut.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </form>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-4 space-y-3">
            <Textarea
              defaultValue={(trade as any)?.notes ?? ''}
              className="bg-zinc-900 border-zinc-700 text-white min-h-48 resize-none"
              placeholder="Add your trade notes here…"
              onBlur={(e) => noteMut.mutate(e.target.value)}
            />
            <p className="text-xs text-zinc-600">Changes saved on blur.</p>
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="mt-4 space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-500'}`}
            >
              <input {...getInputProps()} />
              <Upload className="h-6 w-6 mx-auto mb-2 text-zinc-500" />
              <p className="text-sm text-zinc-400">
                {uploading ? 'Uploading…' : isDragActive ? 'Drop images here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-zinc-600 mt-1">Max 10MB · JPEG, PNG, WebP, GIF · Up to 10 images</p>
            </div>

            {screenshots.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {screenshots.map((url) => (
                  <div key={url} className="relative group rounded-lg overflow-hidden bg-zinc-900">
                    <img src={url} alt="Trade screenshot" className="w-full h-32 object-cover" />
                    <button
                      onClick={() => deleteImgMut.mutate(url)}
                      className="absolute top-1 right-1 p-1 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
