import type { Metadata } from "next";
import SkyApp from "@/components/sky/SkyApp";

export const metadata: Metadata = {
  title: "Coordinate Space: AI agents that research any region of space",
  description: "Select a patch of sky and space agents query SIMBAD, the NASA Exoplanet Archive, JPL Horizons and MAST live, and search real TESS light curves for transits and variability.",
};

export default function SpacePage() {
  return <SkyApp />;
}
