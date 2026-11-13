import * as fmt from "$lib/hud/fmt";

/** 1536000 -> "1.5 MB" */
export function bytes(n: number | null | undefined): string {
  if (n == null) return fmt.BLANK;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) [value, unit] = [value / 1024, unit + 1];
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Process uptime: 93784 -> "1D 2H 3M" (fmt.age prints the two largest units). */
export const uptime = (seconds: number): string => fmt.age(seconds);
