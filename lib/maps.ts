// Site locations are stored as a pasted Google Maps link (or, for older sites,
// a plain address). These helpers turn either one into a link that opens Maps.

export function isUrl(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test((value ?? '').trim());
}

export function mapsUrlFor(address: string): string {
  const v = address.trim();
  if (isUrl(v)) return v;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
}
