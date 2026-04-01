# School Operating System

Multi-tenant school management SaaS platform. Single codebase, single deployment, strict tenant isolation via PostgreSQL Row-Level Security.

## Tech Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Backend  | NestJS + TypeScript (modular monolith)          |
| Frontend | Next.js 14+ (App Router) + Tailwind + shadcn/ui |
| Database | PostgreSQL 16+ with RLS                         |
| Cache    | Redis 7                                         |
| Search   | Meilisearch + PostgreSQL full-text fallback     |
| Queue    | BullMQ                                          |
| i18n     | English + Arabic (full RTL)                     |

## Prerequisites

- Node.js 24 LTS
- pnpm
- Docker Desktop

## Getting Started

The quick-start in this README is enough for a local boot, but the canonical contributor onboarding flow lives at [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

### 1. Clone and install

```bash
git clone <repo-url>
cd <repo>
pnpm install
```

### 2. Start local services

```bash
docker compose up -d
```

This starts PostgreSQL (port 5553), Redis (port 5554), and Meilisearch (port 5555).

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your secrets. See `plans/external-connections.md` for details on each variable.

### 4. Run database migrations

```bash
pnpm --filter prisma migrate dev
```

### 5. Seed development data

```bash
pnpm --filter prisma seed
```

### 6. Start development servers

```bash
pnpm dev
```

This starts:

- Frontend: http://localhost:5551
- API: http://localhost:5552

## Project Structure

```
root/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # NestJS backend
│   └── worker/           # BullMQ consumer service
├── packages/
│   ├── shared/           # Types, constants, Zod schemas
│   ├── prisma/           # Schema, migrations, seed
│   ├── ui/               # Shared component library
│   ├── eslint-config/    # Shared ESLint config
│   └── tsconfig/         # Shared TypeScript configs
├── plans/                # Implementation plans
├── scripts/              # Utility scripts
└── docker-compose.yml    # Local dev services
```

## Implementation Plans

This project is built phase-by-phase. See `plans/` for the full structure. Each phase has:

- **Instruction file** (`plans/phases-instruction/P{N}.md`) — what to build
- **Results file** (`plans/phases-results/P{N}-results.md`) — what was built
- **Testing instruction** (`plans/phases-testing-instruction/P{N}-testing.md`) — how to test
- **Testing result** (`plans/phases-testing-result/P{N}-testing-result.md`) — test outcomes

Build order: P0 → P1 → P2 → P3 → P4 → P5 → P6 → P6B → P7 → P8 → P9

## Additional Developer References

- [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) — full onboarding and local workflow
- [docs/api-versioning.md](docs/api-versioning.md) — when to stay in `/v1/` and when to create `/v2/`
- [architecture/README.md](architecture/README.md) — architecture document table of contents

## Seed Data (Development)

Two test schools are pre-configured:

|                         | School 1                  | School 2       |
| ----------------------- | ------------------------- | -------------- |
| **Name**                | Nurul Huda Quranic School | Midaad UlQalam |
| **Slug**                | nhqs                      | mdad           |
| **Locale**              | en                        | ar             |
| **Timezone**            | Europe/Dublin             | Africa/Tripoli |
| **Currency**            | EUR                       | LYD            |
| **Academic Year Start** | September                 | November       |

## Ports

| Service              | Port |
| -------------------- | ---- |
| Frontend (Next.js)   | 5551 |
| Backend API (NestJS) | 5552 |
| PostgreSQL           | 5553 |
| Redis                | 5554 |
| Meilisearch          | 5555 |
