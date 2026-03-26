import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { format } from "date-fns";

export type Trade = {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT" | string;
  status: string | null;
  entryDate: Date;
  exitDate: Date | null;
  entryPrice: string | null;
  exitPrice: string | null;
  quantity: string | null;
  netPnl: string | null;
  returnPercent: string | null;
};

const columns: ColumnDef<Trade>[] = [
  {
    accessorKey: "entryDate",
    header: "Date",
    cell: ({ row }) => {
        try {
            return format(new Date(row.getValue("entryDate")), "MMM dd, HH:mm");
        } catch (e) {
            return "Invalid Date";
        }
    },
  },
  {
    accessorKey: "symbol",
    header: "Symbol",
    cell: ({ row }) => <span className="font-bold">{row.getValue("symbol")}</span>,
  },
  {
    accessorKey: "side",
    header: "Side",
    cell: ({ row }) => {
        const side = row.getValue("side") as string;
        return (
            <span className={`px-2 py-1 rounded text-xs font-medium ${side === 'LONG' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>
                {side}
            </span>
        )
    },
  },
  {
    accessorKey: "entryPrice",
    header: "Entry",
    cell: ({ row }) => {
        const val = parseFloat(row.getValue("entryPrice") || "0");
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }
  },
  {
    accessorKey: "exitPrice",
    header: "Exit",
    cell: ({ row }) => {
        const valStr = row.getValue("exitPrice");
        if (!valStr) return "-";
        const val = parseFloat(valStr as string);
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }
  },
  {
    accessorKey: "quantity",
    header: "Qty",
  },
  {
    accessorKey: "exitDate",
    header: "Exit Date",
    cell: ({ row }) => {
        const val = row.getValue("exitDate");
        if (!val) return <span className="text-zinc-600">-</span>;
        try {
            return format(new Date(val as Date), "MMM dd, HH:mm");
        } catch (e) {
            return "-";
        }
    },
  },
  {
    accessorKey: "status",
    header: "Status",
     cell: ({ row }) => (
        <span className="text-zinc-400 text-xs uppercase">{row.getValue("status")}</span>
     )
  },
  {
    accessorKey: "fees",
    header: "Fees",
    cell: ({ row }) => {
        const val = parseFloat(row.getValue("fees") || "0");
        return <span className="text-zinc-500">{val > 0 ? val.toFixed(2) : "-"}</span>
    }
  },
  {
      id: "pnl",
      header: "Net P&L",
      cell: ({ row }) => {
          const val = row.original.netPnl;
          if (!val) return <span className="text-zinc-500">-</span>;
          const num = parseFloat(val);
          const color = num >= 0 ? "text-green-500" : "text-red-500";
          return <span className={`font-medium ${color}`}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)}</span>
      }
  },
  {
      id: "roi",
      header: "ROI",
      cell: ({ row }) => {
          const val = row.original.returnPercent;
          if (!val) return <span className="text-zinc-500">-</span>;
          const num = parseFloat(val);
          const color = num >= 0 ? "text-green-500" : "text-red-500";
          return <span className={`font-medium ${color}`}>{num.toFixed(2)}%</span>
      }
  }
];

interface JournalTableProps {
  data: Trade[];
  onRowClick?: (trade: Trade) => void;
}

export function JournalTable({ data, onRowClick }: JournalTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
      { id: "entryDate", desc: true } // Default sort
  ]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <div className="rounded-md border border-zinc-800">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-zinc-800 hover:bg-zinc-900/50">
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id} className="text-zinc-400">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="text-zinc-200">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                No trades found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
       <div className="flex items-center justify-end space-x-2 py-4 px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
