# WACC Calculator

Professional Weighted Average Cost of Capital calculator with MIN/MAX range
estimation from multiple data sources. Built for valuation professionals.

## Features

- **Multiple beta sources** — Damodaran (96 industries, with Europe overlay),
  Kroll size premiums, or calculated bottom-up from comparable peers (5Y/3Y
  monthly returns vs S&P 500, 3 rolling windows, stability + R² + t-stat diagnostics)
- **Hard-currency and local-currency methodology** — auto-switches to local
  government bond yield + CRP = 0 for emerging markets (20 countries)
- **Independent MIN/MAX bounds** — configure capital structure, beta, ERP, cost of
  debt, tax, and size/country/currency/specific premiums separately per bound
- **Live market data** — risk-free rates and credit spreads from FRED (cached)
- **Excel export** — native formulas, four sheets, custom number format for zeros
- **PDF export** — print-optimized layout
- **Visualization** — CoE waterfall, WACC range bar, capital-structure pie

## Data Sources

| Data | Source | Update frequency |
|---|---|---|
| Risk-free rates | FRED (DGS10, FEDFUNDS, …) | Live (cached 24h) |
| Credit spreads | FRED (BAMLC0A*) | Live (cached 24h) |
| Industry βs, D/E, taxes | Damodaran (NYU Stern) | Annual snapshot |
| Country ERP, CRP | Damodaran | Annual |
| Size premiums | Kroll | Annual |
| Company profile & D/E | FMP (Financial Modeling Prep) | Live (cached 7d) |
| Historical prices | FMP `/stable/historical-price-eod/full` | Live (cached 7d, 30d for benchmark) |
| EM local 10Y yields | Static snapshot in [em-risk-free-rates.json](wacc-calculator/server/src/data/em-risk-free-rates.json) | Manual |

## Local Development

```bash
npm install
cp .env.example .env    # add FRED_API_KEY and FMP_API_KEY
npm run dev             # client on :5173, server on :3001
```

Open http://localhost:5173.

## Production Build (local)

```bash
npm run build        # builds client into server/src/public/
npm run start        # NODE_ENV=production tsx src/index.ts, port 3001
```

Or combined: `npm run start:prod` — does both and serves from one port.

## Deploy to Railway

1. Push to GitHub.
2. Create a Railway project from the GitHub repo.
3. In **Variables**, set:
   - `FRED_API_KEY`
   - `FMP_API_KEY`
   - `NODE_ENV=production`
4. Railway auto-detects Node via Nixpacks — [railway.json](railway.json) and
   [nixpacks.toml](nixpacks.toml) configure the build.
5. **Settings → Networking → Generate Domain** — app goes live.

Every push to `main` auto-deploys. Health check hits `/api/health`.

## Architecture

**Single-service deployment.** Express serves both `/api/*` and the built React
SPA from `server/src/public/`. No separate CDN, no CORS in production.

- `client/` — React + Vite + Tailwind + Recharts
- `server/` — Express + tsx (no compile step; runs TypeScript directly)
- `shared/` — types and pure-math helpers used by both
- `server/src/data/` — Damodaran/Kroll/EM JSON snapshots (regenerate via
  [scripts/regenerateDamodaran.mjs](wacc-calculator/scripts/regenerateDamodaran.mjs))

## Tests

```bash
npm test
```

Runs both client (vitest on `shared/wacc.ts`) and server (vitest on
`betaCalculator.ts`) suites.

## License

MIT.
