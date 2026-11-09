// Rand amounts for refund requests.

/** 'R 1 250.50' for 1250.5. Returns '' for empty / invalid input. */
export function formatRand(value: unknown): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!isFinite(n)) return '';
  // Manual formatting (not toLocaleString) so it looks the same on every device: R 1 250.50
  const [whole, cents] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${cents}`;
}

/** Keeps digits and one decimal point (comma is accepted as the decimal mark), max 2 decimals. */
export function cleanAmountInput(text: string): string {
  const t = text.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = t.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}
