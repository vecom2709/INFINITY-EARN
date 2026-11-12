export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

export function isConstraintAbort(e: unknown, code: string): boolean {
  return e instanceof Error && e.message.includes(code);
}
