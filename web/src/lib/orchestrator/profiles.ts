import type { OrchestratorProfile } from "@/lib/types";

// README §2: one orchestrator per user type. They share the same worker pool.
export const PROFILES: OrchestratorProfile[] = [
  {
    id: "site-risk",
    name: "Site Risk Analyst",
    persona: "Planners, developers, homebuyers and insurers vetting where to build or buy",
    tagline: "Is it safe and smart to build here?",
    icon: "ShieldAlert",
    defaultAgents: ["fema-flood", "terrain-elevation", "sf-permits", "usgs-seismic", "sf-311", "live-conditions", "local-news"],
    domainPrompt:
      "You advise on development and property risk. You care most about physical hazards (flood zones, low elevation/sea-level rise, seismic exposure) " +
      "colliding with human investment (new construction, added units/stories). A permitted building inside a flood zone or on ground ≤5 m is a headline risk. " +
      "311 sewer/flooding reports corroborate hazard maps. Weigh official sources (FEMA, USGS, DBI) above news and crowd reports.",
    sampleQuestions: ["Is it risky to build here?", "Which new developments are most exposed to flooding?", "What hazards should a homebuyer know about?"],
  },
  {
    id: "storefront",
    name: "Storefront Scout",
    persona: "Small business owners scouting a location",
    tagline: "Where should I open my shop?",
    icon: "Store",
    defaultAgents: ["osm-places", "census-demographics", "sf-311", "sf-permits", "local-news"],
    domainPrompt:
      "You advise small business owners choosing a storefront. You care about competition density (same-category businesses), complementary anchors " +
      "(transit, schools, offices, parks), neighborhood income and renter share, street conditions from 311, and incoming residents from new housing permits. " +
      "New multi-unit construction nearby means future customers. Heavy 311 encampment/cleanliness complaints hurt foot traffic.",
    sampleQuestions: ["Is this a good spot for a coffee shop?", "How saturated is food & drink here?", "Who lives here and what do they spend on?"],
  },
  {
    id: "disaster",
    name: "Disaster Response",
    persona: "Relief coordinators and insurance adjusters",
    tagline: "What's happening on the ground right now?",
    icon: "Siren",
    defaultAgents: ["live-conditions", "local-news", "sf-311", "fema-flood", "usgs-seismic", "osm-places"],
    domainPrompt:
      "You support emergency responders. Prioritize live alerts, recent news, and fresh 311 reports. Map critical facilities (hospitals, schools, fire stations) " +
      "against hazard zones. Be explicit about recency: anything older than a week is background, not situation.",
    sampleQuestions: ["What's the current situation here?", "Which critical facilities sit in hazard zones?", "Where are people reporting problems?"],
  },
];

export const getProfile = (id: string) => PROFILES.find((p) => p.id === id) ?? PROFILES[0];
