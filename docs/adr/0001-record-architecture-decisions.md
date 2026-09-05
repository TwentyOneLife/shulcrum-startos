# ADR-0001: Record architecture decisions
- **Status:** accepted
- **Date:** 2026-09-05

## Context
This project makes consensus-adjacent and packaging decisions whose rationale must survive contributor
turnover and be auditable.

## Decision
We record significant, hard-to-reverse decisions as numbered ADRs in `docs/adr/`. ADRs are append-only:
to change a decision, add a new ADR that supersedes the old one.

## Consequences
A small, durable trail of *why*. Trivial choices stay out of ADRs to avoid noise.
