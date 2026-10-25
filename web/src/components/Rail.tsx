"use client";
// VS Code-style activity rail: when the research panel is collapsed, a slim strip stays on its edge
// with a reopen button, so the panel is never "lost".
import { AnimatePresence, motion } from "framer-motion";
import { PanelRightOpen } from "lucide-react";
import { useLayout, RAIL } from "@/lib/client/layout";
import { useStore } from "@/lib/client/store";

function RailButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`flex w-full items-center justify-center py-2.5 text-[12.5px] transition-colors text-fg3 hover:bg-raised hover:text-fg1`}>
      {children}
    </button>
  );
}

const vertical = { writingMode: "vertical-rl" } as const;

export function RightRail() {
  const open = useLayout((s) => s.rightOpen);
  const running = useStore((s) => s.running);
  const reopen = () => useLayout.getState().set({ rightOpen: true });
  return (
    <AnimatePresence>
      {!open && (
        <motion.nav key="rrail" aria-label="Research panel (collapsed)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
          className="dock pointer-events-auto absolute bottom-0 right-0 top-12 z-10 flex flex-col items-stretch border-l border-line pt-1 max-lg:hidden" style={{ width: RAIL }}>
          <RailButton onClick={reopen} label="Show research panel (⌘B)"><PanelRightOpen size={15} strokeWidth={1.5} /></RailButton>
          <RailButton onClick={reopen} label="Research">
            <span style={vertical} className="flex items-center gap-2">
              Research{running && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </span>
          </RailButton>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
