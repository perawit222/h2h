# H2H — Esports Edge & Integrity Terminal

A dark-mode Next.js (App Router, TypeScript, Tailwind CSS) esports betting analytics and market integrity terminal covering **CS2, Valorant, League of Legends, and Dota 2**.

## Modules

### 1. Suspicious Bet & Anomaly Radar (Live Polymarket Data, No API Key Required)
- Connects server-side to **Polymarket's Public Gamma API** (`https://gamma-api.polymarket.com/events`) with `revalidate: 120`.
- Filters active Esports markets (`CS2`, `Valorant`, `LoL`, `Dota 2`) and computes a **Suspicion Score (0–100)** from:
  - 1h / 24h implied probability swings
  - 24h volume-to-liquidity spikes
  - Low-tier / qualifier anomalies & heavy underdog odds drifts
- Interactive filterable feed with Recharts visualizations, 24h probability trend sparklines, alert tags, direct Polymarket links, and automatic `Live Polymarket Feed` vs `Fallback Mode` badge.

### 2. Daily Esports Schedule & AI Betting Analyzer
- Daily schedule hub for **Valorant, CS2, LoL, and Dota 2** displaying local timezone match times, tournament tiers, formats (`Bo1` / `Bo3` / `Bo5`), and moneyline odds.
- Auto-fetches live/pro Dota 2 matches from **OpenDota Public API** (`revalidate: 300`) merged with curated multi-title match telemetry.
- Clicking any match opens the **Betting Value & Risk Drawer**:
  - **Opportunity vs. Risk Meter** (Interest Score 1–10, Estimated Edge %, Risk Level, Fair vs. Market Odds)
  - **4-Pillar Breakdown**: Recent Form, Head-to-Head (H2H), Stats & Map/Draft Edge, and Narratives & "Curses"
  - Uses a built-in **Deterministic Quant Analyzer** by default, and automatically upgrades to **Gemini AI** when `GEMINI_API_KEY` is added to `.env.local`.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
