// POST /api/submit — a parent submits the registration or an event consent.
// Saved as a private JSON file; nobody can read it without the coach password.
import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { json, MAX_BODY_BYTES } from './_lib.js';

const TYPES = new Set(['registration', 'event']);
const CATEGORIES = new Set(['nairobi', 'outside', 'overnight', 'trip']);

function clean(value, depth = 0) {
  if (depth > 4) return null;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => clean(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 200)) {
      if (/^[A-Za-z0-9_]{1,60}$/.test(k)) out[k] = clean(v, depth + 1);
    }
    return out;
  }
  return null;
}

export async function POST(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return json({ error: 'Submission is too large.' }, 413);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Submission is too large.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Could not read the form. Please try again.' }, 400);
  }

  // Hidden field that people never see; bots tend to fill it.
  if (body && body.website) return json({ ok: true, ref: 'received' });

  const type = body && body.type;
  if (!TYPES.has(type)) return json({ error: 'Unknown form type.' }, 400);

  const data = clean(body.data || {});
  const signature = typeof body.signature === 'string' ? body.signature : '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 450_000) {
    return json({ error: 'Please sign in the signature box before submitting.' }, 400);
  }

  const required = type === 'registration'
    ? ['student_name', 'student_dob', 'parent1_name', 'parent1_phone', 'signed_name', 'agree_policy']
    : ['category', 'event_name', 'student_name', 'parent_name', 'parent_phone', 'signed_name', 'agree_terms'];
  const missing = required.filter((k) => data[k] === undefined || data[k] === '' || data[k] === false);
  if (missing.length) return json({ error: 'Some required fields are empty.', missing }, 400);
  if (type === 'event' && !CATEGORIES.has(data.category)) return json({ error: 'Unknown event category.' }, 400);

  const now = new Date();
  const ref = `${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const record = {
    ref,
    type,
    submitted_at: now.toISOString(),
    policy_version: String(body.policy_version || '').slice(0, 40),
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
    data,
    signature,
  };

  try {
    await put(`submissions/${type}/${ref}.json`, JSON.stringify(record), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error('save failed', err && err.message);
    return json({ error: 'We could not save the form right now. Please try again in a minute.' }, 502);
  }

  return json({ ok: true, ref });
}
