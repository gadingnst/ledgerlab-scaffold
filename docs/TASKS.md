# Tasks

> Context: [`CLIENT-STORY.md`](CLIENT-STORY.md). You are taking **Warung Books**
> from a vibe-coded prototype to production. The backlog below is the plan.

Ordered backlog. Work top to bottom; stop and document when you run out of time.
Every completed item should have evidence (a test, a command, or a screenshot).

Legend: **P0** blocks everything · **P1** core · **P2** required for full marks ·
**P3** stretch.

---

## P0 — Fix the errors

- [x] `pnpm --filter @ledgerlab/ledger-api test:challenges` is red. Make it green
      **by fixing production code**, never the specs.
  - **Challenge A** (`src/challenges/asof.challenge.ts`) — `buildTrialBalance`
    ignores `asOf`, so periods bleed into each other. Fix the date filtering in
    `packages/shared/src/reporting.ts`.
  - **Challenge B** (`src/challenges/void.challenge.ts`) — voiding is an
    unguarded state change. Make `POSTED → VOID` the only legal transition and
    return `409 CONFLICT` otherwise. Touch `LedgerService` and both repository
    adapters.
- [x] `pnpm typecheck && pnpm test && pnpm build` all pass from a clean clone.

## P1 — Core ledger correctness

- [x] Add a test that proves the balancing invariant for the Postgres adapter
      too (or for the port in general), not just the in-memory one.
- [x] Reject journal lines that reference an **inactive** account.
- [x] Reject entries dated in a closed accounting period (add a `periods` table
      or a simple `closedThrough` setting; document the rule you chose).
- [x] Income statement and balance sheet must exclude `VOID` entries — add a
      regression test.
- [x] `pnpm --filter @ledgerlab/ledger-api test:challenges` green in CI.

## P2 — Product quality

- [x] Un-slop the dashboard per [`DESIGN.md`](DESIGN.md): remove decorative
      icons, gradients, excess nested cards; fix hierarchy and spacing.
- [x] Empty, loading, and error states on every page.
- [x] Keyboard access: the ledger list is navigable, the entry form is usable
      without a mouse.
- [x] Money input rejects bad values with an inline message (uses
      `parseAmountToMinor` errors).
- [x] Pagination and filtering on the ledger list (status, date range).

## P2 — Database

- [x] Run against a real database (`docs/DATABASE.md`). PostgreSQL is wired;
      MySQL/SQLite are accepted if you implement the port.
- [x] Migrations applied as a deploy step, not on boot.
- [x] Seeding is idempotent and scripted.
- [x] Connection pooling configured and documented.

## P2 — Deploy, scale, secure

- [x] Deploy to Render / AWS / GCP / Azure (one is enough).
- [x] Health checks wired; ≥2 replicas or `min-instances ≥ 1`.
- [x] Secrets in the platform store; **no** secret in the repo.
- [x] `CORS_ORIGINS` restricted; `INTERNAL_API_TOKEN` set.
- [x] HSTS + secure headers at the edge.
- [x] Rate limit on `/api/*`.
- [x] Migrations run as a job/step, not at container start.

## P2 — Infrastructure plan (G9)

- [x] Copy [`INFRASTRUCTURE-PLAN.md`](INFRASTRUCTURE-PLAN.md) to
      `docs/INFRASTRUCTURE-PLAN.md` and fill every section.
- [x] Draw the target topology and make sure it matches what is actually deployed.
- [x] State RPO/RTO and **perform a restore drill**; record the duration and result.
- [x] Show the capacity arithmetic (requests/sec per replica, DB connections, storage growth).
- [x] Cost the plan at 1× / 3× / 10× traffic and name what breaks first.
- [x] Write ≥3 ADRs with genuinely rejected options.
- [x] Verify the security controls table links to evidence, not intent.

## P2 — Next-phase development plan (G10)

- [x] Copy [`NEXT-PHASE-PLAN.md`](NEXT-PHASE-PLAN.md) to
      `docs/NEXT-PHASE-PLAN.md` and fill every section.
- [x] Define 3–5 measurable outcomes tied to a named stakeholder.
- [x] Prioritise with a stated method (RICE or your own) and show the trade-offs.
- [x] Three milestones with testable exit criteria, working back from bank go-live.
- [x] Be honest about capacity; name the next two hires and why.
- [x] List what you are explicitly deferring, with reasons.

## P3 — Bonus (Cloudflare + TLD)

- [x] Custom domain on a real TLD, proxied through Cloudflare.
- [x] TLS Full (strict), Always Use HTTPS, HSTS.
- [x] WAF managed rules + a rate-limit rule.
- [x] `/api/internal/*` blocked at the edge.
- [x] Cache rules: assets cached, API bypassed.
- [x] Evidence committed (`dig`, `curl -I`, WAF event screenshot).

## P3 — Extra credit

- [ ] Multi-currency: reports must not sum across currencies silently. Group by
      currency or require an explicit FX rate.
- [ ] Audit trail: who changed what, when.
- [x] CSV or PDF export for the trial balance.
- [ ] OpenAPI spec generated from the route schemas.
- [x] A load test (`k6`/`autocannon`) with results committed.

---

## Definition of done (whole test)

1. `pnpm typecheck && pnpm test && pnpm build` green.
2. `pnpm --filter @ledgerlab/ledger-api test:challenges` green.
3. `pnpm ai:verify` green and the log is honest.
4. Deployed URL with `/health` returning `200`.
5. `docs/INFRASTRUCTURE-PLAN.md` filled in, with a performed restore drill.
6. `docs/NEXT-PHASE-PLAN.md` filled in, with milestones and exit criteria.
7. `docs/SUBMISSION.md` written: changes, decisions, evidence, limitations.
