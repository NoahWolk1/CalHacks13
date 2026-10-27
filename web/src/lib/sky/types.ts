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

/** The analysis agents: the Strategist plans, the others each run one algorithm over the cone's real
 *  TESS light curves, the Follow-up agent re-tests what they found. */
export type SkyAnalysisAgentId = "strategist" | "lightcurves" | "transits" | "singles" | "variability" | "vetting" | "census" | "followup";

/** Where the Strategist thinks something new can still hide on a star, and so how it's searched:
 *  - multi-planet: a known planet / TOI host; its known transits are masked and the rest searched
 *    (planets come in systems: additional ones are the most common TESS follow-up finds)
 *  - long-period: many sectors stitched, so planets with periods beyond one sector show 2+ transits
 *  - deep-search: no 2-min light curve (full-frame images only), so TESS's own SPOC search never ran on it
 *  - census: single sector, variability and eclipsing binaries checked against the variable-star catalogs */
export type Playbook = "multi-planet" | "long-period" | "deep-search" | "census";

/** A star whose light curves are being analysed, with the Strategist's playbook. */
export type AnalysisStar = {
  tic: string; name: string; otype: string; ra: number; dec: number; vmag?: number; pipeline: string;
  sector: number; // latest sector searched
  sectors: number[]; // every sector stitched into the search
  heldOut: number; // further sectors kept back for the Follow-up agent
  playbook: Playbook; why: string;
  masked: string[]; // known planets / TOIs whose transits are cut out before searching
};

/** One periodic signal from the iterative search. */
export type TransitSignal = { period: number; t0: number; duration: number; depth: number; snr: number; sde: number; transits: number; oddEven: number; oddEvenSigma: number; secondary: number; secondarySigma: number; detected: boolean };
export type SingleDip = { t: number; duration: number; depth: number; snr: number };

/** What the Transit Hunter and Variability agents found on one star (measured, before vetting). */
export type StarResult = {
  tic: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  points?: number; // good cadences after cleaning and binning
  transit?: TransitSignal; // the strongest signal
  signals?: TransitSignal[]; // every signal that passed, strongest first (multi-planet systems)
  singles?: SingleDip[]; // lone transit-shaped dips
  days?: number; // baseline searched
  variability?: { period: number; amplitude: number; power: number; fap: number; variable: boolean };
  ms: number;
};

/** The Strategist's plan for the run. */
export type SkyPlan = { strategy: string; by: "claude" | "heuristic"; pool: number; note?: string };
/** A lab-notebook line: what an agent decided or noticed, citing result ids where it can. */
export type SkyNote = { agent: SkyAnalysisAgentId; text: string; ids?: string[] };

export type SkyAgentReport = { agent: SkyAnalysisAgentId; label: string; status: "ok" | "empty" | "error"; detail: string; ms: number };

export type SkyAnalysis = {
  stars: AnalysisStar[];
  results: StarResult[];
  agents: SkyAgentReport[];
  /** Transit signals and single dips (C1..) with the Vetter's and Follow-up agent's verdicts, and variable stars (V1..). */
  objects: SkyObject[];
  candidates: number; // unvetted transit candidates that survived every check
  /** Everything new: transit candidates, single-transit events, uncatalogued eclipsing binaries and variables. */
  discoveries: number;
  plan?: SkyPlan;
  notes: SkyNote[];
  ms: number;
  note?: string;
};

export type SkyEvent =
  | { type: "results"; cone: Cone; objects: SkyObject[]; sources: SkySourceReport[]; ms: number }
  /** MAST's full archive summary landed after "results" (cold CAOM search): extra T objects. */
  | { type: "archive"; objects: SkyObject[]; ms: number }
  | { type: "analysis-start"; stars: AnalysisStar[]; plan?: SkyPlan; ms: number }
  | { type: "analysis-note"; note: SkyNote; ms: number }
  | { type: "analysis-star"; result: StarResult; ms: number }
  | { type: "analysis"; analysis: SkyAnalysis | null; note?: string; ms: number }
  | { type: "summary"; summary: SkySummary | null; note?: string; ms: number }
  | { type: "observer"; observer: SkyObserver | null; image?: string; note?: string; ms: number }
  | { type: "error"; message: string };

export const SKY_MAX_RADIUS = 3;

/** The analysis results that would be new if they hold up (the rest are known or rejected). */
export const isNewFind = (o: Pick<SkyObject, "type">) => /^(Unvetted|Candidate additional|Single-transit|Uncatalogued)/.test(o.type);
