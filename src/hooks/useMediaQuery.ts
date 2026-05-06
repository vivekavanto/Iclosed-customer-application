"use client";

import { useState, useEffect } from "react";

/**
 * Hook to detect if a media query matches.
 * Returns false during SSR and initial hydration to prevent mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    // Set initial value
    setMatches(mediaQuery.matches);

    // Listen for changes
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Convenience hook to detect if the screen is large (desktop/laptop).
 * Uses the lg breakpoint (1024px) as the threshold.
 */
export function useIsLargeScreen(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
