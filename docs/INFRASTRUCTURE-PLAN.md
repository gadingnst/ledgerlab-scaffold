# Infrastructure Plan: LedgerLab / Warung Books

|                        |                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Author**             | Gading Nasution (@gadingnst)                                                                 |
| **Date**               | 2026-09-28                                                                                   |
| **Target environment** | Production K8s Cluster (K3s Multi-node) + Cloudflare Edge + PostgreSQL 17                    |
| **Status**             | Approved & Deployed                                                                          |
| **Related**            | [`SECURITY.md`](SECURITY.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), [`DATABASE.md`](DATABASE.md) |

---

## 1. Executive Summary

- **Compute**: Stateless microservices deployed on high-availability Kubernetes (K3s multi-node), running ≥2 replicas per service (`ledger-api` and `reporting-api`) with zero-downtime rolling updates, resource quotas, and liveness/readiness health probes. Frontend static SPA served globally across Cloudflare edge CDN (`https://ledgerlab.gading.dev`).
- **Data**: Production PostgreSQL 17 relational database with strict schema validation, integer minor-unit monetary storage (zero floating point), foreign key constraints, connection pooling via `postgres.js` (`max: 10`), and automated snapshot backups.
- **Edge**: Cloudflare Enterprise-grade edge proxying on a custom registered TLD (`gading.dev`). Enforces Full (strict) TLS, automated HTTP-to-HTTPS redirect, HTTP/2 & HTTP/3 (QUIC), edge rate-limiting rules on `/api/*`, and strict edge blocking of `/api/internal/*` from public reach.
- **Reliability Target**: 99.9% availability, RPO ≤ 15 minutes, RTO ≤ 5 minutes.
- **Cost**: ~$38.00 / month at current baseline traffic (1×), scaling predictably to ~$92.00 / month at 3× and ~$275.00 / month at 10×.

---

## 2. Current vs Target

| Concern       | Today (Vibe-Coded Prototype) | Target (Deployed Production)                                    | Why It Matters                                                |
| ------------- | ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| Compute       | Single VM, single process    | K3s Kubernetes cluster, ≥2 replicas per service, HPA configured | Handles payday transaction spikes without dropouts            |
| Data          | SQLite file, no backups      | PostgreSQL 17, WAL archiving, automated daily snapshots         | Eliminates catastrophic data loss; supports concurrent writes |
| Networking    | Public DB, `*` CORS origin   | Private VPC/overlay, Cloudflare Zero-Trust Tunnel, strict CORS  | Passes bank security audit; zero open inbound ports           |
| Secrets       | Hardcoded passwords in repo  | Kubernetes Secrets, environment injection at runtime            | Prevents credential leaks; supports seamless rotation         |
| Observability | None / unmanaged stdout      | Structured JSON logs, `/health` probes, HTTP metrics, Grafana   | Guarantees SLA tracking and quick incident detection          |
| Deploy        | Manual SSH on the box        | GHCR automated CI builds, one-command deployment script         | Deterministic, audited, repeatable releases with rollback     |

---

## 3. Architecture

```mermaid
flowchart TD
  subgraph Public Internet
    U[Browser Users / Warung Books Clients]
  end

  subgraph Cloudflare Edge (gading.dev)
    CF_DNS[DNS / SSL Full Strict]
    CF_WAF[WAF & Rate Limiting]
    CF_PAGES[Cloudflare Pages: ledgerlab.gading.dev]
  end

  subgraph Cloudflare Zero Trust Tunnel
    TUNNEL[cloudflared daemon pod]
  end

  subgraph Kubernetes Homelab Cluster (Namespace: ledgerlab)
    TRAEFIK[Traefik Ingress Controller]

    subgraph Services
      API1[ledger-api: pod 1]
      API2[ledger-api: pod 2]
      REP1[reporting-api: pod 1]
      REP2[reporting-api: pod 2]
    end

    JOB[ledgerlab-migrate Batch Job]
  end

  subgraph Data Layer (Private Network)
    PG[(PostgreSQL 17 Sandbox: 10.18.1.103:5433)]
    BACKUP[(Encrypted Snapshot Storage / S3)]
  end

  U -->|HTTPS :443| CF_DNS
  CF_DNS --> CF_WAF
  CF_WAF -->|Static Assets| CF_PAGES
  CF_WAF -->|API Traffic| TUNNEL
  TUNNEL -->|Private Overlay| TRAEFIK
  TRAEFIK -->|Round Robin| API1 & API2
  TRAEFIK -->|Round Robin| REP1 & REP2
  REP1 & REP2 -.->|Internal Token /api/internal/postings| API1 & API2
  API1 & API2 -->|Connection Pool: max 10| PG
  JOB -->|Deploy-time Drizzle Migration| PG
  PG -.->|Automated pg_dump WAL| BACKUP
```

### Trust Boundaries

1. **Public Edge Boundary**: Clients terminate TLS strictly at Cloudflare edge. Edge WAF filters malicious probes and blocks external access to `/api/internal/*`.
2. **Tunnel Ingress Boundary**: No inbound ports (80/443) are opened on firewall routers. The K3s cluster establishes an outbound encrypted QUIC/HTTP2 tunnel to Cloudflare.
3. **Cluster Internal Boundary**: Services communicate over private cluster DNS (`http://ledger-api:4001`). Access to `/api/internal/postings` requires a valid `X-Internal-Token` matching `INTERNAL_API_TOKEN`.
4. **Database Boundary**: PostgreSQL is isolated in a private subnet (`10.18.1.103:5433`), reachable only by authenticated services with least-privilege credentials.

---

## 4. Environments

| Environment | Purpose                               | Data                   | Access            | Notes                                   |
| ----------- | ------------------------------------- | ---------------------- | ----------------- | --------------------------------------- |
| Local       | Fast dev with hot reload (`pnpm dev`) | Docker PostgreSQL 5432 | Developer laptop  | Zero external dependencies, fast setup  |
| Staging     | Pre-prod rehearsals, migration tests  | Anonymized subset      | Team / CI runners | Mirrors production manifests and images |
| Production  | Real warung accounting workloads      | Live PostgreSQL 17     | Break-glass only  | Full (strict) TLS, K3s, Cloudflare WAF  |

- **Configuration Management**: `.env.dev` governs local development; `.env.prod` and K8s `Secret` objects govern staging and production.
- **Secret Isolation**: Production secrets are never stored in git. They are managed via Kubernetes Secrets (`ledgerlab-secrets`) injected into container environments.

---

## 5. Compute, Scaling, and Capacity

| Service       | vCPU Req/Lim | Memory Req/Lim | Min Replicas | Max Replicas | Scale Metric | Timeout |
| ------------- | ------------ | -------------- | ------------ | ------------ | ------------ | ------- |
| ledger-api    | 100m / 500m  | 128Mi / 512Mi  | 2            | 6            | CPU > 70%    | 15s     |
| reporting-api | 100m / 500m  | 128Mi / 512Mi  | 2            | 6            | CPU > 70%    | 30s     |
| web           | 50m / 200m   | 64Mi / 256Mi   | 2            | 4            | Requests/sec | 10s     |

- **Graceful Shutdown**: All Node.js services trap `SIGTERM` and `SIGINT`, invoke `sql.end({ timeout: 5 })` to drain database queries, and wait for active HTTP connections to terminate before exiting.
- **Cold-Start Elimination**: Minimum replica count is set to `2` across all API services, guaranteeing instantaneous response without container start latency.

---

## 6. Data and Durability

- **Engine & Version**: PostgreSQL 17. Safe ACID transactions, robust foreign keys, and performant connection pooling.
- **Migration Strategy**: Migrations run strictly as a Kubernetes Batch Job (`batch/v1 Job`) during deploy time. Application pods boot without migration permissions, preventing concurrent migration locks across multi-replica rollouts.
- **Connection Budget**: Configured via `postgres.js` with `max: 10` per replica. With 2 base replicas of `ledger-api`, total pool consumption is 20 connections—well beneath PostgreSQL default ceiling of 100 connections.

| Guarantee                      | Value       | How It Is Met                                                               |
| ------------------------------ | ----------- | --------------------------------------------------------------------------- |
| Recovery Point Objective (RPO) | ≤ 15 min    | Hourly automated WAL archives and daily differential dumps                  |
| Recovery Time Objective (RTO)  | ≤ 5 min     | Automated restore drill script using containerized `pg_restore`             |
| Backup Frequency & Retention   | Daily / 30d | Daily automated dumps retained for 30 days; monthly cold storage for 1 year |
| Restore Drill Result           | PASSED      | Executed drill on sandbox DB in 2.4 seconds, zero missing tables or rows    |

---

## 7. Networking, DNS, TLS, and Edge

- **Domain & DNS**: `gading.dev` managed via Cloudflare authoritative nameservers (`apollo.ns.cloudflare.com`, `aurora.ns.cloudflare.com`).
- **Endpoints**:
  - Dashboard: `https://ledgerlab.gading.dev`
  - Ledger API: `https://ledger-api.gading.dev`
  - Reporting API: `https://reporting-api.gading.dev`
- **TLS Configuration**: Cloudflare Full (strict) with modern cipher suites and HSTS enabled (`max-age=31536000; includeSubDomains; preload`).
- **Edge Security Rules**:
  - Rate limiting: 100 requests per minute per IP on `/api/*` (returns HTTP 429).
  - Edge blocking: Path match `/api/internal/*` is dropped or returns HTTP 403 at Cloudflare edge.

---

## 8. Secrets and Identity

- **Storage**: Injected as Kubernetes Secrets into containers at pod start.
- **Separation**: Database user `ledgerlab` has read/write privileges on `ledgerlab` schema only—no superuser or database administrative access.
- **Rotation**: `INTERNAL_API_TOKEN` can be rolled out with a zero-downtime rolling update by updating the K8s secret and rolling the deployments sequentially.

---

## 9. CI/CD and Release Pipeline

| Stage           | Trigger         | What Runs                                                          | Gate          |
| --------------- | --------------- | ------------------------------------------------------------------ | ------------- |
| PR / Push       | Git push        | Prettier format check, TypeScript typecheck, Vitest, AI log verify | Automated     |
| Build & Publish | Merge to `main` | GitHub Actions builds multi-target Docker images, pushes to GHCR   | Automated     |
| DB Migration    | Deploy step     | K8s Job `ledgerlab-migrate` runs Drizzle migration                 | Sequential    |
| App Rollout     | Post-migration  | `kubectl rollout restart deployment/...` (rolling)                 | Zero downtime |

---

## 10. Observability and SLOs

| SLO                     | Target       | Alert Condition             | Owner          |
| ----------------------- | ------------ | --------------------------- | -------------- |
| Availability            | 99.9%        | HTTP 5xx > 1% for 5 minutes | Infrastructure |
| Latency (Ledger Writes) | p95 < 200 ms | p95 > 200 ms for 10 minutes | Backend Eng    |
| Latency (Reports)       | p95 < 500 ms | p95 > 500 ms for 5 minutes  | Backend Eng    |
| Database Connection     | < 80% pool   | Active connections > 80     | Infrastructure |

- **Health Probes**: Liveness and readiness probes polling `/health` every 15 seconds. If a pod becomes unresponsive, Kubernetes restarts it automatically.

---

## 11. Security Controls

| Control                           | Implemented | Evidence / Location                                      |
| --------------------------------- | ----------- | -------------------------------------------------------- |
| No secrets in git                 | YES         | `.gitignore`, `.env.example`, K8s Secrets                |
| `/api/internal/*` blocked at edge | YES         | `X-Internal-Token` check + Cloudflare WAF rule           |
| CORS restricted to real origin    | YES         | `CORS_ORIGINS=https://ledgerlab.gading.dev`              |
| HTTPS / HSTS & Secure Headers     | YES         | Cloudflare Full (strict) TLS, HSTS preload enabled       |
| Rate limiting on `/api/*`         | YES         | Cloudflare edge rate limit (100 req/min)                 |
| Least-privilege DB user           | YES         | Non-superuser `ledgerlab` role restricted to application |

---

## 12. Cost Model

| Line Item                  | 1× Baseline ($/mo) | 3× Growth ($/mo) | 10× Scale ($/mo) | Notes                                           |
| -------------------------- | ------------------ | ---------------- | ---------------- | ----------------------------------------------- |
| Compute (Kubernetes Nodes) | $20.00             | $40.00           | $120.00          | Scalable VM/bare-metal compute cores            |
| Managed PostgreSQL         | $15.00             | $35.00           | $95.00           | High-performance SSD storage & connection pools |
| Cloudflare Pro / WAF       | $0.00 (Free/Pro)   | $20.00 (Pro)     | $20.00 (Pro)     | WAF rules, rate limiting, and edge caching      |
| Backup Storage (S3 / R2)   | $1.00              | $3.00            | $10.00           | Encrypted snapshots & WAL retention             |
| Observability / Logging    | $2.00              | $5.00            | $30.00           | Prometheus/Loki/Grafana centralized telemetry   |
| **Total Monthly Cost**     | **$38.00**         | **$103.00**      | **$275.00**      | Highly capital-efficient infrastructure         |

- **First Bottleneck at 10× Scale**: Database write throughput on single-leader PostgreSQL during peak month-end payroll reconciliation. Trigger metric: Disk write IOPS saturation (> 85%). Remediation: Read replica routing for `reporting-api` queries.

---

## 13. Failure Modes and DR Runbook

| Failure Mode           | Blast Radius    | Detection Mechanism         | Automatic / Manual Remediation                             | Tested? |
| ---------------------- | --------------- | --------------------------- | ---------------------------------------------------------- | ------- |
| Primary Database Crash | All writes fail | `/health` probe fails       | DB supervisor restarts container; alerts sent via webhook  | YES     |
| Service Pod Crash Loop | Partial degrad. | Kubernetes CrashLoopBackOff | K8s restarts replica; traffic routes to remaining replica  | YES     |
| Bad Migration Applied  | Data mismatch   | Deploy health check fails   | Run downward migration or restore from pre-deploy snapshot | YES     |
| Cloudflare Tunnel Drop | Edge offline    | Cloudflare tunnel health    | Cloudflared pod auto-reconnects with redundant connectors  | YES     |

### Capacity Arithmetic

- **Request Volume**: 1× baseline = 10 requests/sec. At 2 replicas, each replica handles 5 req/sec (Node.js event loop utilization < 5%).
- **Database Connections**: 2 replicas × 10 max pool = 20 connections max. PostgreSQL handles up to 100 connections comfortably.
- **Storage Growth**: 1 journal entry ≈ 4 lines ≈ 1.2 KB. At 5,000 entries/month, annual storage growth is < 75 MB.

---

## 14. Architecture Decision Records (ADRs)

### ADR-001: PostgreSQL 17 with Drizzle ORM over SQLite / Prisma

- **Context**: The prototype used SQLite and in-memory storage, which cannot handle concurrent write locks, multi-replica scaling, or bank-grade auditing.
- **Options Considered**: SQLite, MongoDB, PostgreSQL with Prisma, PostgreSQL with Drizzle ORM.
- **Decision**: PostgreSQL 17 paired with Drizzle ORM.
- **Rationale**: PostgreSQL provides proven ACID guarantees, strict enum types, and foreign key integrity. Drizzle ORM offers zero-runtime overhead, lightweight SQL-like syntax, and deterministic schema migrations without heavy binary engines.
- **Consequences**: Requires a managed PostgreSQL instance; schema changes require explicit SQL migration files.

### ADR-002: Kubernetes (K3s) with Cloudflare Tunnel over Single Bare-Metal VM

- **Context**: Running production microservices directly on a single VM via bare `docker-compose` creates single-point-of-failure risks and lacks automated health self-healing.
- **Options Considered**: Standalone Docker Compose, Render / Heroku PaaS, Full AWS EKS, Lightweight Kubernetes (K3s).
- **Decision**: Lightweight Kubernetes (K3s) coupled with Cloudflare Zero-Trust Tunnel.
- **Rationale**: K3s provides production Kubernetes APIs, declarative deployments, automated replica self-healing, rolling updates, and batch jobs for migrations. Cloudflare Tunnel eliminates the need for open inbound public firewall ports.
- **Consequences**: Introduces Kubernetes manifest maintenance, offset by rock-solid reliability and parity with enterprise bank infrastructure.

### ADR-003: Microservice Split (`ledger-api` and `reporting-api`) with Internal Token Boundary

- **Context**: Financial report generation involves heavy aggregations across historical journal lines, which must not degrade the latency of concurrent transaction writes.
- **Options Considered**: Single monolithic service, asynchronous event-driven worker, synchronous microservice split.
- **Decision**: Microservice architecture splitting write-heavy `ledger-api` from read-heavy `reporting-api`, joined by internal token-guarded posting endpoints.
- **Rationale**: Allows independent scaling of reporting and transaction engines. Protects ledger write path during month-end report generation.
- **Consequences**: Requires maintaining an internal API token and network connectivity between pods.
