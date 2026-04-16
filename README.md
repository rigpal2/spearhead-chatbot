# Spearhead Technical Chatbot

RAG-powered chatbot for Spearhead premium workstring connections by RigPal.

**Live:** https://spearhead-chatbot.vercel.app (will migrate to spearhead.rigpal.com)

## Architecture

```
User Query → Next.js API Route → BM25 Search (in-memory) → Claude Haiku → Streamed Response
```

- **Corpus**: 69 chunks from 12 wiki sources (Spearhead specs, torque data, competitor comparisons)
- **Search**: BM25 with OCTG domain synonyms, metadata filtering, Spearhead boost
- **LLM**: Claude Haiku 4.5 with strict grounding prompt — only answers from corpus context
- **Frontend**: Next.js App Router, Tailwind CSS, SSE streaming, mobile-first

## Setup

```bash
npm install
cp .env.example .env.local  # Then add your API key
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Get from console.anthropic.com |

### Setting on Vercel

```bash
vercel env add ANTHROPIC_API_KEY production
# Paste the key when prompted
vercel --prod --scope alex-5476s-projects
```

## Updating the Corpus

When wiki data changes, regenerate chunks:

```bash
node scripts/ingest.mjs
# Then redeploy
vercel --prod --scope alex-5476s-projects
```

## Coverage

- 2-3/8" 5.95# P-110 Spearhead (full specs)
- 2-7/8" 7.90# P-110 Spearhead (full specs)
- Torque data (MUT, rotating, yield, friction factors)
- Design features (double-shoulder, inertia-welded TJ, internal torque shoulder)
- Wear life analysis (Spearhead vs PH6)
- Competitor comparisons (PH6, BEN-HT6, CS, TTS6-Black, FSS-265)
- Materials and grades (P-110, grade corrections, 125 ksi)
- Thread compound (BOL 2000, JetLube ThreadSeal)
- Recut options (TTXS, TTNY, TTUS, TTUS-HT)
- Licensee program

## Limitations

- Only 2-3/8" and 2-7/8" Spearhead data available
- No pricing, delivery, or sales information
- No internal business documents in corpus
