import { usdToCad } from "./costs";

export type OrderCostLine = { category: string; cost_cents: number; currency: string };

/** Total cost in CAD cents, converting US dollar lines at USD_TO_CAD. */
export function costCad(lines: OrderCostLine[]) {
  const rate = usdToCad();
  return lines.reduce((sum, l) => sum + Number(l.cost_cents) * (l.currency === "usd" ? rate : 1), 0);
}
