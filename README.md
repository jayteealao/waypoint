# Waypoint

Waypoint is an AI-powered adaptive learning application. Give it a goal — anything from "understand TCP/IP" to "learn to cook Thai food" — and it interviews you about what you already know, builds a personalized course roadmap, teaches through progressively streamed lessons with interactive checkpoints, quizzes you with spaced-repetition-based pacing, and tracks your mastery concept by concept.

Built on TanStack Start + Cloudflare Workers. OAuth-only sign-in. AI generation via OpenRouter.

## Prerequisites

- **Node.js** 22+ (tested: 22.15.0)
- **pnpm** 10+ (tested: 10.26.2)
- A Cloudflare account with Workers + D1 access
- Google and GitHub OAuth apps (for sign-in)
- An OpenRouter API key (for AI generation)

## Quick Start

```bash
# Install exact-pinned dependencies
pnpm install

# Start the dev server
pnpm dev
# → http://localhost:3000
```

## Running Tests

```bash
# Unit / component tests (Vitest)
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# End-to-end tests (Playwright, requires dev server)
pnpm test:e2e

# Supply-chain audit
pnpm audit
```

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the three external prerequisites:

```bash
cp .env.example .env.local
```

Populate each value — see `.env.example` for descriptions and setup links.

## Deployment

```bash
# Build for production
pnpm build

# Deploy to Cloudflare Workers
pnpm deploy
```

Production secrets (not in `.env.local`) must be pushed via Wrangler:

```bash
wrangler secret put OPENROUTER_API_KEY
wrangler secret put BETTER_AUTH_SECRET
# etc.
```

## Documentation

- `docs/architecture.md` — stack decisions, data flow, widget-registry trust model
- `docs/pedagogy.md` — how the tutoring rules map to Waypoint's mechanics
- `docs/reference.md` — environment variables, widget catalog, quota config

*(These files are created in later development slices.)*
