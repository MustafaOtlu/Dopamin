export const timezone = process.env.APP_TIMEZONE || "Europe/Istanbul";
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date = today()) {
  const day = new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}
