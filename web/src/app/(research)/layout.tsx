import App from "@/components/App";

// Map + live mission stay mounted here; child routes (e.g. /agents) render as full pages on top,
// so switching pages never drops a running mission or its live subscription.
export default function ResearchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <App>{children}</App>;
}
