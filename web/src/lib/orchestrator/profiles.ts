import type { OrchestratorProfile } from "@/lib/types";

// README §2: one orchestrator per user type. They share the same worker pool.
export const PROFILES: OrchestratorProfile[] = [
  {
    id: "site-risk",
    name: "Site Risk Analyst",
    persona: "Planners, developers, homebuyers and insurers vetting where to build or buy",
    tagline: "Is it safe and smart to build here?",
    icon: "ShieldAlert",
    // Insights team: every ground/water hazard layer, plus what's being built and what the land allows, so permits and schools can be joined against the hazard polygons.
    defaultAgents: ["fema-flood", "sf-stormwater", "terrain-elevation", "cgs-ground-hazards", "sea-level-rise", "usgs-seismic", "calfire-fhsz", "sf-permits", "sf-zoning", "sf-property", "sf-311", "ca-schools"],
    domainPrompt:
      "You advise on development and property risk. You care most about physical hazards (flood zones, low elevation/sea-level rise, seismic exposure) " +
      "colliding with human investment (new construction, added units/stories). A permitted building inside a flood zone or on ground ≤5 m is a headline risk. " +
      "311 sewer/flooding reports corroborate hazard maps. CGS liquefaction zones and Bay sea-level-rise scenarios flag Bay fill; schools in those zones are sensitive sites. " +
      "Height/zoning bounds what can be built; assessed values lag the market (recent sales are the price proxy). Weigh official sources (FEMA, USGS, CGS, DBI) above news and crowd reports.",
    sampleQuestions: ["Is it risky to build here?", "Which new developments are most exposed to flooding?", "What hazards should a homebuyer know about?"],
  },
  {
    id: "storefront",
    name: "Storefront Scout",
    persona: "Small business owners scouting a location",
    tagline: "Where should I open my shop?",
    icon: "Store",
    // Insights team: demand (places, churn, transit, visitors) vs. friction (crime, street work, 311). Sponsor and census agents
    // sit out until their keys are set (lib/sponsors/keys.ts), so the keyless team is 9.
    defaultAgents: ["osm-places", "sf-business", "sf-transit", "sf-crime", "short-term-rentals", "wiki-landmarks", "sf-street-work", "sf-311", "sf-permits", "census-demographics", "apify-reviews", "brightdata-rent", "brightdata-pulse"],
    domainPrompt:
      "You advise small business owners choosing a storefront. You care about competition density (same-category businesses), complementary anchors " +
      "(transit, schools, offices, parks), neighborhood income and renter share, street conditions from 311, and incoming residents from new housing permits. " +
      "New multi-unit construction nearby means future customers. Heavy 311 encampment/cleanliness complaints hurt foot traffic. " +
      "Business openings vs. closures are the strongest local demand signal; pair them with transit access, crime hotspots within a block, and active street digs out front.",
    sampleQuestions: ["Is this a good spot for a coffee shop?", "How saturated is food & drink here?", "Who lives here and what do they spend on?"],
  },
  {
    id: "disaster",
    name: "Disaster Response",
    persona: "Relief coordinators and insurance adjusters",
    tagline: "What's happening on the ground right now?",
    icon: "Siren",
    // Insights team: live signals first (alerts, dispatch, forecast, tides, news, 311), then the hazard zones and sensitive sites they land on.
    defaultAgents: ["live-conditions", "nasa-eonet", "sentinel-imagery", "usgs-seismic", "sf-fire-ems", "weather-outlook", "sea-level-rise", "cgs-ground-hazards", "fema-disasters", "ca-schools", "sf-311", "local-news"],
    domainPrompt:
      "You support emergency responders. Prioritize live alerts, recent news, and fresh 311 reports. Map critical facilities (hospitals, schools, fire stations) " +
      "against hazard zones. Be explicit about recency: anything older than a week is background, not situation. " +
      "NASA EONET events show regional fire/storm/flood activity; the latest Sentinel-2/Landsat scene date and the next predicted imaging pass tell you how fresh the overhead picture is.",
    sampleQuestions: ["What's the current situation here?", "Which critical facilities sit in hazard zones?", "Where are people reporting problems?"],
  },
  {
    id: "general",
    name: "Area Researcher",
    persona: "Anyone curious about a place: people, settlements, wildlife, history and environment",
    tagline: "What's here, and what is this place like?",
    icon: "Compass",
    // Insights team: global, keyless context agents (US-only ones like census drop out elsewhere by coverage).
    defaultAgents: ["osm-settlements", "osm-places", "wiki-landmarks", "census-demographics", "weather-outlook", "terrain-elevation", "sentinel-imagery", "nasa-eonet", "local-news"],
    domainPrompt:
      "You research places for curious, general-purpose questions that no specialist owns: who and what is here (settlements, population, landmarks, wildlife, land cover), its history, environment and current context. " +
      "Answer exactly what was asked with concrete counts and names; don't steer toward hazards, property or business unless the question does. " +
      "Say plainly where open data is thin (e.g. OpenStreetMap coverage in rural areas) rather than padding the answer with unrelated findings. Prefer authoritative and primary sources over news.",
    sampleQuestions: ["How many villages are located here?", "What is this place known for?", "What animals live here?"],
  },
];

export const getProfile = (id?: string) => PROFILES.find((p) => p.id === id) ?? PROFILES[0];
