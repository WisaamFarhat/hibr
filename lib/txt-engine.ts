import { translateSegments } from "./gemini-translate";

/**
 * Plain text is the trivial case: no structure to preserve, so we just
 * split on lines (to roughly cap each Gemini call's segment size and
 * keep line breaks meaningful in the output) and translate.
 */
export async function translateTxt(content: string, apiKey: string) {
  const lines = content.split("\n");
  const segments = lines
    .map((text, i) => ({ id: `line_${i}`, text }))
    .filter((s) => s.text.trim().length > 0);

  const { translations, inputChars, outputChars } = await translateSegments(
    segments,
    apiKey
  );

  const outputLines = lines.map((line, i) => {
    if (line.trim().length === 0) return line;
    return translations.get(`line_${i}`) ?? line;
  });

  return {
    translatedText: outputLines.join("\n"),
    inputChars,
    outputChars,
  };
}
