"use client";
import dynamic from "next/dynamic";

// WebGL/three can only run in the browser — load client-side only.
// While it loads, show the photo hero immediately so nothing looks blank.
const CosmicHero = dynamic(() => import("./CosmicHero"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[100svh] bg-cover bg-center" style={{ backgroundImage: "url(/images/planet-sun.jpg)" }} />
  ),
});

export function CosmicLanding() {
  return <CosmicHero />;
}
