# Waypoint

Waypoint is an AI-powered adaptive learning application that interviews you about your goal, builds a personalized course roadmap, teaches through progressively streamed lessons with interactive checkpoints, and tracks your progress with spaced-repetition-based mastery tracking — all in a web app built on TanStack Start and Cloudflare Workers.

## Prerequisites

- **Node.js** 22+ (exact: 22.15.0 tested)
- **pnpm** 10+ (exact: 10.26.2 tested)
- A Cloudflare account (Workers + D1)
- Google and GitHub OAuth apps (for sign-in)
- An OpenRouter API key (for AI generation)

## Quick Start

```bash
# Install dependencies (exact versions from lockfile)
pnpm install

# Start the development server
pnpm dev
# → http://localhost:3000
```

## Running Tests

```bash
# Vitest unit / component tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Playwright end-to-end tests (requires dev server)
pnpm test:e2e

# Supply-chain audit
pnpm audit
```

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the three external prerequisites:

```bash
cp .env.example .env.local
```

Then populate the values — see `.env.example` for descriptions of each variable.

## Documentation

See `docs/` for:
- `docs/architecture.md` — stack overview, data flow, trust model
- `docs/pedagogy.md` — how the tutoring rules map to Waypoint's mechanics
- `docs/reference.md` — environment variables, widget catalog, quota config
