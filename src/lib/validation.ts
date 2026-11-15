export function normalizeMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[\s().-]/g, "");
  const normalized = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function isValidUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 3 &&
    value.trim().length <= 32 &&
    /^[a-zA-Z0-9._-]+$/.test(value.trim())
  );
}

export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 10 &&
    Buffer.byteLength(value, "utf8") <= 72
  );
}
