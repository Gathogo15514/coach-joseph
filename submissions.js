// Coach-only API.
// GET  /api/submissions                → list of all submissions (summary fields)
// GET  /api/submissions?pathname=...   → one full submission, including signature
// DELETE /api/submissions?pathname=... → delete one submission (e.g. a test entry)
// Every call needs the x-admin-password header.
import { list, get, del } from '@vercel/blob';
import { json, isAdmin, isSafePathname } from './_lib.js';

async function readRecord(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: 'Wrong password.' }, 401);
  const url = new URL(request.url);
  const pathname = url.searchParams.get('pathname');

  if (pathname) {
    if (!isSafePathname(pathname)) return json({ error: 'Bad request.' }, 400);
    const record = await readRecord(pathname);
    return record ? json(record) : json({ error: 'Not found.' }, 404);
  }

  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'submissions/', cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  // Read each record so the list can show names and event details.
  const items = await Promise.all(
    blobs.map(async (b) => {
      try {
        const r = await readRecord(b.pathname);
        if (!r) return null;
        const d = r.data || {};
        return {
          pathname: b.pathname,
          ref: r.ref,
          type: r.type,
          submitted_at: r.submitted_at,
          student_name: d.student_name || '',
          parent_name: d.parent1_name || d.parent_name || '',
          parent_phone: d.parent1_phone || d.parent_phone || '',
          category: d.category || '',
          event_name: d.event_name || '',
          event_date: d.event_start || '',
          data: d,
        };
      } catch {
        return null;
      }
    })
  );

  const sorted = items.filter(Boolean).sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1));
  return json({ items: sorted });
}

export async function DELETE(request) {
  if (!isAdmin(request)) return json({ error: 'Wrong password.' }, 401);
  const pathname = new URL(request.url).searchParams.get('pathname');
  if (!isSafePathname(pathname)) return json({ error: 'Bad request.' }, 400);
  await del(pathname);
  return json({ ok: true });
}
