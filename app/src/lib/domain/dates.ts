const warsawDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Europe/Warsaw as `YYYY-MM-DD`. */
export function todayInWarsaw(now: Date): string {
  const parts = warsawDateFormat.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const MS_PER_DAY = 86_400_000;

function toUtcMidnight(dateYYYYMMDD: string): number {
  const [year = NaN, month = NaN, day = NaN] = dateYYYYMMDD.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(fromYYYYMMDD: string, toYYYYMMDD: string): number {
  return Math.round((toUtcMidnight(toYYYYMMDD) - toUtcMidnight(fromYYYYMMDD)) / MS_PER_DAY);
}
