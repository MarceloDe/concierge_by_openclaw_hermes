import type { Metadata } from "next";
import manifest from "./generated/watchdog-manifest.json";
import { WatchdogDashboard } from "./watchdog-dashboard";

export const metadata: Metadata = {
  title: "Founder Watchdog · Brainstyworkers",
  description: "A source-linked control-plane view of the Brainstyworkers healthcare concierge.",
  other: {
    "codex-preview": "development",
  },
};

export default function Home() {
  return <WatchdogDashboard manifest={manifest} />;
}
