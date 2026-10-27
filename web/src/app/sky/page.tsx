import { redirect } from "next/navigation";

// The space page moved from /sky to /space; old links (?survey=, ?mission=) keep working.
export default async function SkyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v ?? []].flat()) q.append(k, x);
  redirect(q.size ? `/space?${q}` : "/space");
}
