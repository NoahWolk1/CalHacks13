// Auto-routing: which orchestrator profile owns a question. With Claude the planner picks the
// profile in the same call that picks the agents (run.ts llmPlan); this keyword router is the
// no-Claude fallback (no key, quota reached, planner error).
import { PROFILES } from "./profiles";

export const AUTO = "auto";
/** Insights mode with no question: the default survey team. */
export const DEFAULT_PROFILE = "site-risk";
/** A question no specialist's keywords match: the general Area Researcher. */
export const DEFAULT_ASK_PROFILE = "general";

export const isProfileId = (id?: string | null): id is string => !!id && PROFILES.some((p) => p.id === id);
/** A known profile id, or "auto" (omitted, "auto" or unknown ids all mean auto). */
export const normalizeProfileId = (id?: string) => (isProfileId(id) ? id : AUTO);

// Same style as run.ts KEYWORDS: leading \b so "current" doesn't match /rent/, "know" doesn't match /now/.
const ROUTES: { profileId: string; re: RegExp }[] = [
  {
    profileId: "storefront",
    re: /\b(shop|store|storefront|caf[eé]|coffee|restaurant|bakery|bar\b|food|drink|retail|business|customers?|clients?|rent\b|lease|foot ?traffic|competit|saturat|open (a|my)|spend|market\b|demand)/gi,
  },
  {
    profileId: "disaster",
    re: /\b(now\b|right now|current|currently|today|tonight|happening|emergenc|fire|wildfire|smoke|evacuat|alert|warning|storm|outage|earthquake damage|damage|disaster|relief|respon|situation|on the ground|shelter|critical facilit|hospital|reporting|problems)/gi,
  },
  {
    profileId: "site-risk",
    re: /\b(build|construct|buy|purchase|develop|flood|risk|hazard|insur|safe|seismic|quake|earthquake|liquefaction|elevation|sea.?level|homebuyer|property|parcel|zoning)/gi,
  },
];

/** Keyword router: the profile whose keywords the question hits most. Ties go to the first listed; no match → Area Researcher. */
export function routeByKeywords(question: string): { profileId: string; reason: string } {
  let best: { profileId: string; hits: string[] } | null = null;
  for (const { profileId, re } of ROUTES) {
    const hits = [...new Set((question.match(re) ?? []).map((h) => h.toLowerCase()))];
    // Strictly more hits to win, so on a tie the more specific profile listed first keeps it.
    if (hits.length && (!best || hits.length > best.hits.length)) best = { profileId, hits };
  }
  if (!best) return { profileId: DEFAULT_ASK_PROFILE, reason: "No specialist fits; general area research" };
  return { profileId: best.profileId, reason: `Question mentions ${best.hits.slice(0, 2).map((h) => `"${h}"`).join(" and ")}` };
}
