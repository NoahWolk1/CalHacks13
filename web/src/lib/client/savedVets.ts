// Saved vetting reports in the browser: one request per star (GET /api/sky/vet?tic=), shared by every
// find card and vet panel on the page, and updated when a run in this tab saves a new report.
import { useEffect, useState } from "react";
import { sameFind, type SavedVet, type VetInput } from "@/lib/sky/vetShared";

const byTic = new Map<string, Promise<SavedVet[]>>();
const listeners = new Set<() => void>();

function load(tic: string): Promise<SavedVet[]> {
  let p = byTic.get(tic);
  if (!p) {
    p = fetch(`/api/sky/vet?tic=${encodeURIComponent(tic)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j: { vets?: SavedVet[] }) => j.vets ?? [])
      .catch(() => { byTic.delete(tic); return []; });
    byTic.set(tic, p);
  }
  return p;
}

/** The saved report for this find, if any (null until loaded or when there is none). */
export async function savedVetFor(input: VetInput): Promise<SavedVet | null> {
  return (await load(input.tic)).filter((v) => sameFind(v.report.input, input)).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
}

/** A run in this tab saved a report: replace the cached one for that signal. */
export function rememberVet(saved: SavedVet) {
  const tic = saved.report.input.tic;
  byTic.set(tic, load(tic).then((all) => [...all.filter((v) => v.id !== saved.id && !sameFind(v.report.input, saved.report.input)), saved]));
  listeners.forEach((f) => f());
}

export function useSavedVet(input: VetInput | null): SavedVet | null {
  const [saved, setSaved] = useState<SavedVet | null>(null);
  const key = input ? JSON.stringify([input.tic, input.kind, input.period, input.times]) : "";
  useEffect(() => {
    if (!input) return;
    let live = true;
    const refresh = () => void savedVetFor(input).then((v) => { if (live) setSaved(v); });
    refresh();
    listeners.add(refresh);
    return () => { live = false; listeners.delete(refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return saved;
}
