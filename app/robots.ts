import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Checkout and the post-payment success page have no SEO value
      // (they're single-use, session-specific, and the success page
      // requires a valid Stripe session_id to render anything useful) —
      // excluding them keeps crawl budget on pages worth indexing.
      disallow: ["/api/", "/success"],
    },
    sitemap: "https://hibr.example.com/sitemap.xml",
  };
}
