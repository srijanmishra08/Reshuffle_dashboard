import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Noto Sans is registered because the built-in PDF fonts have no rupee glyph.
 * The latin subset has no U+20B9, so the sign comes from the latin-ext subset
 * (see `Rupee` in parts.tsx).
 */
const dir = path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files");
let registered = false;

export const FONT = "NotoSans";
export const FONT_EXT = "NotoSansExt";

export function registerFonts() {
  if (registered) return;
  registered = true;

  Font.register({
    family: FONT,
    fonts: [
      { src: path.join(dir, "noto-sans-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "noto-sans-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FONT_EXT,
    fonts: [
      { src: path.join(dir, "noto-sans-latin-ext-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "noto-sans-latin-ext-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}
