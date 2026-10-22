import type { MetadataRoute } from "next";

/**
 * Lets Astrya be added to a Home Screen as an app. Safari on iPhone only
 * allows web notifications for a site opened that way.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Astrya",
    short_name: "Astrya",
    start_url: "/app/today",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
  };
}
