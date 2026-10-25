// Shared types for the /sky page: a cone on the celestial sphere and what sky agents found in it.

export type Cone = { ra: number; dec: number; radius: number }; // degrees, ICRS

export type SkyCategory = "galaxy" | "nebula" | "cluster" | "star" | "exoplanet" | "solar-system" | "other";

export type SkySourceId = "simbad" | "exoplanets" | "horizons";

export type SkyObject = {
  /** Citation id, e.g. "S3" (SIMBAD), "X2" (exoplanet), "J1" (JPL Horizons). Assigned by the route. */
  id: string;
  name: string;
  type: string;
  category: SkyCategory;
  ra: number;
  dec: number;
  source: SkySourceId;
  url: string;
  props: Record<string, string | number>;
};

export type SkySourceReport = {
  source: SkySourceId;
  label: string;
  endpoint: string;
  status: "ok" | "empty" | "error";
  count: number;
  ms: number;
  error?: string;
};

export type SkySummary = { headline: string; bullets: { text: string; ids: string[] }[]; dropped: number; question?: string };

export type SkyEvent =
  | { type: "results"; cone: Cone; objects: SkyObject[]; sources: SkySourceReport[]; ms: number }
  | { type: "summary"; summary: SkySummary | null; note?: string; ms: number }
  | { type: "error"; message: string };

export const SKY_MAX_RADIUS = 3;
