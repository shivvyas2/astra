"use client";
import dynamic from "next/dynamic";

// WebGL/three can only run in the browser — load client-side only.
// While it loads, show the photo hero immediately so nothing looks blank.
const CosmicHero = dynamic(() => import("./CosmicHero"), {
  ssr: false,
  loading: () => (
    <div className="relative min-h-[100svh] bg-bg">
      <div className="absolute inset-0 bg-cover bg-center opacity-70" style={{ backgroundImage: "url(/images/planet-sun.jpg)" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/40 to-bg" />
    </div>
  ),
});

export function CosmicLanding() {
  return <CosmicHero />;
}
