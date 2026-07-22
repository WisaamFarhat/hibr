import type { MetadataRoute } from "next";

// TODO: keep in sync with SITE_URL in app/layout.tsx — both should
// point at the real production domain once deployed.
const SITE_URL = "https://hibr.example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
