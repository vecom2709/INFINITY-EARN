/** Entfernt Geheimnisse aus Logs und Audit-Daten (IE-085). */
const VALUE_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
  /\bwhsec_[A-Za-z0-9_-]{8,}\b/g,
  /\bscrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]{8,}\$[A-Za-z0-9_-]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, // IBAN-ähnlich
];

const SENSITIVE_KEY = /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|iban|signature|session|access[_-]?key)/i;

export const REDACTED = '[REDACTED]';

export function redactString(s: string): string {
  return VALUE_PATTERNS.reduce((acc, re) => acc.replace(re, REDACTED), s);
}

export function containsSecret(s: string): boolean {
  return VALUE_PATTERNS.some((re) => {
    re.lastIndex = 0;
    const hit = re.test(s);
    re.lastIndex = 0;
    return hit;
  });
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
