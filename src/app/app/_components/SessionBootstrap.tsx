// Establishes the server-owned Connected Mode session without exposing its
// opaque cookie to JavaScript. This is intentionally bodyless and credential
// free; pairing and Bitget OAuth belong to later slices.
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

let sessionRequest: Promise<void> | null = null;

export function ensureTenaxSession(): Promise<void> {
  if (!sessionRequest) {
    sessionRequest = fetch("/api/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).then((response) => {
      if (!response.ok) throw new Error("SESSION_UNAVAILABLE");
    }).catch((error: unknown) => {
      sessionRequest = null;
      throw error;
    });
  }
  return sessionRequest;
}

export default function SessionBootstrap() {
  const attempted = useRef(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    void ensureTenaxSession()
      .then(() => {
        if (pathname === "/app/connected") router.refresh();
      })
      .catch(() => {
        // The Connected Mode shell remains usable when durable state is not
        // configured. The server page displays the honest unavailable state.
      });
  }, [pathname, router]);

  return null;
}
