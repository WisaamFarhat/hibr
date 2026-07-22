"use client";

import { useState, useRef } from "react";
import { FileText, Presentation, FileType, Upload, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import PriceSlider from "@/app/components/PriceSlider";

type Status = "idle" | "estimating" | "estimated" | "checking-out" | "error";

interface Estimate {
  format: string;
  segmentCount: number;
  wordCount: number;
  priceUsd: number;
  priceCents: number;
  expertReviewFeeUsd: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [wantsExpertReview, setWantsExpertReview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setError(null);
    setEstimate(null);
    setWantsExpertReview(false);
  };

  const isBusy = status === "estimating" || status === "checking-out";

  const handleFile = async (f: File) => {
    if (isBusy) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".docx") && !lower.endsWith(".pptx") && !lower.endsWith(".txt")) {
      setError("Use a .docx, .pptx, or .txt file.");
      return;
    }
    setError(null);
    setFile(f);
    setEstimate(null);
    setWantsExpertReview(false);
    setStatus("estimating");

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/estimate", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Could not read this document");

      setEstimate(data);
      setStatus("estimated");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setStatus("error");
    }
  };

  const payAndTranslate = async () => {
    if (!file) return;
    setStatus("checking-out");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("wantsExpertReview", String(wantsExpertReview));

      const res = await fetch("/api/checkout", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");

      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--rule)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight">Hibr</span>
            <span lang="ar" className="font-arabic text-xl" style={{ color: "var(--indigo)" }}>حِبر</span>
          </div>
          <p className="hidden sm:block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
            EN → AR · no account needed
          </p>
        </div>
      </header>

      {/* Hero: interactive price calculator + mirrored EN/AR strip */}
      <section className="border-b" style={{ borderColor: "var(--rule)" }}>
        <div className="max-w-5xl mx-auto px-6 pt-8">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight max-w-3xl">
            Translate Word and PowerPoint documents from English to Arabic
          </h1>
          <h2 className="font-mono text-sm mt-3 max-w-2xl" style={{ color: "var(--ink-soft)" }}>
            See your exact price before you pay. No account, no subscription.
          </h2>
        </div>
        <div className="max-w-5xl mx-auto px-6 pb-10 pt-8 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <PriceSlider />
          <div dir="rtl" lang="ar" className="md:text-right md:border-l md:pl-8" style={{ borderColor: "var(--rule)" }}>
            <p className="font-mono text-xs uppercase tracking-wider mb-3" style={{ color: "var(--indigo)" }} dir="ltr">
              الهدف · العربية
            </p>
            <p className="font-arabic text-2xl leading-relaxed">
              اعرف السعر بالضبط قبل الدفع. بدون اشتراك، بدون حساب — فقط
              مستندك، مترجمًا.
            </p>
          </div>
        </div>
      </section>

      {/* Upload + estimate area */}
      <section className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div
            role="button"
            tabIndex={isBusy ? -1 : 0}
            aria-disabled={isBusy}
            aria-label={file ? `Selected file: ${file.name}. Press Enter to choose a different file.` : "Drop a document, or press Enter to choose one"}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isBusy) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (isBusy) return;
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => {
              if (!isBusy) inputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (isBusy) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className="cursor-pointer rounded-sm border-2 border-dashed px-8 py-14 flex flex-col items-center text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: dragActive ? "var(--indigo)" : "var(--rule)",
              background: dragActive ? "var(--indigo-soft)" : "transparent",
              opacity: isBusy ? 0.7 : 1,
              pointerEvents: isBusy ? "none" : "auto",
              outlineColor: "var(--indigo)",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".docx,.pptx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              file.name.toLowerCase().endsWith(".docx") ? (
                <FileText size={32} strokeWidth={1.5} style={{ color: "var(--indigo)" }} />
              ) : file.name.toLowerCase().endsWith(".pptx") ? (
                <Presentation size={32} strokeWidth={1.5} style={{ color: "var(--indigo)" }} />
              ) : (
                <FileType size={32} strokeWidth={1.5} style={{ color: "var(--indigo)" }} />
              )
            ) : (
              <Upload size={32} strokeWidth={1.5} style={{ color: "var(--indigo)" }} />
            )}
            <p className="font-display text-lg mt-4">
              {file ? file.name : "Drop a document, or click to choose one"}
            </p>
            {!file && (
              <p className="font-mono text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                .docx · .pptx · .txt
              </p>
            )}
          </div>

          {status === "estimating" && (
            <p className="mt-4 text-sm flex items-center gap-2 justify-center" style={{ color: "var(--ink-soft)" }}>
              <Loader2 size={14} className="animate-spin" />
              Reading your document…
            </p>
          )}

          {error && (
            <p className="mt-4 text-sm text-center" style={{ color: "var(--stamp-red)" }}>
              {error}
            </p>
          )}

          {estimate && (status === "estimated" || status === "checking-out") && (
            <div className="mt-6 animate-stamp">
              <div className="rounded-sm border px-6 py-6" style={{ borderColor: "var(--rule)" }}>
                <p className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--indigo)" }}>
                  Your price
                </p>
                <p className="font-display text-4xl mt-2">
                  ${(estimate.priceUsd + (wantsExpertReview ? estimate.expertReviewFeeUsd : 0)).toFixed(2)}
                </p>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm font-mono">
                  <div>
                    <dt style={{ color: "var(--ink-soft)" }}>Words</dt>
                    <dd>{estimate.wordCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt style={{ color: "var(--ink-soft)" }}>Format</dt>
                    <dd className="uppercase">{estimate.format}</dd>
                  </div>
                </dl>

                <label
                  className="mt-5 flex items-start gap-3 rounded-sm border px-4 py-3 cursor-pointer"
                  style={{ borderColor: wantsExpertReview ? "var(--indigo)" : "var(--rule)" }}
                >
                  <input
                    type="checkbox"
                    checked={wantsExpertReview}
                    onChange={(e) => setWantsExpertReview(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="flex items-center gap-1.5 font-display">
                      <ShieldCheck size={14} style={{ color: "var(--indigo)" }} />
                      Have an expert check it — +${estimate.expertReviewFeeUsd.toFixed(2)}
                    </span>
                    <span className="block font-mono text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                      A native Arabic linguist reviews the translation for accuracy
                      and tone, and follows up by email.
                    </span>
                  </span>
                </label>

                <button
                  onClick={payAndTranslate}
                  disabled={status === "checking-out"}
                  className="mt-5 w-full font-display text-base py-3 rounded-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                  style={{
                    background: status === "checking-out" ? "#5560A8" : "var(--indigo)",
                    color: "var(--paper)",
                  }}
                >
                  {status === "checking-out" ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Redirecting to payment…
                    </>
                  ) : (
                    <>
                      Pay ${(estimate.priceUsd + (wantsExpertReview ? estimate.expertReviewFeeUsd : 0)).toFixed(2)} & translate
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <button
                  onClick={reset}
                  className="mt-3 w-full font-mono text-xs py-2 text-center"
                  style={{ color: "var(--ink-soft)" }}
                >
                  Choose a different file
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: "var(--rule)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center sm:justify-between gap-1.5 font-mono text-xs text-center" style={{ color: "var(--ink-soft)" }}>
          <span>Powered by Gemini 2.5 Flash</span>
          <span dir="rtl" lang="ar" className="font-arabic text-sm">مدعوم بواسطة Gemini 2.5 Flash</span>
        </div>
      </footer>
    </main>
  );
}
