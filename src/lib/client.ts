export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${url}`, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || "İşlem tamamlanamadı.", response.status);
  return result as T;
}
export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "İşlem tamamlanamadı.";
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Istanbul",
  });
}
