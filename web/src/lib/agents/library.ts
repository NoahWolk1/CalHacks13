// The saved agent library: generated agents the user kept, persisted as a JSON file so they
// survive server restarts. Configs only; the shared runtime (./runtime.ts) runs them.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AgentConfig } from "@/lib/types";

export const VEHICLES = ["drone", "car", "rover", "satellite", "boat"] as const;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const LIMITS = { name: 40, description: 300 };

export const SavedAgentSchema = z.object({
  id: z.string().regex(/^custom-[a-z0-9-]+$/),
  name: z.string().min(1).max(LIMITS.name),
  description: z.string().min(1).max(LIMITS.description),
  vehicle: z.enum(VEHICLES),
  color: z.string().regex(HEX_COLOR),
  // Only primitives the runtime implements (geocode/llm are always on; listed for the Hub card).
  tools: z.array(z.enum(["http_get", "scrape", "search", "llm", "geocode", "osm"])),
  dataSources: z.array(z.string()),
  coverage: z.string(),
  builtin: z.literal(false),
  prompt: z.string().min(1).max(4000),
  createdBy: z.string().optional(),
});

// Vercel's filesystem is read-only except /tmp (per-instance, ephemeral), same as the http cache.
export const DEFAULT_LIBRARY_PATH = process.env.AGENT_LIBRARY_PATH
  ?? (process.env.VERCEL ? join("/tmp", "geoswarm", "agents.json") : join(process.cwd(), "data", "agents.json"));

export function createLibrary(path = DEFAULT_LIBRARY_PATH) {
  const read = (): AgentConfig[] => {
    if (!existsSync(path)) return [];
    try {
      const rows = JSON.parse(readFileSync(path, "utf8"));
      return Array.isArray(rows) ? rows.flatMap((r) => { const p = SavedAgentSchema.safeParse(r); return p.success ? [p.data] : []; }) : [];
    } catch {
      return [];
    }
  };
  const write = (agents: AgentConfig[]) => {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(agents, null, 2));
    renameSync(tmp, path);
  };

  return {
    list: read,
    save(agent: AgentConfig) {
      const { temporary: _t, ...cfg } = agent;
      write([...read().filter((a) => a.id !== agent.id), cfg]);
    },
    remove(id: string) {
      const all = read();
      const rest = all.filter((a) => a.id !== id);
      if (rest.length === all.length) return false;
      write(rest);
      return true;
    },
  };
}

export type Library = ReturnType<typeof createLibrary>;
