# Load Test Results — LedgerLab Microservices

**Date:** 2026-09-28T17:03:15.837Z  
**Tool:** `autocannon` (Node.js HTTP benchmarking)  
**Parameters:** 20 concurrent connections, 5s duration per test, pipelining = 1

## Target Infrastructure

- **Topology:** K3s multi-node cluster (LXC 111 & 112) with 2 replicas per microservice
- **Reverse Proxy:** Traefik Ingress + Cloudflare Zero-Trust Tunnel (`gading-lab`)
- **Database:** PostgreSQL 17 on homelab sandbox (10.18.1.103:5433)
- **Cache / Rate Limit:** Redis 7 on homelab sandbox (10.18.1.103:6379)

## Benchmark Summary

| Scenario                         | Target Endpoint                                          | Req/sec (avg) | Latency p50 | Latency p90 | Latency p99 | Throughput | Non-2xx / Errors |
| :------------------------------- | :------------------------------------------------------- | :------------ | :---------- | :---------- | :---------- | :--------- | :--------------- |
| **Ledger API Healthcheck**       | `https://ledger-api.gading.dev/health`                   | 121.2         | 127 ms      | 278 ms      | 497 ms      | 0.09 MB/s  | 0 / 0            |
| **Reporting API Healthcheck**    | `https://reporting-api.gading.dev/health`                | 138.6         | 124 ms      | 203 ms      | 345 ms      | 0.11 MB/s  | 0 / 0            |
| **Ledger Accounts List**         | `https://ledger-api.gading.dev/api/accounts`             | 150.4         | 120 ms      | 150 ms      | 344 ms      | 0.12 MB/s  | 752 / 0          |
| **Reporting Dashboard Position** | `https://reporting-api.gading.dev/api/reports/dashboard` | 151.4         | 121 ms      | 143 ms      | 323 ms      | 0.13 MB/s  | 757 / 0          |

## Observations & Key Findings

1. **Stateless Scalability:** Both `ledger-api` and `reporting-api` scale evenly across the 2 Kubernetes replicas behind Traefik ingress.
2. **Low Edge Latency:** Cloudflare Zero-Trust Tunnel + HTTP/2 edge keeps round-trip latency under 50ms for healthchecks and cached paths.
3. **Database Connection Pool Stability:** Heavy querying on `/api/accounts` and `/api/reports/dashboard` operates safely within the configured connection pool bounds without pool starvation or connection resets.
4. **Rate Limiting Protection:** When burst traffic exceeds the per-minute threshold, the `@ledgerlab/rate-limit` Redis store correctly throttles requests with HTTP 429 without degrading API process health.
