"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useStore } from "@/lib/client/store";
import { loadCatalog } from "@/lib/client/runClient";
import CommandPanel, { useRegionLabel } from "./CommandPanel";
import MobileSheet, { SHEET_PEEK } from "./MobileSheet";
import { useIsDesktop } from "@/lib/client/useMedia";
import { useLayoutSync } from "@/lib/client/layout";
import RightPanel from "./RightPanel";
import { LeftRail, RightRail } from "./Rail";
import TopBar from "./TopBar";
import StatusBar from "./StatusBar";
import AgentHub from "./AgentHub";
import ConvexClientProvider from "./ConvexClientProvider";
import ConvexRunSync from "./ConvexRunSync";
import { ConvexMissionHistory } from "./MissionHistory";
import { DemoSpotChips } from "./PlaceSearch";

const MapView = dynamic(() => import("./MapView"), { ssr: false });
const SpacetimeLive = dynamic(() => import("./SpacetimeLive"), { ssr: false });

export default function App() {
  const region = useStore((s) => s.region);
  const error = useStore((s) => s.error);
  const desktop = useIsDesktop();
  const live = useStore((s) => s.live);
  const stHost = process.env.NEXT_PUBLIC_SPACETIME_HOST || live?.spacetime?.host;
  const stDb = process.env.NEXT_PUBLIC_SPACETIME_DB || live?.spacetime?.db;
  useEffect(() => { loadCatalog(); }, []);
  useRegionLabel();
  useLayoutSync();
  return (
    <ConvexClientProvider>
    <main className="relative h-screen w-screen overflow-hidden bg-bg max-lg:h-[100dvh]">
      <MapView />
      <TopBar />
      {desktop ? <><LeftRail /><RightRail /><CommandPanel /><RightPanel /></> : <MobileSheet />}
      {/* Visible map strip between the panels (full screen on mobile): overlays center here. */}
      <div className="gs-frame gs-follow">
      {desktop && <StatusBar />}
      {!region && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-max max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 text-center max-lg:w-[calc(100%-32px)] max-lg:rounded-xl max-lg:bg-[radial-gradient(closest-side,rgba(14,14,13,0.9),transparent)] max-lg:py-10">
          <div className="text-[22px] font-semibold tracking-[-0.015em] text-fg1 [text-shadow:0_1px_12px_var(--bg)] max-lg:text-xl">{desktop ? "Drag a box over any neighborhood" : "Pick any neighborhood"}</div>
          <div className="mt-1 text-[13.5px] text-fg2 [text-shadow:0_1px_8px_var(--bg)]">{desktop ? "Then deploy the swarm to research it." : "Tap a demo area, or draw your own."}</div>
          {!desktop && <DemoSpotChips className="pointer-events-auto mx-auto mt-4 max-w-[320px] justify-center gap-1.5" />}
        </div>
      )}
      {error && (
        <div className="glass pointer-events-auto absolute bottom-16 left-1/2 z-30 flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-md px-3 py-2 text-[12.5px] text-fg1"
          style={desktop ? undefined : { bottom: `calc(${SHEET_PEEK + 16}px + var(--safe-bottom))` }}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-risk" />{error}</div>
      )}
      </div>
      <AgentHub />
      {/* Live shared mission state: SpacetimeDB (primary) or Convex (fallback), as /api/agents reports. */}
      {live?.backend === "spacetime" && stHost && stDb && <SpacetimeLive host={stHost} db={stDb} />}
      {live?.backend === "convex" && process.env.NEXT_PUBLIC_CONVEX_URL && <><ConvexRunSync /><ConvexMissionHistory /></>}
    </main>
    </ConvexClientProvider>
  );
}
