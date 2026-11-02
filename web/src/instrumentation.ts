// Server startup (Next.js): the sky watchdog, on long-running servers that ask for it (SKY_WATCHDOG=1).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SKY_WATCHDOG !== "1") return;
  const { startSkyWatchdog } = await import("./lib/server/skyWatchdog");
  startSkyWatchdog(process.env.SKY_INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`);
}
