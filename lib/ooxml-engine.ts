import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

/**
 * Generic engine for Office Open XML formats (.docx, .pptx — both are
 * just zips of XML, structured similarly enough that the same
 * extract/inject logic works for both, with format-specific
 * differences isolated to: which tag holds text, and which tags need
 * RTL flags).
 */

export interface TextSegment {
  id: string;
  text: string;
}

export interface ParsedOOXML {
  zip: JSZip;
  xmlParts: Map<string, any>;
}

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
};

const parser = new XMLParser(parserOptions);
const builder = new XMLBuilder(parserOptions);

export async function loadOOXML(
  buffer: Buffer,
  isTranslatablePath: (path: string) => boolean
): Promise<ParsedOOXML> {
  const zip = await JSZip.loadAsync(buffer);
  const xmlParts = new Map<string, any>();

  for (const path of Object.keys(zip.files)) {
    if (isTranslatablePath(path)) {
      const file = zip.files[path];
      if (!file || file.dir) continue;
      const xmlStr = await file.async("string");
      xmlParts.set(path, parser.parse(xmlStr));
    }
  }

  return { zip, xmlParts };
}

/**
 * Walk every XML part, find every instance of `textTag` (e.g. "w:t" for
 * Word, "a:t" for PowerPoint), and collect text content in document
 * order. Returns segments plus direct references to the underlying
 * node objects so translations can be spliced back in place later.
 */
export function extractTextSegments(
  xmlParts: Map<string, any>,
  textTag: string
): { segments: TextSegment[]; nodeRefs: Map<string, any> } {
  const segments: TextSegment[] = [];
  const nodeRefs = new Map<string, any>();
  let counter = 0;

  function walk(node: any) {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        if (key === textTag) {
          const arr = node[key];
          if (Array.isArray(arr)) {
            for (const entry of arr) {
              if (entry && typeof entry === "object" && "#text" in entry) {
                const text = entry["#text"];
                if (typeof text === "string" && text.trim().length > 0) {
                  const id = `seg_${counter++}`;
                  segments.push({ id, text });
                  nodeRefs.set(id, entry);
                }
              }
            }
          }
        } else {
          walk(node[key]);
        }
      }
    }
  }

  for (const [, parsed] of xmlParts) walk(parsed);

  return { segments, nodeRefs };
}

export function applyTranslations(
  nodeRefs: Map<string, any>,
  translations: Map<string, string>
) {
  for (const [id, node] of nodeRefs) {
    const translated = translations.get(id);
    if (translated !== undefined) {
      node["#text"] = translated;
    }
  }
}

/**
 * Generic RTL-flag injector. `rules` maps a container tag (e.g. "w:pPr")
 * to the child flag tag to ensure exists (e.g. "w:bidi").
 */
export function applyRtlFormatting(
  xmlParts: Map<string, any>,
  rules: { containerTag: string; flagTag: string }[]
) {
  function ensureChild(parentArr: any[], tagName: string) {
    const existing = parentArr.find((n: any) => Object.keys(n)[0] === tagName);
    if (!existing) {
      parentArr.push({ [tagName]: [{}] });
    }
  }

  function walk(node: any) {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        for (const rule of rules) {
          if (key === rule.containerTag && Array.isArray(node[key])) {
            ensureChild(node[key], rule.flagTag);
          }
        }
        walk(node[key]);
      }
    }
  }

  for (const [, parsed] of xmlParts) walk(parsed);
}

export async function buildOOXML(parsedDoc: ParsedOOXML): Promise<Buffer> {
  const { zip, xmlParts } = parsedDoc;
  for (const [path, parsed] of xmlParts) {
    zip.file(path, builder.build(parsed));
  }
  return await zip.generateAsync({ type: "nodebuffer" });
}
