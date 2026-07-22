import * as docxEngine from "./docx-engine";
import * as pptxEngine from "./pptx-engine";
import { translateSegments, estimateCostUsd } from "./gemini-translate";
import { translateTxt } from "./txt-engine";

export type SupportedFormat = "docx" | "pptx" | "txt";

export function detectFormat(filename: string): SupportedFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

export interface TranslationResult {
  outputBuffer: Buffer;
  costUsd: number;
  inputChars: number;
  outputChars: number;
  segmentCount: number;
}

export async function translateDocument(
  buffer: Buffer,
  format: SupportedFormat,
  apiKey: string
): Promise<TranslationResult> {
  if (format === "docx") {
    const parsed = await docxEngine.loadDocx(buffer);
    const { segments, nodeRefs } = docxEngine.extractTextSegments(parsed.xmlParts);
    const { translations, inputChars, outputChars } = await translateSegments(
      segments,
      apiKey
    );
    docxEngine.applyTranslations(nodeRefs, translations);
    docxEngine.applyRtlFormatting(parsed.xmlParts);
    const outputBuffer = await docxEngine.buildDocx(parsed);
    return {
      outputBuffer,
      costUsd: estimateCostUsd(inputChars, outputChars),
      inputChars,
      outputChars,
      segmentCount: segments.length,
    };
  }

  if (format === "pptx") {
    const parsed = await pptxEngine.loadPptx(buffer);
    const { segments, nodeRefs } = pptxEngine.extractTextSegments(parsed.xmlParts);
    const { translations, inputChars, outputChars } = await translateSegments(
      segments,
      apiKey
    );
    pptxEngine.applyTranslations(nodeRefs, translations);
    pptxEngine.applyRtlFormatting(parsed.xmlParts);
    const outputBuffer = await pptxEngine.buildPptx(parsed);
    return {
      outputBuffer,
      costUsd: estimateCostUsd(inputChars, outputChars),
      inputChars,
      outputChars,
      segmentCount: segments.length,
    };
  }

  if (format === "txt") {
    const text = buffer.toString("utf-8");
    const { translatedText, inputChars, outputChars } = await translateTxt(
      text,
      apiKey
    );
    return {
      outputBuffer: Buffer.from(translatedText, "utf-8"),
      costUsd: estimateCostUsd(inputChars, outputChars),
      inputChars,
      outputChars,
      segmentCount: text.split("\n").filter((l) => l.trim().length > 0).length,
    };
  }

  throw new Error(`Unsupported format: ${format}`);
}
