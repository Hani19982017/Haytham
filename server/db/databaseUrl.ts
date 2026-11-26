/**
 * DATABASE_URL as pasted from a host's dashboard (Neon, Render, Supabase…),
 * cleaned up so both the app and the Prisma CLI can use it.
 *
 * - Copy buttons sometimes include more than the address: surrounding quotes,
 *   a leading `DATABASE_URL=`, or Neon's `psql '…'` snippet. Those are removed.
 * - Neon stops an idle database after 5 minutes and starts it again on the next
 *   connection, which can take longer than Prisma's 5-second default, so a Neon
 *   address gets `connect_timeout=15` unless it already sets one.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string {
  let url = String(raw ?? '').trim();
  url = url.replace(/^DATABASE_URL\s*=\s*/i, '').trim();
  url = url.replace(/^psql\s+/i, '').trim();
  if (url.length >= 2 && (url[0] === "'" || url[0] === '"') && url[url.length - 1] === url[0]) {
    url = url.slice(1, -1).trim();
  }
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (/\.neon\.tech$/i.test(parsed.hostname) && !parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '15');
      return parsed.toString();
    }
  } catch {
    // Not a URL we can read: hand it to Prisma as it is, so its own error explains the problem.
  }
  return url;
}

/**
 * The direct (not pooled) address of the same database, for schema changes.
 * Neon's pooled addresses have `-pooler` in the host name; the Prisma CLI needs
 * one steady connection, which the pooler does not give.
 */
export function directDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (/\.neon\.tech$/i.test(parsed.hostname) && parsed.hostname.includes('-pooler.')) {
      parsed.hostname = parsed.hostname.replace('-pooler.', '.');
      return parsed.toString();
    }
  } catch {
    // Leave anything we cannot read unchanged.
  }
  return url;
}
