/**
 * Generuje ikony PWA do katalogu `icons/`. Uruchamiane ręcznie
 * (`npm run icons`), bo wymaga przeglądarki Playwright. Wynik commitujemy,
 * więc build i deploy na GitHub Pages nie potrzebują Playwrighta.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "icons");

/** Kwadratowa ikona: ciemne tło + złoty medalion i haczyk. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="78%">
      <stop offset="0%" stop-color="#1d1d26"/>
      <stop offset="100%" stop-color="#0b0b0f"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="182" fill="none" stroke="#d8b56b" stroke-width="16" opacity="0.55"/>
  <circle cx="256" cy="256" r="148" fill="none" stroke="#d8b56b" stroke-width="6" opacity="0.28"/>
  <path d="M168 264 L232 328 L356 188"
        fill="none" stroke="#d8b56b" stroke-width="40"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SIZES = [
  { file: "apple-touch-180.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 }
];

const page_html = (svg) =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b0b0f}svg{display:block;width:100vw;height:100vh}</style>${svg}`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const { file, size } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(page_html(SVG), { waitUntil: "load" });
    const buf = await page.screenshot({ type: "png" });
    await writeFile(resolve(OUT, file), buf);
    await page.close();
    console.log(`icons/${file}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error("Blad generowania ikon:", err.message);
  process.exit(1);
});
