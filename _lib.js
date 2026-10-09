// Shared helpers for the parent-forms API. Files starting with "_" are not
// exposed as routes by Vercel.
import { timingSafeEqual } from 'node:crypto';

export const MAX_BODY_BYTES = 600_000; // form data + one signature image

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// Only the coach can read submissions. The password lives in the
// ADMIN_PASSWORD environment variable on Vercel, never in the page code.
export function isAdmin(request) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const given = request.headers.get('x-admin-password') || '';
  if (expected.length < 10 || given.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isSafePathname(p) {
  return typeof p === 'string' && /^submissions\/(registration|event)\/[0-9A-Za-z_\-]+\.json$/.test(p);
}
