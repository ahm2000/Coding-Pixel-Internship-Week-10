const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'passwordhash',
];

const REDACTED = '[REDACTED]';

// X2's own CHECK: an Authorization header should log as `Bearer
// [REDACTED]`, not vanish into a bare `[REDACTED]` - keeping the scheme
// word visible tells a reader *that* a bearer token was presented,
// without ever showing the token itself.
function redactAuthorizationValue(value: unknown): unknown {
  if (typeof value !== 'string') return REDACTED;
  const [scheme, ...rest] = value.split(' ');
  return rest.length > 0 ? `${scheme} ${REDACTED}` : REDACTED;
}

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
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'authorization') {
        out[key] = redactAuthorizationValue(val);
      } else {
        out[key] = SENSITIVE_KEYS.includes(lowerKey) ? REDACTED : val;
      }
    }
    return out;
  }
  return value;
}
