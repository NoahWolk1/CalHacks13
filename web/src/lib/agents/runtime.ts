// The shared runtime for generated agents (README §3c: "an agent is just a saved config").
// One bounded Claude tool-use loop: the agent's prompt as its brief, only the tools its config
// allows, and emit_findings to report results in the shared finding schema.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AgentConfig, Worker, WorkerContext } from "@/lib/types";
import { llm, WORKER_MODEL, FALLBACK } from "@/lib/llm";
import { getText } from "@/lib/http";
import { assertPublicUrl } from "./urlGuard";
import { placeFinding, type Geocode } from "./placement";
import { geocode as nominatim } from "./geocode";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export const RUNTIME_LIMITS = { maxTurns: 6, timeMs: 45_000, maxFindings: 15, httpBodyChars: 12_000 };

export interface RuntimeDeps {
  client: () => Anthropic | null;
  geocode: Geocode;
  fetchText: (url: string, opts: { signal?: AbortSignal; timeoutMs?: number }) => Promise<string>;
}

const defaultDeps: RuntimeDeps = { client: llm, geocode: nominatim, fetchText: getText };

const nullable = (type: string) => ({ type: [type, "null"] });
const EMIT_FINDINGS = {
  name: "emit_findings",
  description:
    "Report findings about the selected area. Each finding is one concrete, mappable fact from a source you actually retrieved. " +
    "Give lng/lat if the source has coordinates; otherwise a full street address (with city); otherwise null for all three (area-level fact).",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["findings"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "source_url", "source_type", "observed_at", "confidence", "severity", "lng", "lat", "address"],
          properties: {
            claim: { type: "string", description: "One sentence with concrete names, numbers, dates." },
            source_url: { type: "string" },
            source_type: { type: "string", description: "snake_case kind of source, e.g. health_inspection, news_article, listing" },
            observed_at: { ...nullable("string"), description: "YYYY-MM-DD the fact was recorded, if known" },
            confidence: { type: "number", description: "0..1 how sure you are the claim is accurate" },
            severity: { ...nullable("number"), description: "0..1 how notable this is for the user's question" },
            lng: nullable("number"),
            lat: nullable("number"),
            address: nullable("string"),
          },
        },
      },
    },
  },
};

const HTTP_GET = {
  name: "http_get",
  description: "GET a public URL (JSON API or text) and return the body, truncated. Use for open-data APIs such as Socrata endpoints (…/resource/<id>.json?$where=…&$limit=…).",
  strict: true,
  input_schema: { type: "object" as const, additionalProperties: false, required: ["url"], properties: { url: { type: "string" } } },
};

const RawFindingSchema = z.object({
  claim: z.string().min(1),
  source_url: z.string(),
  source_type: z.string(),
  observed_at: z.string().nullish(),
  confidence: z.number(),
  severity: z.number().nullish(),
  lng: z.number().nullish(),
  lat: z.number().nullish(),
  address: z.string().nullish(),
});
const EmitInput = z.object({ findings: z.array(z.unknown()) });

function toolsFor(cfg: AgentConfig): Anthropic.Beta.Messages.BetaToolUnion[] {
  const tools: Anthropic.Beta.Messages.BetaToolUnion[] = [];
  if (cfg.tools.includes("search")) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 4 });
  if (cfg.tools.includes("scrape")) tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 4, max_content_tokens: 20_000 });
  if (cfg.tools.includes("http_get")) tools.push(HTTP_GET);
  tools.push(EMIT_FINDINGS);
  return tools;
}

const SYSTEM = (cfg: AgentConfig) =>
  `You are "${cfg.name}", a worker agent in a geospatial research system. ${cfg.description}\n\n` +
  `Your brief:\n${cfg.prompt}\n\n` +
  `Find real, sourced facts about the selected map area and report them with emit_findings.\n` +
  `- Only report facts from sources you actually retrieved this session. Never invent places, numbers or URLs.\n` +
  `- Prefer structured public data (open-data portals and APIs) over prose pages; filter queries to the area's bounding box when the API allows it.\n` +
  `- Up to ${RUNTIME_LIMITS.maxFindings} findings, most notable first. You have only a few turns, so be direct: one or two searches, then fetch, then report.\n` +
  `- After reporting, stop with one sentence summarizing what you found.`;

function brief(ctx: WorkerContext) {
  const { region, question, focus } = ctx.task;
  return [
    `Area: ${region.label ?? "unnamed area"}`,
    `Bounding box [minLng, minLat, maxLng, maxLat]: [${region.bbox.map((n) => n.toFixed(5)).join(", ")}]`,
    `Center [lng, lat]: [${region.center.map((n) => n.toFixed(5)).join(", ")}]`,
    question ? `User's question: ${question}` : "",
    focus ? `Orchestrator's focus for you: ${focus}` : "",
  ].filter(Boolean).join("\n");
}

const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildGeneratedWorker(cfg: AgentConfig, deps: RuntimeDeps = defaultDeps): Worker {
  return {
    ...cfg,
    async run(ctx) {
      const client = deps.client();
      if (!client) throw new Error("Generated agents need ANTHROPIC_API_KEY");
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(RUNTIME_LIMITS.timeMs)]);
      const tools = toolsFor(cfg);
      const messages: MessageParam[] = [{ role: "user", content: brief(ctx) }];
      let emitted = 0;

      const emitFindings = async (input: unknown): Promise<string> => {
        const rows = EmitInput.safeParse(input);
        if (!rows.success) throw new Error("findings must be an array");
        let kept = 0, dropped = 0;
        for (const row of rows.data.findings) {
          if (emitted >= RUNTIME_LIMITS.maxFindings) break;
          const r = RawFindingSchema.safeParse(row);
          if (!r.success) { dropped++; continue; }
          const { observed_at, severity, lng, lat, address, ...rest } = r.data;
          const f = await placeFinding(ctx.task.region, {
            ...rest, observed_at: observed_at ?? undefined, severity: severity ?? undefined,
            lng: lng ?? undefined, lat: lat ?? undefined, address: address ?? undefined,
          }, deps.geocode);
          if (!f) { dropped++; continue; }
          ctx.emit(f);
          emitted++; kept++;
        }
        ctx.log(`Pinned ${kept} finding${kept === 1 ? "" : "s"}${dropped ? ` (${dropped} outside the area or malformed)` : ""}`);
        return emitted >= RUNTIME_LIMITS.maxFindings
          ? `Recorded ${kept}. Finding limit reached: stop now.`
          : `Recorded ${kept}${dropped ? `, dropped ${dropped} (outside the area or malformed)` : ""}.`;
      };

      const runTool = async (name: string, input: unknown): Promise<string> => {
        if (name === "emit_findings") return emitFindings(input);
        if (name === "http_get" && cfg.tools.includes("http_get")) {
          const url = assertPublicUrl(String((input as { url?: unknown })?.url ?? "")).toString();
          ctx.log(`GET ${short(url)}`);
          const body = await deps.fetchText(url, { signal, timeoutMs: 12_000 });
          return body.length > RUNTIME_LIMITS.httpBodyChars ? `${body.slice(0, RUNTIME_LIMITS.httpBodyChars)}\n…[truncated ${body.length - RUNTIME_LIMITS.httpBodyChars} chars]` : body;
        }
        throw new Error(`Unknown tool: ${name}`);
      };

      try {
        for (let turn = 0; turn < RUNTIME_LIMITS.maxTurns; turn++) {
          const res = await client.beta.messages.create({
            model: WORKER_MODEL,
            max_tokens: 8000,
            output_config: { effort: "low" },
            ...FALLBACK,
            system: SYSTEM(cfg),
            tools,
            messages,
          }, { signal });

          for (const b of res.content) {
            if (b.type !== "server_tool_use") continue;
            const input = b.input as { query?: string; url?: string };
            if (b.name === "web_search") ctx.log(`Searching: ${short(input.query ?? "")}`);
            else if (b.name === "web_fetch") ctx.log(`Reading ${short(input.url ?? "")}`);
          }
          messages.push({ role: "assistant", content: res.content });
          if (res.stop_reason === "pause_turn") continue;
          if (res.stop_reason !== "tool_use") break;

          const results: ToolResult[] = [];
          for (const b of res.content) {
            if (b.type !== "tool_use") continue;
            try {
              results.push({ type: "tool_result", tool_use_id: b.id, content: await runTool(b.name, b.input) });
            } catch (e) {
              results.push({ type: "tool_result", tool_use_id: b.id, content: (e as Error).message, is_error: true });
            }
          }
          messages.push({ role: "user", content: results });
          if (emitted >= RUNTIME_LIMITS.maxFindings) break;
        }
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        if (!signal.aborted) throw e;
        ctx.log(`Time budget reached after ${RUNTIME_LIMITS.timeMs / 1000}s`);
      }
    },
  };
}
