// Generated agents fetch URLs chosen by a user or an LLM. Only let them reach the public internet.
// Hostname-based check only (no DNS resolution), so this is a guardrail, not a sandbox.

import { isIP } from "node:net";

const BLOCKED_HOSTS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function privateV6(ip: string) {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s)) return true; // unique-local, link-local
  const v4 = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return !!v4 && privateV4(v4[1]);
}

/** Parse `raw` and throw unless it is an http(s) URL pointing at a public host. */
export function assertPublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Not a valid URL: ${raw.slice(0, 80)}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Only http(s) URLs are allowed (got ${u.protocol})`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const kind = isIP(host);
  if ((kind === 4 && privateV4(host)) || (kind === 6 && privateV6(host)) || (kind === 0 && BLOCKED_HOSTS.test(host)))
    throw new Error(`Blocked private or local host: ${host}`);
  return u;
}
