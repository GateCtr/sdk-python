import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GateCtr",
    short_name: "GateCtr",
    description: "One gateway. Every LLM.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
    categories: ["productivity", "developer tools"],
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
