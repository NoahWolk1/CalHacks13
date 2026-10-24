// White silhouettes (tinted per agent by deck.gl's mask mode). Top-down view, nose pointing up.
import type { VehicleKind } from "@/lib/types";

const svg = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">${body}</svg>`)}`;

const DRONE = svg(`
  <g fill="#fff">
    <rect x="29" y="14" width="6" height="36" rx="3" transform="rotate(45 32 32)"/>
    <rect x="29" y="14" width="6" height="36" rx="3" transform="rotate(-45 32 32)"/>
    <circle cx="32" cy="32" r="8"/>
    ${[[16, 16], [48, 16], [16, 48], [48, 48]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#fff" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3"/>`).join("")}
    <path d="M32 21 l3 5 h-6z"/>
  </g>`);

const CAR = svg(`
  <g fill="#fff">
    <rect x="20" y="8" width="24" height="48" rx="8"/>
    <rect x="23" y="18" width="18" height="9" rx="2" fill="#000" fill-opacity="0.55"/>
    <rect x="23" y="40" width="18" height="7" rx="2" fill="#000" fill-opacity="0.55"/>
    <rect x="24" y="5" width="5" height="4" rx="1"/><rect x="35" y="5" width="5" height="4" rx="1"/>
  </g>`);

const ROVER = svg(`
  <g fill="#fff">
    ${[[14, 16], [50, 16], [14, 32], [50, 32], [14, 48], [50, 48]].map(([x, y]) => `<rect x="${x - 4}" y="${y - 6}" width="8" height="12" rx="3"/>`).join("")}
    <rect x="18" y="12" width="28" height="40" rx="6"/>
    <circle cx="32" cy="22" r="5" fill="#000" fill-opacity="0.55"/>
    <rect x="30" y="4" width="4" height="10" rx="2"/>
  </g>`);

const SATELLITE = svg(`
  <g fill="#fff">
    <rect x="25" y="25" width="14" height="14" rx="2" transform="rotate(45 32 32)"/>
    <rect x="2" y="27" width="20" height="10" rx="1"/>
    <rect x="42" y="27" width="20" height="10" rx="1"/>
    <line x1="22" y1="32" x2="26" y2="32" stroke="#fff" stroke-width="3"/><line x1="38" y1="32" x2="42" y2="32" stroke="#fff" stroke-width="3"/>
    <path d="M7 27v10M12 27v10M17 27v10M47 27v10M52 27v10M57 27v10" stroke="#000" stroke-opacity="0.4" stroke-width="1.5"/>
    <circle cx="32" cy="18" r="3"/>
  </g>`);

const BOAT = svg(`<path fill="#fff" d="M32 4 L46 22 V54 Q32 62 18 54 V22 Z"/>`);

export const VEHICLE_ICON: Record<VehicleKind, string> = { drone: DRONE, car: CAR, rover: ROVER, satellite: SATELLITE, boat: BOAT };

/** Altitude (meters) each vehicle kind flies at. Rendered in 3D with a ground tether. */
export const ALTITUDE: Record<VehicleKind, number> = { drone: 140, car: 4, rover: 4, satellite: 520, boat: 2 };

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
