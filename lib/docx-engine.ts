import {
  loadOOXML,
  extractTextSegments as genericExtract,
  applyTranslations as genericApply,
  applyRtlFormatting as genericRtl,
  buildOOXML,
  TextSegment,
} from "./ooxml-engine";

const TEXT_TAG = "w:t";

function isTranslatablePath(path: string): boolean {
  return (
    path === "word/document.xml" ||
    /^word\/header\d*\.xml$/.test(path) ||
    /^word\/footer\d*\.xml$/.test(path) ||
    path === "word/footnotes.xml" ||
    path === "word/endnotes.xml"
  );
}

export async function loadDocx(buffer: Buffer) {
  return loadOOXML(buffer, isTranslatablePath);
}

export function extractTextSegments(xmlParts: Map<string, any>) {
  return genericExtract(xmlParts, TEXT_TAG);
}

export function applyTranslations(nodeRefs: Map<string, any>, translations: Map<string, string>) {
  genericApply(nodeRefs, translations);
}

export function applyRtlFormatting(xmlParts: Map<string, any>) {
  genericRtl(xmlParts, [
    { containerTag: "w:pPr", flagTag: "w:bidi" },
    { containerTag: "w:rPr", flagTag: "w:rtl" },
  ]);
}

export async function buildDocx(parsedDoc: { zip: any; xmlParts: Map<string, any> }) {
  return buildOOXML(parsedDoc);
}

export type { TextSegment };
