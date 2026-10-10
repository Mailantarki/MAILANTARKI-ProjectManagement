import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MAILANTARKI.COM Technical documentation",
    short_name: "Documents",
    start_url: "/projects",
    display: "standalone",
    background_color: "#e7ede8",
    theme_color: "#1f3d2e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
