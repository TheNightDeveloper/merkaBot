export function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return Object.fromEntries(entries) as T;
}
