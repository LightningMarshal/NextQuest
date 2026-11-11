"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js (installability + the offline page). Production
 * only: in `next dev` a service worker just gets between you and HMR.
 * Renders nothing.
 */
export function ServiceWorker() {
	useEffect(() => {
		if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
		navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
			// Installability is a nicety; never surface a failure.
		});
	}, []);
	return null;
}
