"use client";
// Uploads a photo to /api/locate. The image is redrawn on a canvas first: scaled to Claude's 1568 px
// sweet spot (small enough for the request limit) and re-encoded as JPEG, which also drops EXIF metadata.
import type { LocateArea, LocateResult } from "@/lib/locate";

const MAX_PX = 1568;

async function toJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** With an area, the photo is searched for inside it (street level, from the area's map names). */
export async function locatePhoto(file: File, area?: LocateArea, signal?: AbortSignal): Promise<LocateResult & { preview: string }> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  let preview: string;
  try { preview = await toJpeg(file); } catch { throw new Error("Couldn't read that image."); }
  const r = await fetch("/api/locate", {
    method: "POST", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: preview, mediaType: "image/jpeg", ...(area ? { area } : {}) }),
  });
  const j = (await r.json().catch(() => ({}))) as Partial<LocateResult> & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Photo search failed (${r.status})`);
  return { ...j, summary: j.summary ?? "", guesses: j.guesses ?? [], model: j.model ?? "", preview };
}
