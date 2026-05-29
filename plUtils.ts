/**
 * 根据 entry_price / exit_price / quantity / direction 计算盈亏
 * @returns { pl, plPct } 盈亏金额和百分比，输入不完整时返回 null
 */
export function calcPL(
  entry: number | null,
  exit: number | null,
  qty: number | null,
  direction: "long" | "short",
): { pl: number; plPct: number } | null {
  if (entry == null || exit == null || qty == null) return null;
  if (entry === 0) return null;
  const sign = direction === "short" ? -1 : 1;
  const pl = sign * (exit - entry) * qty;
  const plPct = sign * ((exit - entry) / entry) * 100;
  return {
    pl: Math.round(pl * 100) / 100,
    plPct: Math.round(plPct * 100) / 100,
  };
}

/** 格式化盈亏显示文字 */
export function formatPL(pl: number, plPct: number): string {
  const sign = pl >= 0 ? "+" : "";
  return `${sign}${pl.toFixed(2)}  (${sign}${plPct.toFixed(2)}%)`;
}
