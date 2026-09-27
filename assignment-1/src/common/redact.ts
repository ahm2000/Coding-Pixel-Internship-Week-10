const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'passwordhash',
];

const REDACTED = '[REDACTED]';

/**
 * Masks known-sensitive fields before anything is logged, applied once
 * here rather than remembered at every call site (X2's own hint). Shallow
 * by design: request/response bodies in this API are flat DTOs, not
 * deeply nested secrets.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.includes(key.toLowerCase()) ? REDACTED : val;
    }
    return out;
  }
  return value;
}
