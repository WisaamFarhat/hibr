"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Download, AlertCircle } from "lucide-react";

interface ConfirmResponse {
  filename: string;
  fileBase64: string;
  segmentCount: number;
}

function SuccessContent() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");

  const [status, setStatus] = useState<"loading" | "done" | "error">(
    sessionId ? "loading" : "error"
  );
  const [error, setError] = useState<string | null>(
    sessionId ? null : "Missing checkout session."
  );
  const [result, setResult] = useState<ConfirmResponse | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/confirm-and-translate?session_id=${sessionId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Translation failed");
        setResult(data);
        setStatus("done");
      })
      .catch((err) => {
        setError(err.message ?? "Something went wrong");
        setStatus("error");
      });
  }, [sessionId]);

  const download = () => {
    if (!result) return;
    try {
      const byteChars = atob(result.fileBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      setError("Something went wrong preparing your download. Refresh this page to try again.");
      setStatus("error");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b" style={{ borderColor: "var(--rule)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5">
          <Link href="/" className="flex items-baseline gap-3 w-fit">
            <span className="font-display text-2xl font-semibold tracking-tight">Hibr</span>
            <span lang="ar" className="font-arabic text-xl" style={{ color: "var(--indigo)" }}>حِبر</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center">
          {status === "loading" && (
            <>
              <Loader2 size={32} className="animate-spin mx-auto" style={{ color: "var(--indigo)" }} />
              <p className="font-display text-lg mt-4">Payment confirmed — translating your document…</p>
              <p className="font-mono text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
                This can take a moment for longer documents.
              </p>
            </>
          )}

          {status === "done" && result && (
            <div className="animate-stamp">
              <p className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--indigo)" }}>
                Translation complete
              </p>
              <p className="font-display text-xl mt-2">{result.filename}</p>
              <p className="font-mono text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                {result.segmentCount} segments translated
              </p>
              <button
                onClick={download}
                className="mt-6 font-display text-sm py-3 px-6 rounded-sm flex items-center gap-2 mx-auto"
                style={{ background: "var(--indigo)", color: "var(--paper)" }}
              >
                <Download size={16} />
                Download translated file
              </button>
              <p className="mt-5 text-sm rounded-sm border px-4 py-3" style={{ borderColor: "var(--rule)", color: "var(--ink-soft)" }}>
                A linguist will also review this translation and follow up with you if anything needs adjusting.
              </p>
            </div>
          )}

          {status === "error" && (
            <>
              <AlertCircle size={32} className="mx-auto" style={{ color: "var(--stamp-red)" }} />
              <p className="font-display text-lg mt-4">{error}</p>
              <Link href="/" className="font-mono text-xs underline mt-4 inline-block" style={{ color: "var(--indigo)" }}>
                Back to homepage
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SuccessPageContent() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
