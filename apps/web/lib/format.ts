export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function dollarsToCents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}
