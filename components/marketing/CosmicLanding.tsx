"use client";
import dynamic from "next/dynamic";

// WebGL/three can only run in the browser — load client-side only.
const CosmicHero = dynamic(() => import("./CosmicHero"), {
  ssr: false,
  loading: () => <div className="min-h-[100svh] bg-bg" />,
});

export function CosmicLanding() {
  return <CosmicHero />;
}
