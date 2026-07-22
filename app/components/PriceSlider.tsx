"use client";

import { useState, useMemo } from "react";
import { priceForWordCount, WORDS_PER_PAGE, CURRENCY_SYMBOL } from "@/lib/pricing-shared";

export default function PriceSlider() {
  const [pages, setPages] = useState(3);

  const { price, words } = useMemo(() => {
    const words = pages * WORDS_PER_PAGE;
    return { price: priceForWordCount(words), words };
  }, [pages]);

  return (
    <div>
      <p
        className="font-mono text-xs uppercase tracking-wider mb-3"
        style={{ color: "var(--indigo)" }}
      >
        Estimate by page count
      </p>

      <div className="flex items-baseline gap-3">
        <p className="font-display text-4xl">
          {CURRENCY_SYMBOL} {price.toFixed(0)}
        </p>
        <p className="font-mono text-sm" style={{ color: "var(--ink-soft)" }}>
          for {pages} {pages === 1 ? "page" : "pages"}
        </p>
      </div>

      <input
        type="range"
        min={1}
        max={50}
        value={pages}
        onChange={(e) => setPages(Number(e.target.value))}
        className="w-full mt-4"
        style={{ accentColor: "var(--indigo)" }}
        aria-label="Number of pages"
      />

      <div className="flex justify-between font-mono text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
        <span>1 page</span>
        <span>50 pages</span>
      </div>

      <p className="font-mono text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
        ~{words.toLocaleString()} words, assuming {WORDS_PER_PAGE} words/page.
        Includes expert review. Upload your document below for an exact price.
      </p>
    </div>
  );
}
