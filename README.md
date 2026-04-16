# WACC Calculator

A professional **Weighted Average Cost of Capital** calculator for valuation professionals.
Produces a **MIN/MAX range** from two independently-configured bound scenarios, with live market
data, calculated bottom-up betas from peer returns, emerging-market local-currency methodology,
and bank-ready Excel / PDF export.

Live: https://server-production-02dd.up.railway.app
Repo: https://github.com/youloseman/wacc_tool

---

## Table of contents

1. [What the app does](#what-the-app-does)
2. [Methodology — full calculation chain](#methodology--full-calculation-chain)
3. [Data sources](#data-sources)
4. [Architecture](#architecture)
5. [Project layout](#project-layout)
6. [API surface](#api-surface)
7. [Local development](#local-development)
8. [Deployment](#deployment)
9. [Testing](#testing)
10. [Known limits and caveats](#known-limits-and-caveats)

---

## What the app does

The user fills a form on the left (company, country, industry, valuation date, …) and configures
**two independent bounds** — a **MIN** scenario (lower-bound WACC) and a **MAX** scenario
(upper-bound WACC). Each bound has its own choices for:

- **Capital structure** (D/E) — industry average, custom input (D/E or debt-share), or median of
  company analogs
- **Beta source** — Damodaran industry unlevered β, Kroll full-information β, or bottom-up from
  comparable peers (historical returns regression)
- **Equity Risk Premium** — Damodaran mature-market ERP, Kroll ERP, or custom
- **Cost of Debt method** — ICR → implied rating → spread, explicit credit rating → spread, or
  direct input
- **Tax rate** — Damodaran country marginal rate or custom
- **Additional premiums** — size (Kroll), country risk (Damodaran), currency, specific

The right panel shows the WACC decomposition live (debounced 250–800 ms per edit) across every
intermediate step, with transparent source attribution on each row.

### UX highlights

- **Live recalc** — no "Calculate" button. Every input change dispatches `/api/calculate`.
  Heavy ops (historical prices, FRED fetches) are debounced 800 ms; light toggles 250 ms. Old
  requests are aborted on the next change (last-one-wins).
- **Session persistence** — inputs autosaved to `localStorage` (`wacc-calculator-state-v1`).
  Collapsed-section state persisted separately.
- **Shareable URLs** — state base64url-encoded into `#state=…` hash. Share button copies the
  link; fallback modal opens if `navigator.clipboard` is unavailable.
- **Reset** — wipes localStorage, URL hash, in-memory UI state (expanded sections, peer-card
  expansions, D/E-vs-debt-share toggle); form returns to `INITIAL_INPUTS` without a page reload.
- **Diff highlighting** — bound sections where MIN ≠ MAX highlight amber so the user instantly
  sees which inputs are driving the WACC range.

---

## Methodology — full calculation chain

All formulas live in [shared/wacc.ts](shared/wacc.ts) (client + server import the same pure
module) and are unit-tested in [client/src/utils/wacc.test.ts](client/src/utils/wacc.test.ts).

### 1. Risk-free rate (Rf)

| Methodology | Rf source |
|---|---|
| **Hard currency** (USD/EUR/GBP/CHF) | FRED series: `DGS10` (USD 10Y Treasury), `IRLTLT01EZM156N` (EUR), `IRLTLT01GBM156N` (GBP), `IRLTLT01CHM156N` (CHF). See [riskFreeRate.ts](server/src/services/riskFreeRate.ts). |
| **Local currency** (EM countries) | Static snapshot of local 10Y govt bond yield from [em-risk-free-rates.json](server/src/data/em-risk-free-rates.json). 20 EM countries currently: Russia, Brazil, India, China, Turkey, Mexico, South Africa, Indonesia, Argentina, Kazakhstan, Colombia, Chile, Peru, Philippines, Vietnam, Thailand, Malaysia, Nigeria, Egypt, Ukraine. |

When the user selects an emerging-market country of operations, the form **auto-switches** to
local-currency methodology, reads Rf from the EM JSON, **sets CRP to 0** (embedded in local Rf),
and suggests a direct-input cost of debt of `central_bank_rate + 3%` (typical corporate spread
over policy rate).

### 2. Unlevered Beta (βu)

Three sources:

**Damodaran** — industry unlevered β from [damodaran-industries.json](server/src/data/damodaran/damodaran-industries.json)
(96 US industries + Europe overlay, parsed from `betas.xls` + `betaEurope.xls` via
[scripts/regenerateDamodaran.mjs](scripts/regenerateDamodaran.mjs)).

**Kroll** — Full-Information Beta from [kroll-data.json](server/src/data/kroll/kroll-data.json).
Falls back to Damodaran with a `Kroll (no data → Damodaran)` label when Kroll has no entry for
the industry.

**Comparable companies** (the interesting path) — bottom-up β from peer returns regression.
Implemented in [betaCalculator.ts](server/src/services/betaCalculator.ts). Follows **Kept**-style
methodology (boutique valuation template):

1. Fetch 7 years of daily prices for each peer + the S&P 500 (proxied via SPY ETF) from FMP
   `/stable/historical-price-eod/full`, resample to monthly (last trading day of each month).
2. Compute monthly returns `r_i = (p_i − p_{i−1}) / p_{i−1}`.
3. Align the stock and market return series by YYYY-MM.
4. For each company, run **three overlapping 5-year rolling regressions**:
   - **VAL YR** — 5Y window ending at the valuation date
   - **YR-1** — 5Y window ending 1 year earlier
   - **YR-2** — 5Y window ending 2 years earlier
5. Per window, compute OLS slope (β), intercept (α), R², standard error of β, t-statistic, and
   flag significance at 95% (critical t from lookup table at df = n − 2).
6. **Average β across the 3 windows**. Also compute `stabilityRange = max − min`:
   - ≤ 0.2 → `stable` (green)
   - ≤ 0.5 → `moderate` (amber)
   - `> 0.5` → `unstable` (red) — banner suggests falling back to Damodaran

**Selection hierarchy** (see [betaCalculator.ts:selectBeta](server/src/services/betaCalculator.ts)):
- Prefer 5Y Monthly if all 3 windows have ≥ 36 monthly observations → `calculated-5Y`
- Else 3Y Monthly if all windows have ≥ 18 observations → `calculated-3Y`
- Else fall back to FMP provider β → `fmp-provider`

The median of the peer set's **unlevered** βs is then used as the bound's βu. Each peer's β is
unlevered using its own D/E and tax rate (Hamada):

```
βu_i = β_lev_i / (1 + (1 − tax_i) × (D/E)_i)
```

### 3. Debt-to-Equity ratio and Tax rate

Sourced from a **cascade** — see [financialStatements.ts](server/src/services/financialStatements.ts):

| Tier | D/E source | Tax source | Trigger |
|---|---|---|---|
| 1 | `firm` — FMP `/stable/ratios-ttm` `debtEquityRatioTTM` | `firm` — `effectiveTaxRateTTM` | US-listed bare ticker (no `.` suffix). |
| 2 | `balance-sheet` — FMP `/stable/balance-sheet-statement` `totalDebt / totalStockholdersEquity` | `income-statement` — FMP `/stable/income-statement` `incomeTaxExpense / incomeBeforeTax` | Tier 1 miss or negative. |
| 2b | `market-cap` — `totalDebt / marketCap` | — | Book equity is negative (e.g. after heavy buybacks). |
| 3 | `industry-proxy` — Damodaran industry D/E | `country-default` — Damodaran country marginal tax | FMP returns HTTP 402 (international tickers gated on paid tier) or no data. |

Guardrails:
- Effective tax capped at 45% (outliers from one-time items)
- Negative effective tax → uses country marginal rate (tax-refund year)
- Loss year (`incomeBeforeTax ≤ 0`) → country marginal rate
- UI shows a badge per peer: `BS D/E` (sage), `Mkt D/E` (amber), `proxy D/E` (red). No badge for
  `firm` tier (best quality).

### 4. Relevered Beta (β_L)

The bound-level median βu is relevered for the **target** capital structure and tax (Hamada):

```
β_L = βu × (1 + (1 − t_target) × (D/E)_target)
```

where `t_target` and `(D/E)_target` come from the bound's tax and capital-structure inputs — not
from the individual peers.

### 5. Equity Risk Premium (ERP)

| Source | Value |
|---|---|
| `damodaran` | Mature-market ERP = US ERP − US default spread (both from `ctryprem.xlsx`). |
| `kroll` | Static Kroll recommended ERP from [kroll-data.json](server/src/data/kroll/kroll-data.json). |
| `custom` | User-supplied. |

### 6. Cost of Equity (CAPM + premiums)

```
CoE = Rf + β_L × ERP + SizeRP + CountryRP + CurrencyRP + SpecificRP
```

### 7. Cost of Debt

Three user-selectable methods:

- **ICR (Interest Coverage Ratio)** — user enters EBIT and Interest expense. `ICR = EBIT / Interest`
  mapped to rating via [damodaran-icr-rating.json](server/src/data/damodaran/damodaran-icr-rating.json)
  (Jan 2026 table; separate large/small tables). Pre-tax CoD = Rf + spread.
- **Rating** — user picks a letter rating. Spread from FRED ICE BofA OAS series (BAMLC0A*/BAMLH0A*
  per rating bucket). See [creditSpread.ts](server/src/services/creditSpread.ts). Pre-tax CoD = Rf + spread.
- **Direct input** — user types pre-tax CoD directly. Used for local-currency scenarios where
  Rf + USD-spread would be meaningless.

After-tax CoD = `CoD_preTax × (1 − tax)`.

### 8. Country Risk Premium

- Hard-currency mode: from [damodaran-country-risk.json](server/src/data/damodaran/damodaran-country-risk.json)
  (ctryprem.xlsx). Russia override applied manually because Damodaran dropped it after the rating
  suspension (Moody's Ca, default spread 10.19%, CRP 10.19%, ERP 14.42% as of Jan 2026).
- Local-currency mode: **0.0** (embedded in local Rf — using it would be double-counting).

### 9. Size premium

From Kroll size-premium table — keyed by `companySize ∈ {large, mid, small, micro}`.

### 10. WACC

```
w_e = 1 / (1 + D/E)
w_d = 1 − w_e
WACC = CoE × w_e + CoD_afterTax × w_d
```

MIN/MAX sort: after computing both scenarios, if MIN's WACC > MAX's, they are **swapped** so the
result table always shows the smaller value as "MIN" — regardless of which input scenario the
user labeled as MIN/MAX. The swap preserves all paired intermediate values (beta, CoE, CoD, …)
so rows stay internally consistent.

---

## Data sources

| Data | Source | Endpoint / file | Cache TTL |
|---|---|---|---|
| Risk-free rates | **FRED** | `https://api.stlouisfed.org/fred/series/observations` — series `DGS10`, `IRLTLT01EZM156N`, `IRLTLT01GBM156N`, `IRLTLT01CHM156N` | 1 day |
| Credit spreads | **FRED** | Series `BAMLC0A1CAAA` (AAA), `BAMLC0A2CAA` (AA), `BAMLC0A3CA` (A), `BAMLC0A4CBBB` (BBB), `BAMLH0A1HYBB` (BB), `BAMLH0A2HYB` (B), `BAMLH0A3HYC` (CCC+) | 1 day |
| Industry βs, D/E, taxes | **Damodaran** (NYU Stern) | `betas.xls` + `betaEurope.xls` → [damodaran-industries.json](server/src/data/damodaran/damodaran-industries.json) (96 US + Europe overlay) | Annual snapshot |
| Country ERP, CRP | **Damodaran** | `ctryprem.xlsx` → [damodaran-country-risk.json](server/src/data/damodaran/damodaran-country-risk.json) (158 countries) | Annual snapshot |
| Country marginal tax | **Damodaran** | `countrytaxrates.xls` (+ Tax Foundation patches, e.g. Russia 25% override) → [damodaran-tax-rates.json](server/src/data/damodaran/damodaran-tax-rates.json) (251 countries) | Annual snapshot |
| ICR → rating table | **Damodaran** | Hand-transcribed from `ratings.htm` → [damodaran-icr-rating.json](server/src/data/damodaran/damodaran-icr-rating.json) (15 tiers × 2 tables) | Annual snapshot |
| Kroll βs + ERP + size premiums | **Kroll** | [kroll-data.json](server/src/data/kroll/kroll-data.json) (full-info β per industry, size-premium table) | Annual snapshot |
| EM local 10Y yields | Central banks, Trading Economics | [em-risk-free-rates.json](server/src/data/em-risk-free-rates.json) (20 countries) | Manual |
| Company profile + D/E + tax | **FMP** (Financial Modeling Prep) | `/stable/profile?symbol=X`, `/stable/ratios-ttm?symbol=X` | 7 days |
| Balance sheet + income statement | **FMP** | `/stable/balance-sheet-statement?symbol=X&limit=1`, `/stable/income-statement?symbol=X&limit=1` | 30 days |
| Historical prices | **FMP** | `/stable/historical-price-eod/full?symbol=X&from=Y&to=Z` (SPY for S&P 500) | 7 days (stocks), 30 days (benchmark) |
| Company name / ticker search | **FMP** | `/stable/search-name?query=X`, `/stable/search-symbol?query=X` | 1 day |
| ISIN → ticker resolution | **OpenFIGI** | `POST https://api.openfigi.com/v3/mapping` (free, 25 req/min, no key) | 7 days |

### Refreshing the Damodaran data

The XLS files live in [scripts/Damodaran/](scripts/Damodaran/). To update after a new Damodaran
annual release:

```bash
# Drop fresh betas.xls, betaEurope.xls, ctryprem.xlsx, countrytaxrates.xls into scripts/Damodaran/
cd wacc-calculator
node scripts/regenerateDamodaran.mjs
```

Regenerates all four Damodaran JSONs with the new `lastUpdated` date. Tax Foundation patches
and Russia override are re-applied.

### API quota budget

Free-tier FMP allows **250 requests/day per key**. A typical full WACC calculation with 5 peers
costs:

| Call | Count |
|---|---|
| Company profile | 5 × 1 = 5 |
| Historical prices (per peer) | 5 × 1 = 5 |
| Historical prices (benchmark SPY) | 1 |
| ratios-ttm (US peers only) or balance-sheet + income-statement | ≤ 5 × 2 = 10 |
| ISIN resolution (if used) | 1 per ISIN |
| **Total (worst case)** | **~21 per fresh calc** |

With 7-day company cache and 30-day statement cache, repeat calcs with the same peers cost 0.
The app can comfortably do ~10–12 fresh full-peer calculations per day on a free FMP key.
Upgrading to the Starter plan ($19/mo) unlocks international `ratios-ttm` + `balance-sheet` (no
more "industry-proxy" for BP.L / TTE.PA / 0857.HK) and removes the daily cap.

---

## Architecture

**Single-service deployment.** One Node process (Express on port 3001 in production) serves
both `/api/*` and the built React SPA from `server/src/public/`. No CORS in production, no
separate CDN, no reverse proxy.

```
┌──────────────────────────────────────────────────────┐
│   Railway single container                           │
│   ┌──────────────────────────────────────────────┐   │
│   │  Express (tsx src/index.ts)                  │   │
│   │  ├─ /api/*   → waccComposer + services       │   │
│   │  ├─ /*       → static server/src/public/     │   │
│   │  └─ middleware: helmet, compression,         │   │
│   │     express-rate-limit (100 req / 15 min)    │   │
│   └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
         ▲                       ▲                  ▲
         │                       │                  │
    ┌────┴─────┐          ┌──────┴──────┐    ┌──────┴──────┐
    │  FRED    │          │  FMP /stable │    │  OpenFIGI   │
    │  (Rf,    │          │  (profile,   │    │  (ISIN →    │
    │  spreads)│          │  historical, │    │  ticker)    │
    │  cache   │          │  statements) │    │  cache 7d   │
    │  1d      │          │  cache 7–30d │    │             │
    └──────────┘          └──────────────┘    └─────────────┘
```

### Runtime choice: tsx, not tsc

The server runs `tsx src/index.ts` directly — no `tsc` compile step. This avoids the "`.ts`
extension in imports" pain (the project uses ESM with explicit `.ts` imports so client and
server can share [shared/wacc.ts](shared/wacc.ts)) and keeps the build pipeline trivial. tsx is
declared in regular `dependencies` (not devDeps) so Railway's production install doesn't prune
it.

### Live recalc pipeline

1. User edits any input in the left pane
2. [useWaccForm](client/src/hooks/useWaccForm.ts) updates `inputs` state + autosaves to
   localStorage (debounced 300 ms)
3. [useWaccResult](client/src/hooks/useWaccResult.ts) watches `inputs`, fingerprints the
   "heavy" subset (valuationDate, currency, country, industry, tickers), picks 250 ms or 800 ms
   debounce accordingly
4. `POST /api/calculate` fired through [postCalculate](client/src/api/wacc.ts) with an
   AbortController — any in-flight request on the next edit is cancelled
5. Server's [composeWACC](server/src/services/waccComposer.ts) resolves both bounds
   concurrently (`Promise.all([resolveBound(min), resolveBound(max)])`), each internally doing
   parallel data fetches (Rf + ERP + β + CoD + tax + premiums), returns `WACCResult`
6. Result renders in the right pane; loading state reduces opacity to 70% without clearing
   values so users never see a blank table mid-edit
7. On error, the last good result stays visible; an amber banner shows "Live data temporarily
   unavailable — showing last successful calculation"

### State persistence hierarchy

On app mount, [sessionState.loadInitialState](client/src/utils/sessionState.ts) picks the form
state in priority order:

1. **URL hash** (`#state=<base64url>`) — shared link from a colleague
2. **localStorage** (`wacc-calculator-state-v1`)
3. **INITIAL_INPUTS** — defaults (Oil/Gas E&P, United States, USD, Hard currency, …)

A separate `wacc-calculator-expanded-sections-v1` key stores which bound sections the user has
expanded. Reset clears both keys, the URL hash, the in-memory `expandedStore`, and broadcasts a
`wacc-calculator-reset` CustomEvent that Bound* components listen for to collapse their local
UI state.

---

## Project layout

```
wacc-calculator/
├── client/                          # React SPA
│   ├── index.html                   # SEO meta, theme-color #1C3A2F, Clariva fonts
│   ├── tailwind.config.js           # Clariva palette: forest/sage/cream/gold tokens
│   ├── vite.config.ts               # build.outDir → ../server/src/public
│   ├── public/favicon.svg           # Gold W on forest
│   └── src/
│       ├── App.tsx                  # Layout shell + Toast host
│       ├── main.tsx                 # ErrorBoundary + MetadataProvider
│       ├── context/
│       │   └── MetadataContext.tsx  # /api/metadata hydration (industries, countries, EM, Kroll…)
│       ├── hooks/
│       │   ├── useWaccForm.ts       # Form state + localStorage autosave + URL-hash hydrate
│       │   ├── useWaccResult.ts     # Debounced live-recalc (250/800 ms)
│       │   └── useRiskFreeRate.ts   # /api/risk-free-rate previewer
│       ├── api/wacc.ts              # postCalculate + AbortSignal
│       ├── components/
│       │   ├── layout/              # Header (Clariva editorial), Layout (2-pane)
│       │   ├── decor/DiagPattern.tsx# Gold diagonal SVG pattern (report-band overlay)
│       │   ├── inputs/
│       │   │   ├── GeneralParametersSection.tsx
│       │   │   ├── Section.tsx
│       │   │   ├── InputForm.tsx
│       │   │   ├── fields/          # TextField / NumberField / PercentField / SearchableSelect / RadioGroup / Checkbox
│       │   │   └── bound/           # BoundColumn + {CapitalStructure, Beta, Erp, CostOfDebt, TaxRate, Premiums} + BoundSection + ComparablePreview
│       │   ├── results/             # ResultTable (centrepiece), WACCSummaryLine, WACCRangeBar, CapitalStructurePie, CostOfEquityWaterfall, AnalysisSection, ChartPlaceholder
│       │   ├── export/ExportBar.tsx # Share + Export Excel + Export PDF + Reset
│       │   ├── Toast.tsx            # Minimal toast stack
│       │   ├── ShareModal.tsx       # Clipboard fallback
│       │   └── ErrorBoundary.tsx
│       ├── utils/
│       │   ├── sessionState.ts      # localStorage + URL hash + RESET_EVENT
│       │   ├── resolveBoundForUI.ts # Mirrors server resolver for snappy UI previews
│       │   ├── format.ts            # fmtPercent/fmtBeta — em-dash for 0/null
│       │   ├── excelExport.ts       # 4-sheet workbook with native formulas
│       │   ├── pdfExport.ts         # window.print() + print.css
│       │   └── wacc.test.ts         # Client-side formula tests
│       ├── index.css                # Tailwind + body font (Outfit), cream background
│       └── print.css                # Single-page A4 landscape print CSS
│
├── server/                          # Express API + static host
│   └── src/
│       ├── index.ts                 # App bootstrap (helmet, compression, rate-limit, static, SPA fallback)
│       ├── routes/index.ts          # All /api/* endpoints (11 routes)
│       ├── services/
│       │   ├── waccComposer.ts      # Orchestrator: builds 15 result rows for MIN + MAX
│       │   ├── riskFreeRate.ts      # FRED 10Y series + EM local override
│       │   ├── creditSpread.ts      # FRED ICE BofA OAS per rating bucket
│       │   ├── comparableBeta.ts    # lookupCompany + calculateComparableBeta orchestration
│       │   ├── betaCalculator.ts    # Pure OLS regression + 3-window rolling + stability
│       │   ├── historicalPrices.ts  # FMP historical-price-eod/full + monthly resample
│       │   ├── financialStatements.ts # BS + IS cascade (firm → BS → market-cap → industry proxy)
│       │   ├── openFigi.ts          # ISIN → ticker
│       │   ├── damodaranData.ts     # JSON loaders for industries, countries, tax, ICR
│       │   ├── krollData.ts         # Kroll JSON loader (β, ERP, size premiums)
│       │   ├── emRates.ts           # EM RF JSON loader + DEVELOPED_COUNTRIES set
│       │   ├── cache.ts             # Simple in-memory TTL cache
│       │   ├── yahooFinance.ts      # Legacy, unused — kept in case FMP quota ever bites harder
│       │   └── betaCalculator.test.ts
│       └── data/
│           ├── damodaran/*.json     # Annual snapshots
│           ├── kroll/*.json         # Annual snapshots
│           └── em-risk-free-rates.json
│
├── shared/                          # Used by both client and server
│   ├── types.ts                     # WACCInputs, WACCResult, BetaAnalysis, CreditRating, …
│   └── wacc.ts                      # Pure formula library (CAPM, Hamada, WACC, ICR, ...)
│
├── scripts/
│   ├── Damodaran/                   # Source XLS files
│   └── regenerateDamodaran.mjs      # Rebuilds all 4 Damodaran JSON snapshots
│
├── .github/workflows/ci.yml         # Test + build on push/PR
├── nixpacks.toml                    # Railway build: install devDeps, run build, start via tsx
├── railway.json                     # Railway service config + /api/health check
├── package.json                     # Monorepo workspaces: client + server
├── CLAUDE.md                        # Detailed dev notes
└── README.md                        # This file
```

---

## API surface

All under `/api`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service + data-source status. Timestamp, uptime, environment, counts per source. |
| POST | `/calculate` | The main endpoint. Body: `WACCInputs`. Returns `WACCResult` with 15 rows. |
| GET | `/risk-free-rate?currency=USD&horizon=10Y&country=…&methodology=…` | Live Rf preview. |
| GET | `/em-rates` | Full EM RF data + list of developed countries. |
| GET | `/industries` | Damodaran industries merged with Kroll β (single source of truth for the dropdown). |
| GET | `/industry-info?name=…` | Full Damodaran + Kroll row for one industry. |
| GET | `/countries` | Damodaran country-risk list. |
| GET | `/country-info?name=…` | Full Damodaran row + tax rate for one country. |
| GET | `/company-lookup?ticker=…&valuationDate=…&industry=…` | Per-peer profile + calculated β + D/E + tax. |
| GET | `/company-search?q=…&limit=10` | Name/ticker/ISIN search. Returns candidate list for the UI autocomplete. |
| GET | `/metadata` | One-shot bundle: industries, countries, Kroll size premiums, EM rates, developed-country set, last-updated dates. Called once on app mount. |

Rate limit: 100 req per 15 min per IP on `/api/*`.

---

## Local development

```bash
# One-time
npm install
cp .env.example .env          # add FRED_API_KEY and FMP_API_KEY

# Dev — client Vite (5173) + server tsx watch (3001), Vite proxies /api → 3001
npm run dev
```

Open http://localhost:5173.

### Environment variables

- `FRED_API_KEY` — free at https://fred.stlouisfed.org/docs/api/api_key.html
- `FMP_API_KEY` — free at https://site.financialmodelingprep.com/register
- `PORT` — auto-set by Railway, defaults to 3001
- `NODE_ENV=production` — enables helmet, compression, static-serve, SPA fallback

### Production build (local)

```bash
npm run build                 # Vite builds into server/src/public/
NODE_ENV=production npx tsx server/src/index.ts
# open http://localhost:3001
```

---

## Deployment

Deployed to **Railway** as a single Node service from [youloseman/wacc_tool](https://github.com/youloseman/wacc_tool).

- [railway.json](railway.json) — `builder: NIXPACKS`, `healthcheckPath: /api/health`, restart
  `ON_FAILURE` up to 10 times
- [nixpacks.toml](nixpacks.toml) — Node 20, `npm ci --include=dev` (devDeps like Vite needed for
  the build phase), `NODE_ENV=development` overridden for install/build so Vite isn't pruned,
  `NODE_ENV=production` at runtime
- GitHub Actions CI at [.github/workflows/ci.yml](.github/workflows/ci.yml) — runs `npm test` +
  `npm run build`. Satisfies Railway's "Wait for CI" toggle if enabled

Every push to `main` triggers a Railway rebuild. `railway up` from CLI works as a fallback if
the webhook fails to fire.

---

## Testing

```bash
npm test                      # Client + server vitest suites
```

- [shared/wacc.ts](shared/wacc.ts) — 8 unit tests on the pure formulas (CAPM, Hamada, WACC,
  ICR, rating mapping)
- [betaCalculator.test.ts](server/src/services/betaCalculator.test.ts) — 9 unit tests on the
  regression engine: known-beta recovery, zero-correlation edge, monthly returns, date
  alignment, stability classification, rolling-window date ranges

---

## Known limits and caveats

### FMP free tier

Fundamental endpoints (`ratios-ttm`, `balance-sheet-statement`, `income-statement`,
`key-metrics`) are **gated for non-US tickers** — they return HTTP 402. The cascade in
[comparableBeta.ts](server/src/services/comparableBeta.ts) falls back to Damodaran industry D/E
+ country marginal tax with a red `proxy D/E` badge. Upgrading to FMP Starter ($19/mo) unlocks
them globally and automatically — no code changes needed.

### Historical-prices endpoint

FMP's old `/api/v3/historical-price-full/…` is now legacy-gated. The app uses the new
`/stable/historical-price-eod/full` which returns `close` only (not `adjClose`). Dividends are
not adjusted out, which shifts β slightly (≈ 10–30 bp for high-yield stocks). Acceptable for a
bottom-up median from a peer set.

### S&P 500 benchmark

Benchmark symbol is **SPY** (ETF proxy for S&P 500) rather than `^GSPC` directly — the ETF is
reliably available on FMP's free tier and tracks the index within a few basis points. The
benchmark choice is deliberately fixed to S&P 500 even for non-US stocks: it measures
sensitivity to global market risk (standard bottom-up practice), not local market beta.

### Russia / sanctioned countries

Damodaran dropped Russia from `ctryprem.xlsx` after Moody's rating suspension. The
regeneration script manually injects Russia with Ca rating, 10.19% default spread, 14.42%
ERP (as of Jan 2026). The Russian statutory corporate tax rate rose to 25% in 2025 — same
script override.

### Rate limiting

`/api/*` is limited to 100 requests per 15 min per IP via `express-rate-limit`. Sufficient for
interactive use; tight enough to prevent accidental quota burn during autoreload loops.

### PDF export

Uses `window.print()` with an aggressively-shrunk [print.css](client/src/print.css) to fit the
full result table on a single A4 landscape page. Charts (waterfall, pie, range bar) are hidden
in print since they duplicate information already in the KPI strip and table. For a report with
charts, use the Excel export instead (separate Chart Detail sheet).

### localStorage privacy

`wacc-calculator-state-v1` and `wacc-calculator-expanded-sections-v1` live in the user's
browser — never touched by the server. Private-browsing mode degrades gracefully (setItem calls
silently no-op; the app works without persistence). URLs generated by the Share button base64-
encode the full inputs into the hash — they're cryptic but not encrypted. Don't share URLs
that encode confidential company names / sizes if the recipient shouldn't see them.

---

## License

MIT.
