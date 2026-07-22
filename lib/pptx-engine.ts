import {
  loadOOXML,
  extractTextSegments as genericExtract,
  applyTranslations as genericApply,
  buildOOXML,
  TextSegment,
} from "./ooxml-engine";

// PowerPoint text lives in <a:t> elements, inside <a:r> runs, inside
// slide XML files. Notes pages and layouts use the same tag, so we
// translate those too — useful since speaker notes are often shared.
const TEXT_TAG = "a:t";

function isTranslatablePath(path: string): boolean {
  return (
    /^ppt\/slides\/slide\d+\.xml$/.test(path) ||
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path) ||
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path) ||
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(path)
  );
}

export async function loadPptx(buffer: Buffer) {
  return loadOOXML(buffer, isTranslatablePath);
}

export function extractTextSegments(xmlParts: Map<string, any>) {
  return genericExtract(xmlParts, TEXT_TAG);
}

export function applyTranslations(nodeRefs: Map<string, any>, translations: Map<string, string>) {
  genericApply(nodeRefs, translations);
}

/**
 * PowerPoint RTL works differently from Word: paragraph-level direction
 * is set via the `rtl="1"` attribute on <a:pPr>, not a child element.
 * fast-xml-parser preserveOrder stores attributes in a sibling ":@" key.
 */
export function applyRtlFormatting(xmlParts: Map<string, any>) {
  function walk(node: any) {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        if (key === "a:pPr" && Array.isArray(node[key])) {
          if (!node[":@"]) node[":@"] = {};
          node[":@"]["@_rtl"] = "1";
        }
        walk(node[key]);
      }
    }
  }

  for (const [, parsed] of xmlParts) walk(parsed);
}

export async function buildPptx(parsedDoc: { zip: any; xmlParts: Map<string, any> }) {
  return buildOOXML(parsedDoc);
}

export type { TextSegment };
