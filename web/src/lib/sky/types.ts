// Shared types for the /sky page: a cone on the celestial sphere and what sky agents found in it.

export type Cone = { ra: number; dec: number; radius: number }; // degrees, ICRS

export type SkyCategory = "galaxy" | "nebula" | "cluster" | "star" | "exoplanet" | "solar-system" | "observation" | "candidate" | "variable" | "other";

/** "lightcurves": the analysis agents' results (transit signals C1.., variable stars V1..). */
export type SkySourceId = "simbad" | "exoplanets" | "horizons" | "telescopes" | "lightcurves";

export type SkyObject = {
  /** Citation id, e.g. "S3" (SIMBAD), "X2" (exoplanet), "J1" (JPL Horizons), "T1" (MAST telescope archive),
   *  "C1" (transit signal), "V1" (variable star). Assigned by the route / analysis. */
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
  /** Partial success, e.g. MAST's full archive summary still searching while the TESS inventory is in. */
  note?: string;
};

export type SkySummary = { headline: string; bullets: { text: string; ids: string[] }[]; dropped: number; question?: string };

/** Observer agent: Claude looking at a DSS2 cutout of the cone, alongside the catalog results. */
export type SkyObservation = { text: string; ids: string[] };
export type SkyObserver = { observations: SkyObservation[]; dropped: number; image: string; model: string };

// ── light-curve analysis (analysis.ts) ──────────────────────────────────────

/** The analysis agents: each runs one algorithm over the cone's real TESS light curves. */
export type SkyAnalysisAgentId = "lightcurves" | "transits" | "variability" | "vetting";

/** A star whose light curve is being analysed. */
export type AnalysisStar = { tic: string; name: string; otype: string; ra: number; dec: number; vmag?: number; pipeline: string; sector: number };

/** What the Transit Hunter and Variability agents found on one star (measured, before vetting). */
export type StarResult = {
  tic: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  points?: number; // good cadences after cleaning and binning
  transit?: { period: number; t0: number; duration: number; depth: number; snr: number; sde: number; transits: number; oddEven: number; oddEvenSigma: number; secondary: number; secondarySigma: number; detected: boolean };
  variability?: { period: number; amplitude: number; power: number; fap: number; variable: boolean };
  ms: number;
};

export type SkyAgentReport = { agent: SkyAnalysisAgentId; label: string; status: "ok" | "empty" | "error"; detail: string; ms: number };

export type SkyAnalysis = {
  stars: AnalysisStar[];
  results: StarResult[];
  agents: SkyAgentReport[];
  /** Transit signals (C1..) with the Vetter's verdict, and variable stars (V1..). */
  objects: SkyObject[];
  candidates: number; // unvetted candidates that survived every check
  ms: number;
  note?: string;
};

export type SkyEvent =
  | { type: "results"; cone: Cone; objects: SkyObject[]; sources: SkySourceReport[]; ms: number }
  /** MAST's full archive summary landed after "results" (cold CAOM search): extra T objects. */
  | { type: "archive"; objects: SkyObject[]; ms: number }
  | { type: "analysis-start"; stars: AnalysisStar[]; ms: number }
  | { type: "analysis-star"; result: StarResult; ms: number }
  | { type: "analysis"; analysis: SkyAnalysis | null; note?: string; ms: number }
  | { type: "summary"; summary: SkySummary | null; note?: string; ms: number }
  | { type: "observer"; observer: SkyObserver | null; image?: string; note?: string; ms: number }
  | { type: "error"; message: string };

export const SKY_MAX_RADIUS = 3;
