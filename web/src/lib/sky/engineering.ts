// Engineering intervals in TESS light curves that aren't science data. No imports: the light-curve
// parser uses it too.

/** Engineering intervals in the light curves that aren't science data (from the TESS Data Release
 *  Notes). QLP doesn't flag them, so a dip there can look like a transit. */
export const ENGINEERING: { sector: number; from: number; to: number; why: string }[] = [
  // S3 DRN: science data 1385.89663-1406.29247; before and after, attitude-control (ACS) tests.
  { sector: 3, from: 1380, to: 1385.8966, why: "Sector 3 attitude-control tests, before science data started (DRN: BTJD 1385.897)" },
  { sector: 3, from: 1406.2925, to: 1410, why: "Sector 3 attitude-control tests, after science data ended (DRN: BTJD 1406.292)" },
];
/** Quality bit set on cadences in an engineering interval (a bit no pipeline uses). */
export const ENGINEERING_FLAG = 2 ** 31;

/** The engineering interval a cadence of `sector` falls in (intervals are per sector: sectors abut). */
export const engineeringAt = (t: number, sector: number) => ENGINEERING.find((e) => e.sector === sector && t >= e.from && t < e.to);

/** A copy of `quality` with every cadence in an engineering interval flagged. */
export function maskEngineering(time: ArrayLike<number>, quality: ArrayLike<number>, sector: number): Float64Array {
  const q = Float64Array.from(quality);
  if (!ENGINEERING.some((e) => e.sector === sector)) return q;
  for (let i = 0; i < q.length; i++) if (engineeringAt(time[i], sector)) q[i] = q[i] || ENGINEERING_FLAG;
  return q;
}
