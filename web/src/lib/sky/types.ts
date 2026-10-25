// Shared types for the /sky page: a cone on the celestial sphere and what sky agents found in it.

export type Cone = { ra: number; dec: number; radius: number }; // degrees, ICRS

export type SkyCategory = "galaxy" | "nebula" | "cluster" | "star" | "exoplanet" | "solar-system" | "observation" | "other";

export type SkySourceId = "simbad" | "exoplanets" | "horizons" | "telescopes";

export type SkyObject = {
  /** Citation id, e.g. "S3" (SIMBAD), "X2" (exoplanet), "J1" (JPL Horizons), "T1" (MAST telescope archive). Assigned by the route. */
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

/** Observer agent: Claude looking at a DSS2 cutout of the cone, alongside the catalog results. */
export type SkyObservation = { text: string; ids: string[] };
export type SkyObserver = { observations: SkyObservation[]; dropped: number; image: string; model: string };

export type SkyEvent =
  | { type: "results"; cone: Cone; objects: SkyObject[]; sources: SkySourceReport[]; ms: number }
  | { type: "summary"; summary: SkySummary | null; note?: string; ms: number }
  | { type: "observer"; observer: SkyObserver | null; image?: string; note?: string; ms: number }
  | { type: "error"; message: string };

export const SKY_MAX_RADIUS = 3;
