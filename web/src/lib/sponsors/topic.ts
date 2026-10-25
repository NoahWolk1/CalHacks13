// Turn a free-text question into the short search terms the sponsor workers send upstream.

const CATEGORIES: [RegExp, string][] = [
  [/\b(coffee|cafes?|espresso)\b/i, "coffee shop"],
  [/\bbaker(y|ies)\b/i, "bakery"],
  [/\b(bars?|pubs?|brewer(y|ies)|cocktail)\b/i, "bar"],
  [/\b(gyms?|fitness|yoga|pilates)\b/i, "gym"],
  [/\b(salons?|barber|hair|nail)\b/i, "salon"],
  [/\b(grocer(y|ies)|supermarket|market)\b/i, "grocery store"],
  [/\b(books?(tore|hop)?s?)\b/i, "bookstore"],
  [/\b(laundr(y|omat))\b/i, "laundromat"],
  [/\b(pizza)\b/i, "pizza"],
  [/\b(ramen|sushi|taco|burrito|thai|indian|chinese|mexican|italian|vegan|boba)\b/i, "$1 restaurant"],
  [/\b(restaurants?|food|dining|eat)\b/i, "restaurant"],
  [/\b(retail|boutique|shop|store)\b/i, "store"],
];

/** Business category to look up for the question ("Good spot for a café?" → "coffee shop"). */
export function businessCategory(question?: string, focus?: string): string | undefined {
  for (const text of [focus, question]) {
    if (!text) continue;
    const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // café → cafe (\b treats é as a boundary)
    for (const [re, cat] of CATEGORIES) {
      const m = plain.match(re);
      if (m) return cat.replace("$1", m[1]?.toLowerCase() ?? "");
    }
  }
  return undefined;
}

const STOP = new Set("a an the is are was were be been of in on at to for and or but with near around this that these those area here there what whats which who how why when where should would could can do does did i we my our me you it its any some good bad best worst place spot open opening start starting new about like look looking around neighborhood block street".split(" "));

/** A few content words from the question for a news/discussion search ("Is flooding a problem on 17th St?" → "flooding problem 17th"). */
export function searchTopic(question?: string, focus?: string, max = 4): string {
  const src = (focus || question || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return src.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).slice(0, max).join(" ");
}

/** "Mission District, San Francisco" → { place: "Mission District", city: "San Francisco" }. */
export function placeParts(label?: string) {
  const [place, city] = (label ?? "").split(",").map((s) => s.trim());
  return { place: place || undefined, city: city || undefined };
}

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
