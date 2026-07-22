import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Hibr — English to Arabic document translation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// next/og's ImageResponse renders in an isolated edge environment that
// can't use next/font (that's a build-time mechanism tied to the
// regular React tree) — custom fonts have to be fetched as raw bytes
// and passed in directly. Without this, the Arabic text below renders
// as empty tofu boxes, since the default system serif has no Arabic
// glyph coverage at all.
async function loadArabicFont(): Promise<ArrayBuffer> {
  const res = await fetch(
    "https://fonts.gstatic.com/s/notonaskharabic/v25/RrQ5bpV-9Dd1b1OAGA6M9PkifLwoBVjqlVavFqsKbAAyGl4nW.ttf"
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Arabic font: ${res.status}`);
  }
  return res.arrayBuffer();
}

export default async function OpengraphImage() {
  let arabicFontData: ArrayBuffer | null = null;
  try {
    arabicFontData = await loadArabicFont();
  } catch (err) {
    // If the font fetch fails (rate limit, transient network issue),
    // fall back to rendering without it rather than 500ing the whole
    // image — the Arabic text will show as tofu in that rare case, but
    // the rest of the card (title, description, format badges) still
    // renders correctly for link previews.
    console.error("OG image: failed to load Arabic font, rendering without it:", err);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#FAF8F4",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: "#1A1A1A" }}>
            Hibr
          </div>
          <div style={{ fontSize: 64, color: "#2B3A8C", fontFamily: "Noto Naskh Arabic" }}>
            حِبر
          </div>
        </div>
        <div
          style={{
            fontSize: 32,
            color: "#5C5850",
            marginTop: 28,
            maxWidth: 880,
            lineHeight: 1.4,
          }}
        >
          English to Arabic document translation. See your price before you
          pay.
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 48,
            fontSize: 22,
            color: "#2B3A8C",
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          <div>.DOCX</div>
          <div>·</div>
          <div>.PPTX</div>
          <div>·</div>
          <div>.TXT</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: arabicFontData
        ? [
            {
              name: "Noto Naskh Arabic",
              data: arabicFontData,
              style: "normal" as const,
            },
          ]
        : undefined,
    }
  );
}
