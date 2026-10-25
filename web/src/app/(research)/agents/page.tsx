import type { Metadata } from "next";
import AgentsPage from "@/components/AgentsPage";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Agents · ${APP_NAME}` };

export default function Page() {
  return <AgentsPage />;
}
