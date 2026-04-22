/**
 * Stitch pre-existing PNGs in ./linkedin-slides/ into a single 1080×1080 carousel PDF.
 *
 * Decoupled from generate-slides.ts so you can edit / crop the PNGs by hand and then
 * regenerate just the PDF without re-running Puppeteer.
 *
 * Usage (from repo root):
 *   npx tsx server/scripts/stitch-slides-pdf.ts
 *
 * It picks up every `slide-*.png` in the folder, sorts them alphabetically (slide-1,
 * slide-2, slide-3, slide-4), and produces `linkedin-carousel.pdf`. Any other filename
 * suffixes are preserved in the sort — so `slide-2-bounds.png` and `slide-2.png` both
 * slot into position 2 in natural order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const OUTPUT_DIR = path.resolve(process.cwd(), 'linkedin-slides');
const PDF_OUT = path.join(OUTPUT_DIR, 'linkedin-carousel.pdf');

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    throw new Error(`Folder not found: ${OUTPUT_DIR}. Run generate-slides.ts first or drop PNGs here.`);
  }

  const slides = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => /^slide-.*\.png$/i.test(f))
    .sort(); // lexicographic → slide-1 → slide-2 → slide-3 → slide-4

  if (slides.length === 0) {
    throw new Error(`No slide-*.png files found in ${OUTPUT_DIR}.`);
  }

  console.log('[stitch] inputs:');
  slides.forEach((f) => console.log('   ·', f));

  const pdfDoc = await PDFDocument.create();

  for (const file of slides) {
    const imgPath = path.join(OUTPUT_DIR, file);
    const imgBytes = fs.readFileSync(imgPath);

    // Fit-contain into a 1080×1080 square on cream (#FAF7F2). Preserves the user's
    // cropping — if the PNG is already closer to square, padding is minimal; if it
    // was cropped into a wide banner, we letterbox it on cream without distortion.
    const resized = await sharp(imgBytes)
      .resize(1080, 1080, { fit: 'contain', background: { r: 250, g: 247, b: 242, alpha: 1 } })
      .png()
      .toBuffer();

    const img = await pdfDoc.embedPng(resized);
    const page = pdfDoc.addPage([1080, 1080]);
    page.drawImage(img, { x: 0, y: 0, width: 1080, height: 1080 });
  }

  const bytes = await pdfDoc.save();
  fs.writeFileSync(PDF_OUT, bytes);
  console.log('[stitch] wrote', PDF_OUT, `(${slides.length} pages)`);
}

main().catch((err) => {
  console.error('[stitch] FAILED:', err);
  process.exit(1);
});
