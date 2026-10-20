import type { MetadataRoute } from "next";

/**
 * Home Screen web app manifest.
 * `display: standalone` is required for Web Push on iPhone (iOS 16.4+).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Gym Coach",
    short_name: "Gym Coach",
    description:
      "An AI-powered personal fitness coach to help you get leaner, build muscle, and stay consistent.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#F5F7FA",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
