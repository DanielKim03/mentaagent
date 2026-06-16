"use client";

import { useEffect } from "react";

// MentaAgent does NOT use a service worker. But localhost:3000 is also used by
// the sibling Mentapath app, which DOES register one — so a developer's
// browser can have a stale Mentapath service worker intercepting and serving
// cached assets for this app on the same origin (symptom: code changes never
// appear no matter how many times the dev server restarts). This actively
// unregisters any service worker and clears its caches on load.
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
  }, []);
  return null;
}
