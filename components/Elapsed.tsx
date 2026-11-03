"use client";

import { useEffect, useState } from "react";

/** 75s -> "1:15", 3725s -> "1:02:05" */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Live call timer, like Discord's. */
export function Elapsed({ since, className = "elapsed" }: { since: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={className} title="Call duration">
      {formatDuration(now - since)}
    </span>
  );
}
