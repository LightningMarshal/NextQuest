# stooge-log

Web application for tracking and coordinating gaming with friends: a shared
game backlog with point values, anonymous voting to pick what's next,
burn-rate tracking, and session scheduling with attendance.

**Stack**
- Next.js 16 (App Router, TypeScript) on Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- Neon Postgres + Drizzle ORM
- Better Auth (sign in via Google)
- Tailwind CSS v4 + shadcn/ui-style components, Recharts

**Docs**
- [Roadmap](docs/ROADMAP.md) — what's built and what's next, phase by phase
- [Architecture](docs/ARCHITECTURE.md) — data model, metadata pipeline, deployment shape
- [Decisions](docs/DECISIONS.md) — points formula, voting mechanics, and other ADRs
- [CLAUDE.md](CLAUDE.md) — conventions and invariants for AI-assisted development

## Quickstart

```bash
npm install

# Workers runtime secrets (dev/preview): DB, auth, Google OAuth
cp .dev.vars.example .dev.vars

# Node-side tooling (drizzle-kit): DATABASE_URL only
cp .env.example .env

# Apply the schema to your Neon database
npm run db:migrate

npm run dev          # Next dev server → http://localhost:3000
```

## Useful commands

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run preview      # build + run under workerd (wrangler dev) — do this before deploying
npm run deploy       # build + deploy to Cloudflare Workers
npm run db:generate  # generate a migration after editing src/db/schema/
npm run db:studio    # browse the database
```

## License

[GPL-3.0](LICENSE)
