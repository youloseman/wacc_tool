/**
 * LinkedIn carousel slide generator.
 *
 * Runs Puppeteer against a locally-served production build and captures four
 * high-resolution PNGs of the WACC calculator, then stitches them into a single
 * 1080×1080 carousel PDF ready to upload to LinkedIn.
 *
 * Usage:
 *   1) Start the app in production mode in one terminal:
 *        npm run build && NODE_ENV=production npm run start
 *   2) From the repo root in another terminal:
 *        npx tsx server/scripts/generate-slides.ts
 *
 * Dependencies: puppeteer, pdf-lib, sharp (installed in server/package.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const CONFIG = {
  appUrl: process.env.APP_URL ?? 'http://localhost:3001',
  outputDir: path.resolve(process.cwd(), 'linkedin-slides'),
  deviceScaleFactor: 2, // retina

  // Sample calculation — matches INITIAL_INPUTS default (Apple) so the form fills
  // in itself on first load via localStorage/defaults. We still patch a few fields
  // to lock in deterministic output regardless of user's prior browser state.
  company: 'Apple',
  valuationDate: '2025-12-31',
  currency: 'USD',
  countryHQ: 'United States',
};

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[slides]', ...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Reset the app into a clean, deterministic state by clearing localStorage and
 * the URL hash before page.goto() settles into the React tree. Keeps slides
 * identical from one run to the next.
 */
async function seedCleanState(page: Page): Promise<void> {
  // Load a no-op page first so localStorage is addressable for our origin.
  await page.goto(`${CONFIG.appUrl}/api/health`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* private browsing — ignore */
    }
  });
}

/**
 * Give the app a deterministic state via the URL hash. We base64-encode the
 * same schema that `sessionState.ts#encodeStateToHash` uses, so dropping it on
 * the hash fully specifies the form without touching any DOM fields.
 */
function buildStateHash(): string {
  const DEFAULT_BOUND = {
    deRatioSource: 'industry',
    customDeRatio: null,
    analogTickers: '',
    damodaranIndustry: 'Computers/Peripherals',
    betaSource: 'damodaran',
    comparableTickers: '',
    krollSectorGics: '4520',
    krollCapStructGics: null,
    erpSource: 'damodaran',
    customErp: null,
    costOfDebtMethod: 'rating',
    ebit: null,
    interestExpense: null,
    creditRating: 'AA',
    directCostOfDebt: null,
    taxRateSource: 'damodaran',
    customTaxRate: null,
    sizePremiumOverride: null,
    countryRiskPremiumOverride: 0,
    currencyRiskPremium: 0,
    specificRiskPremium: 0,
  };
  const state = {
    companyName: CONFIG.company,
    valuationDate: CONFIG.valuationDate,
    currency: CONFIG.currency,
    waccMethodology: 'hard_currency',
    countryHQ: CONFIG.countryHQ,
    countryOperations: CONFIG.countryHQ,
    companySize: 'large',
    minBound: { ...DEFAULT_BOUND },
    maxBound: { ...DEFAULT_BOUND, betaSource: 'kroll', erpSource: 'kroll' },
  };
  const base64 = Buffer.from(JSON.stringify(state), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#state=${base64}`;
}

async function gotoAppWithState(page: Page): Promise<void> {
  await page.goto(`${CONFIG.appUrl}/${buildStateHash()}`, { waitUntil: 'networkidle0' });
  // Live recalc debounces up to 800ms; add headroom for network-dependent Rf + Kroll/FMP.
  await page.waitForSelector('.result-table', { timeout: 30_000 });
  await sleep(2500);
}

async function takeSlide1_fullApp(page: Page): Promise<string> {
  log('slide 1: full app (wide)');
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: CONFIG.deviceScaleFactor });
  // Re-trigger layout after viewport change.
  await sleep(800);
  const out = path.join(CONFIG.outputDir, 'slide-1-full-app.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  return out;
}

async function takeSlide2_bounds(page: Page): Promise<string> {
  log('slide 2: MIN/MAX bounds (square)');
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: CONFIG.deviceScaleFactor });
  await sleep(600);
  // Bound columns live inside .input-panel → <form> → second <div>. We scope the
  // shot to the two bound columns so the square crop focuses on MIN vs MAX.
  const boundsBox = await page.evaluate(() => {
    const panel = document.querySelector('.input-panel');
    if (!panel) return null;
    // The two BoundColumn wrappers sit inside the flex-col lg:flex-row container.
    const rows = Array.from(panel.querySelectorAll('div'));
    const row = rows.find(
      (el) =>
        el.classList.contains('flex') &&
        el.querySelector('[data-testid="bound-min"], .border-l-sage, .border-sage'),
    );
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), w: r.width + 16, h: r.height + 16 };
  });
  const out = path.join(CONFIG.outputDir, 'slide-2-bounds.png');
  if (boundsBox) {
    await page.screenshot({
      path: out,
      clip: {
        x: boundsBox.x,
        y: boundsBox.y,
        width: Math.min(boundsBox.w, 1080 - boundsBox.x),
        height: Math.min(boundsBox.h, 1080 - boundsBox.y),
      },
    });
  } else {
    // Fallback: capture the whole input panel.
    const panel = await page.$('.input-panel');
    if (!panel) throw new Error('input-panel not found');
    await panel.screenshot({ path: out });
  }
  return out;
}

async function takeSlide3_beta(page: Page): Promise<string> {
  log('slide 3: comparable beta (portrait)');
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: CONFIG.deviceScaleFactor });
  await sleep(600);

  // Switch the MIN bound's beta source to 'comparables' and populate peer tickers.
  // The live recalc hook will re-run /api/calculate once the input value changes.
  await page.evaluate(() => {
    // Expand every BoundSection so the Beta subsection is visible for screenshot capture.
    document
      .querySelectorAll<HTMLButtonElement>('section > button[type="button"]')
      .forEach((b) => {
        const caret = b.querySelector('svg');
        // If the caret is the right-chevron (collapsed), click to expand.
        if (caret && caret.getAttribute('aria-hidden') !== 'true') {
          const isCollapsed = b.querySelector('svg[stroke-linecap]');
          if (isCollapsed) b.click();
        }
      });
  });

  // Click the "Comparable companies" radio in the first visible Beta section.
  const switched = await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const target = radios.find((r) => {
      const label = r.closest('label')?.textContent ?? '';
      return /comparable/i.test(label);
    });
    if (!target) return false;
    target.click();
    return true;
  });

  if (switched) {
    // Find the "manual entry" ticker text field and type peers.
    const typed = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'));
      const field = inputs.find((i) => /ticker|manual/i.test(i.placeholder + ' ' + (i.previousSibling?.textContent ?? '')));
      if (!field) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(field, 'XOM, CVX, COP');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    if (typed) {
      // Wait for /api/calculate + comparable fetch + beta regression to complete.
      await sleep(6000);
    }
  }

  const out = path.join(CONFIG.outputDir, 'slide-3-beta.png');
  // Scope the shot to the input-panel so it's all-form, all-data.
  const panel = await page.$('.input-panel');
  if (!panel) throw new Error('input-panel not found');
  await panel.screenshot({ path: out });
  return out;
}

async function takeSlide4_results(page: Page): Promise<string> {
  log('slide 4: results only (portrait)');
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: CONFIG.deviceScaleFactor });
  await sleep(600);

  // Reload the clean state so slide 4 isn't polluted by slide 3's comparable-beta switch.
  await gotoAppWithState(page);

  // Hide the input panel and expand the result panel to full width. Reversed on close.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLElement>('.input-panel');
    const result = document.querySelector<HTMLElement>('.result-panel');
    if (input) input.style.display = 'none';
    if (result) {
      result.style.width = '100%';
      result.style.maxWidth = '100%';
    }
  });
  await sleep(500);

  const out = path.join(CONFIG.outputDir, 'slide-4-results.png');
  const result = await page.$('.result-panel');
  if (!result) throw new Error('result-panel not found');
  await result.screenshot({ path: out });
  return out;
}

async function buildCarouselPdf(slidePaths: string[]): Promise<string> {
  log('building carousel PDF (1080×1080 per page, contain-fit on cream)');
  const pdfDoc = await PDFDocument.create();
  for (const file of slidePaths) {
    const imgBytes = fs.readFileSync(file);
    const resized = await sharp(imgBytes)
      .resize(1080, 1080, { fit: 'contain', background: { r: 250, g: 247, b: 242, alpha: 1 } })
      .png()
      .toBuffer();
    const img = await pdfDoc.embedPng(resized);
    const page = pdfDoc.addPage([1080, 1080]);
    page.drawImage(img, { x: 0, y: 0, width: 1080, height: 1080 });
  }
  const bytes = await pdfDoc.save();
  const out = path.join(CONFIG.outputDir, 'linkedin-carousel.pdf');
  fs.writeFileSync(out, bytes);
  return out;
}

async function main(): Promise<void> {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  // Fail early with a clear message if the production server isn't running.
  try {
    const res = await fetch(`${CONFIG.appUrl}/api/health`);
    if (!res.ok) throw new Error(`health ${res.status}`);
  } catch (e) {
    throw new Error(
      `App not reachable at ${CONFIG.appUrl}. Start the production server first:\n` +
        `    npm run build && NODE_ENV=production npm run start`,
    );
  }

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=medium'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: CONFIG.deviceScaleFactor });

    await seedCleanState(page);
    await gotoAppWithState(page);

    const slides: string[] = [];
    slides.push(await takeSlide1_fullApp(page));
    slides.push(await takeSlide2_bounds(page));
    slides.push(await takeSlide3_beta(page));
    slides.push(await takeSlide4_results(page));

    const pdfPath = await buildCarouselPdf(slides);

    log('done');
    log('  PNGs →', CONFIG.outputDir);
    slides.forEach((s) => log('   ·', path.basename(s)));
    log('  PDF  →', pdfPath);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[slides] FAILED:', err);
  process.exit(1);
});
