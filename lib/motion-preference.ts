"use client";

import { useSyncExternalStore } from "react";

const preference = "(prefers-reduced-motion: reduce)";
function subscribe(onChange: () => void) {
  const query = window.matchMedia(preference);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const snapshot = () => window.matchMedia(preference).matches;
const serverSnapshot = () => false;

// The server snapshot is reused during hydration, then the browser preference
// takes over. CSS also disables motion before the first client render.
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
