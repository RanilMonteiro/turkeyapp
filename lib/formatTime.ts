// Turns '13:00:00' (Postgres time column) into '13:00'.
// Leaves anything that isn't HH:MM or HH:MM:SS untouched.
export function formatTime(value?: string | null): string {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return value;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}
