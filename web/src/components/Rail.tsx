"use client";
// VS Code-style activity rails: when a side panel is collapsed, a slim strip stays on that edge
// with a reopen button and quick links, so the panel is never "lost".
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { useLayout, RAIL } from "@/lib/client/layout";
import { useStore } from "@/lib/client/store";
import { useRightTabs, type RightTab } from "./RightPanel";

function RailButton({ onClick, label, children, on }: { onClick: () => void; label: string; children: React.ReactNode; on?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`flex w-full items-center justify-center py-2.5 text-[12.5px] transition-colors hover:bg-raised hover:text-fg1 ${on ? "text-fg1" : "text-fg3"}`}>
      {children}
    </button>
  );
}

const vertical = { writingMode: "vertical-rl" } as const;

export function LeftRail() {
  const open = useLayout((s) => s.leftOpen);
  const running = useStore((s) => s.running);
  const reopen = () => useLayout.getState().set({ leftOpen: true });
  return (
    <AnimatePresence>
      {!open && (
        <motion.nav key="lrail" aria-label="Mission panel (collapsed)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
          className="dock pointer-events-auto absolute bottom-0 left-0 top-12 z-10 flex flex-col items-stretch border-r border-line pt-1 max-lg:hidden" style={{ width: RAIL }}>
          <RailButton onClick={reopen} label="Show mission panel (⌘B)"><PanelLeftOpen size={15} strokeWidth={1.5} /></RailButton>
          <RailButton onClick={reopen} label="Mission">
            <span style={vertical} className="flex items-center gap-2">
              Mission{running && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </span>
          </RailButton>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

export function RightRail() {
  const open = useLayout((s) => s.rightOpen);
  const rightTab = useStore((s) => s.rightTab);
  const tabs = useRightTabs();
  const show = (t?: RightTab) => { if (t) useStore.getState().set({ rightTab: t }); useLayout.getState().set({ rightOpen: true }); };
  return (
    <AnimatePresence>
      {!open && (
        <motion.nav key="rrail" aria-label="Results panel (collapsed)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
          className="dock pointer-events-auto absolute bottom-0 right-0 top-12 z-10 flex flex-col items-stretch border-l border-line pt-1 max-lg:hidden" style={{ width: RAIL }}>
          <RailButton onClick={() => show()} label="Show results panel (⌥⌘B)"><PanelRightOpen size={15} strokeWidth={1.5} /></RailButton>
          {tabs.map((t) => (
            <RailButton key={t.id} onClick={() => show(t.id)} label={`${t.label}${t.n ? ` (${t.n})` : ""}`} on={rightTab === t.id}>
              <span style={vertical} className="flex items-center gap-1.5 whitespace-nowrap">
                {t.label}{t.n ? <span className="num text-[11px] text-fg3">{t.n}</span> : null}
              </span>
            </RailButton>
          ))}
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
