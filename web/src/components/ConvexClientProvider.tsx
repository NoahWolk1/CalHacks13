"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

/** A local backend URL (127.0.0.1) is rewritten to the page's host so a phone on the same LAN can watch. */
function resolveUrl(raw: string | undefined) {
  if (!raw || typeof window === "undefined") return raw;
  const u = new URL(raw);
  const host = window.location.hostname;
  if ((u.hostname === "127.0.0.1" || u.hostname === "localhost") && host !== "localhost" && host !== "127.0.0.1") u.hostname = host;
  return u.toString().replace(/\/$/, "");
}

const url = resolveUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
const client = url ? new ConvexReactClient(url) : null;

/** Wraps children in Convex only when NEXT_PUBLIC_CONVEX_URL is set (otherwise the app runs on SSE). */
export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return client ? <ConvexProvider client={client}>{children}</ConvexProvider> : <>{children}</>;
}
