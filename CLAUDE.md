# WACC Calculator

## Project Overview
A professional WACC (Weighted Average Cost of Capital) calculator web application.
Users input company parameters and receive a MIN–MAX WACC range based on
multiple data sources (Damodaran, Kroll, Comparable Companies).

## Tech Stack
- Frontend: React 18 + TypeScript + Tailwind CSS
- Backend: Node.js + Express
- Excel export: SheetJS (xlsx)
- Charts: Recharts
- Build: Vite
- Deploy target: Railway

## Code Style
- TypeScript strict mode
- Functional components with hooks
- Named exports (not default)
- Comments in English
- UI text in English only
- Use descriptive variable names for financial terms
  (e.g. `unleveredBeta`, `equityRiskPremium`, not `b` or `erp`)

## Key Financial Formulas
- Beta relevered = Beta unlevered × (1 + (1 − taxRate) × debtToEquity)
- Cost of Equity = riskFreeRate + betaRelevered × ERP + sizePremiun + countryRiskPremium + currencyRiskPremium + specificRiskPremium
- Cost of Debt (after-tax) = costOfDebtPreTax × (1 − taxRate)
- Share of Equity = 1 / (1 + debtToEquity)
- WACC = costOfEquity × shareOfEquity + costOfDebtAfterTax × shareOfDebt

## Environment Variables
- `FRED_API_KEY`: Required. Get from https://fred.stlouisfed.org/docs/api/api_key.html
- `FMP_API_KEY`: Required for comparable companies. Get from https://site.financialmodelingprep.com/register
- `PORT`: Server port (default 3001)

`.env` lives at the monorepo root and is loaded by the server at startup. See `.env.example` for the template.

## Data Sources
- **FRED API**: Live risk-free rates (DGS5/10/20/30, IRLTLT01* series) and credit spreads (BAMLC0A*, BAMLH0A*). Cached 24h.
- **Damodaran**: Static JSON in `server/src/data/damodaran/` (industries, country risk, tax rates, ICR→rating). Update annually in January.
- **Kroll**: Static JSON in `server/src/data/kroll/` (ERP, size premiums, industry betas). Update annually.
- **FMP API** (`/stable/profile`, `/stable/ratios-ttm`): Live comparable company beta / D/E / tax. Cached 7 days per ticker.

## WACC Methodology
Two approaches supported, selected via `waccMethodology` and auto-picked on country change:
- **Hard currency (USD/EUR/GBP/CHF)** — international Rf (FRED) + Damodaran country risk premium. Default for developed markets (US, UK, Germany, France, Switzerland, Netherlands, Scandinavia, Canada, Australia, NZ, Japan, Singapore, Hong Kong, Ireland, Belgium, Luxembourg, Austria).
- **Local currency** — local government bond yield used as Rf, CRP set to 0 (embedded in local Rf). Default for emerging markets. For Cost of Debt the client auto-switches to "Direct Input" and pre-fills with `central_bank_rate + 3%`; a yellow warning appears if the user leaves CoD on ICR/Rating (which would use USD rates, unrealistic for local debt).

EM risk-free rates + central-bank rates stored in [server/src/data/em-risk-free-rates.json](wacc-calculator/server/src/data/em-risk-free-rates.json). Static snapshots; no live API. 20 countries currently: Russia, Brazil, India, China, Turkey, Mexico, South Africa, Indonesia, Argentina, Kazakhstan, Colombia, Chile, Peru, Philippines, Vietnam, Thailand, Malaysia, Nigeria, Egypt, Ukraine.

## Deployment
Single-service: Express serves the React SPA as static files.
- Build: `npm run build` — Vite outputs to [server/src/public/](wacc-calculator/server/src/public/)
- Start: `npm run start` — `tsx src/index.ts` (no tsc compile; production runtime uses tsx directly)
- Railway: [railway.json](railway.json) + [nixpacks.toml](nixpacks.toml); health check `/api/health`
- Env: `FRED_API_KEY`, `FMP_API_KEY`, `NODE_ENV`, `PORT`
- Production middleware: helmet (CSP off), compression, per-IP rate limit (100/15min on `/api`), global error handler

## Current Milestone
Stage 5: Production deployment. Single-service unified build, SEO meta + favicon, ErrorBoundary, enhanced `/api/health`, Railway config. Project feature-complete for v1.0.
