"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useStore } from "@/lib/client/store";
import { convexEnabled, loadCatalog } from "@/lib/client/runClient";
import CommandPanel, { useRegionLabel } from "./CommandPanel";
import MobileSheet, { SHEET_PEEK } from "./MobileSheet";
import { useIsDesktop } from "@/lib/client/useMedia";
import RightPanel from "./RightPanel";
import TopBar from "./TopBar";
import StatusBar from "./StatusBar";
import AgentHub from "./AgentHub";
import ConvexClientProvider from "./ConvexClientProvider";
import ConvexRunSync from "./ConvexRunSync";
import MissionHistory from "./MissionHistory";
import { DemoSpotChips } from "./PlaceSearch";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function App() {
  const region = useStore((s) => s.region);
  const error = useStore((s) => s.error);
  const desktop = useIsDesktop();
  useEffect(() => { loadCatalog(); }, []);
  useRegionLabel();
  return (
    <ConvexClientProvider>
    <main className="relative h-screen w-screen overflow-hidden bg-[#060a11] max-lg:h-[100dvh]">
      <MapView />
      <TopBar />
      {desktop ? <><CommandPanel /><RightPanel /><StatusBar /></> : <MobileSheet />}
      {!region && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center max-lg:w-[calc(100%-32px)] max-lg:rounded-3xl max-lg:bg-[radial-gradient(closest-side,rgba(6,10,17,0.85),transparent)] max-lg:py-10">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-teal-300/80">Awaiting area of operations</div>
          <div className="text-glow mt-2 text-2xl font-semibold text-white max-lg:text-xl">{desktop ? "Drag a box over any neighborhood" : "Pick any neighborhood"}</div>
          <div className="mt-1 text-sm text-slate-400">{desktop ? "…then deploy the swarm." : "Tap a demo spot, or draw an area."}</div>
          {!desktop && <DemoSpotChips className="pointer-events-auto mx-auto mt-4 max-w-[320px] justify-center gap-1.5" />}
        </div>
      )}
      {error && (
        <div className="glass absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-xl px-4 py-2 text-xs text-rose-300 max-lg:w-max max-lg:max-w-[calc(100%-32px)]"
          style={desktop ? undefined : { bottom: `calc(${SHEET_PEEK + 16}px + var(--safe-bottom))` }}>{error}</div>
      )}
      <AgentHub />
      {convexEnabled && <><ConvexRunSync /><MissionHistory /></>}
    </main>
    </ConvexClientProvider>
  );
}
