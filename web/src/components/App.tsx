"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useStore } from "@/lib/client/store";
import { convexEnabled, loadCatalog } from "@/lib/client/runClient";
import CommandPanel from "./CommandPanel";
import RightPanel from "./RightPanel";
import TopBar from "./TopBar";
import StatusBar from "./StatusBar";
import AgentHub from "./AgentHub";
import ConvexClientProvider from "./ConvexClientProvider";
import ConvexRunSync from "./ConvexRunSync";
import MissionHistory from "./MissionHistory";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function App() {
  const region = useStore((s) => s.region);
  const error = useStore((s) => s.error);
  useEffect(() => { loadCatalog(); }, []);
  return (
    <ConvexClientProvider>
    <main className="relative h-screen w-screen overflow-hidden bg-[#060a11]">
      <MapView />
      <TopBar />
      <CommandPanel />
      <RightPanel />
      <StatusBar />
      {!region && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-teal-300/80">Awaiting area of operations</div>
          <div className="text-glow mt-2 text-2xl font-semibold text-white">Drag a box over any neighborhood</div>
          <div className="mt-1 text-sm text-slate-400">…then deploy the swarm.</div>
        </div>
      )}
      {error && <div className="glass absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-xl px-4 py-2 text-xs text-rose-300">{error}</div>}
      <AgentHub />
      {convexEnabled && <><ConvexRunSync /><MissionHistory /></>}
    </main>
    </ConvexClientProvider>
  );
}
