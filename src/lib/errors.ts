export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function assert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(status, message);
}
