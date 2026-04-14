# WACC Calculator — Specification

## 1. Product Description

A web application that calculates Weighted Average Cost of Capital (WACC)
for a given company based on user inputs. The tool provides a MIN–MAX range
by comparing results from multiple beta sources:
Damodaran, Kroll, and Comparable Companies (bottom-up beta).

Output format: an on-screen table matching the structure of professional
valuation reports (KPMG/EY/Deloitte style), with Excel export capability.

## 2. Target Output Table (English only)

The result table has 5 columns:

| Column | Name | Description |
|--------|------|-------------|
| A | Discount Rate Component | Name of the WACC component |
| B | MIN | Lower bound value |
| C | MAX | Upper bound value |
| D | Description | What this parameter means and how it was derived |
| E | Source | Data source (FRED, Damodaran, Kroll, Calculation, User input) |

### Rows in the result table:

| # | Component | Type | MIN/MAX logic |
|---|-----------|------|---------------|
| 1 | Risk-free rate | Data | Same for both |
| 2 | Equity risk premium | Data | min/max across Damodaran & Kroll |
| 3 | Beta (unlevered) | Data | min/max across Damodaran, Kroll, Comparables |
| 4 | Beta (relevered) | Formula | derived from row 3 |
| 5 | Small size risk premium | Data | from Kroll (or 0 if Large) |
| 6 | Country risk premium | Data | from Damodaran |
| 7 | Currency risk premium | Data/User | user can override |
| 8 | Specific risk premium | User input | user enters manually |
| 9 | **Cost of Equity** | **Formula** | **calculated from above** |
| 10 | Cost of Debt (pre-tax) | Data/Formula | Rf + credit spread, or user input |
| 11 | Tax rate | Data | from Damodaran or user input |
| 12 | **Cost of Debt (after-tax)** | **Formula** | **calculated** |
| 13 | Share of Equity | Formula | from D/E ratio |
| 14 | Share of Debt | Formula | 1 − Share of Equity |
| 15 | **WACC** | **Formula** | **final result** |

### Table styling:
- Header row: dark navy background (#00338D), white bold text
- Sub-header: "(Post-tax, [Currency], Nominal)" + "MIN" / "MAX" labels
- Rows 9, 12: bold text
- Row 15 (WACC): bold text, light highlight background
- All percentages: format "X.XX%"
- Betas: format "0.XX" (not percentage)

## 3. User Input Form

### Required inputs:
- **Valuation date** — date picker, default: today
- **Company / CGU name** — free text
- **Currency** — dropdown: USD, EUR, GBP, CHF
- **Country (HQ)** — dropdown (list of countries)
- **Country of operations** — dropdown (can differ from HQ)
- **Industry** — dropdown (Damodaran industry list, ~95 industries)
- **Company size** — radio: Large / Mid / Small / Micro
- **D/E ratio source** — radio: "Industry average (Damodaran)" / "Custom"
- **Custom D/E ratio** — number input (visible only if Custom selected)

### Cost of Debt inputs:
- **Method** — radio: "Via ICR (EBIT & Interest)" / "Via credit rating" / "Direct input"
- If ICR method:
  - EBIT — number input
  - Interest expense — number input
- If credit rating method:
  - Rating dropdown (AAA, AA+, AA, ... , CCC, CC, C, D)
- If direct input:
  - Cost of debt pre-tax — percentage input

### Beta source selection:
- **Checkboxes** (multi-select, at least one required):
  - ☑ Damodaran (industry average)
  - ☑ Kroll
  - ☑ Comparable companies
- If "Comparable companies" is checked:
  - Ticker input field — comma-separated (e.g. "CVX, XOM, TTE, BP, COP")

### Optional overrides:
- Tax rate — number input (pre-filled from Damodaran by country)
- Specific risk premium — number input (default 0%)
- Currency risk premium — number input (default 0%)

## 4. Milestones

### Milestone 1 — Foundation (Stage 1) ← CURRENT
- [ ] Project scaffolding: React + Vite + Express + TypeScript
- [ ] UI layout: two-panel design (inputs left, results right)
- [ ] Input form with all fields and validation
- [ ] Result table component matching the target structure
- [ ] Mock calculation engine (hardcoded data, real formulas)
- [ ] MIN/MAX logic working with mock beta values
- [ ] Responsive design (works on desktop and tablet)
- [ ] Description and Source columns populated with placeholder text

### Milestone 2 — Real Data
- [ ] FRED API integration (risk-free rates, credit spreads)
- [ ] ECB / BoE integration for EUR/GBP risk-free rates
- [ ] Damodaran datasets parsed and loaded (beta, D/E, ERP, tax, CRP)
- [ ] Kroll data loaded from JSON
- [ ] FMP/Newton Analytics API for comparable company betas
- [ ] ICR → Credit Rating mapping table

### Milestone 3 — Export & Visualization
- [ ] Excel export matching the target table format (5 columns)
- [ ] Excel formulas (not hardcoded values)
- [ ] Additional Excel sheets (Inputs, Beta Detail, Sources)
- [ ] Waterfall chart for Cost of Equity decomposition
- [ ] WACC range bar chart (Damodaran vs Kroll vs Comparables)
- [ ] PDF export option

### Milestone 4 — Deploy & Polish
- [ ] Railway deployment configuration
- [ ] Environment variables for API keys
- [ ] Loading states and error handling
- [ ] Caching layer (risk-free rate cached for 24h)
- [ ] Mobile-responsive polish
- [ ] SEO and meta tags
