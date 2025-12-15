// import { Decimal } from "decimal.js";

// We use string or number for inputs, but do math with Decimal/precision if needed.
// For simplicity in this stack without extra heavy libs, we can use simple math or 'decimal.js' if precision is critical.
// Given numeric type in DB, JS numbers are okay for basic UI, but floating point errors happen.
// Let's assume input strings to keep precision if we parse them carefully.
// But for "StonkJournal" clone, simple JS math `toFixed(2)` is often typically accepted unless crypto high precision.
// Let's strictly use safe floating point math helper or standard JS with care.

export function calculatePnL(
  side: "LONG" | "SHORT",
  entryPrice: string | number,
  exitPrice: string | number,
  quantity: string | number,
  fees: string | number = 0
) {
  const entry = Number(entryPrice);
  const exit = Number(exitPrice);
  const qty = Number(quantity);
  const fee = Number(fees);

  if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return { netPnl: "0", returnPercent: "0" };

  let grossPnl = 0;
  if (side === "LONG") {
    grossPnl = (exit - entry) * qty;
  } else {
    grossPnl = (entry - exit) * qty;
  }

  const netPnl = grossPnl - fee;
  
  // Return Percent: (Net PnL / Cost Basis) * 100 ? 
  // Or (Exit - Entry)/Entry * 100?
  // Usually PnL % is on the invested capital.
  const costBasis = entry * qty;
  const returnPercent = costBasis !== 0 ? (netPnl / costBasis) * 100 : 0;

  return {
    netPnl: netPnl.toFixed(2),
    returnPercent: returnPercent.toFixed(2),
  };
}
