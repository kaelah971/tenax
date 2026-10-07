// Route-aware signal field for the app shell. Client-only for usePathname;
// the field itself is static markup, so server and client render the same
// variant for the requested path (no hydration drift).
"use client";

import { usePathname } from "next/navigation";

import { SignalField, signalFieldForPath } from "./signal-field";

export default function AppSignalField() {
  return <SignalField variant={signalFieldForPath(usePathname())} />;
}
