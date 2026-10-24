"use client";
import { useSyncExternalStore } from "react";

const LG = "(min-width: 1024px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(LG);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True at Tailwind `lg` (≥1024px) and up. Server snapshot assumes desktop; CSS `max-lg:hidden` hides desktop chrome pre-hydration. */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(LG).matches, () => true);
}
