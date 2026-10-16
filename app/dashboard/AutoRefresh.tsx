"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps the overlay "connected" status and booking list fresh without a manual reload.
export default function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
