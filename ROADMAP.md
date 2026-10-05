# GymOS — Master Roadmap (5-Phase Blueprint)

## Core Design Tokens

- Canvas: `#121212`
- Surface: `#1E1E2E`
- Surface Elevated: `#27273A`
- Accent (Cyan): `#22D3EE`
- Emerald (Success): `#10B981`
- Crimson (Danger): `#EF4444`
- Borders: `#3C494C`

## Security & Role-Based Access Rules

- Tenant Data Isolation: Every tenant-owned table uses `tenant_id`; RLS is enforced at the database level.
- Receptionist / Counter Staff: No delete rights on members, payments, or attendance; no access to total gym profit metrics.
- Gym Owner: Full tenant-scoped access, including financial reports, staff management, discount caps, and override permissions.
- Superadmin: SaaS-level onboarding, license suspension, and MRR analytics. Tenant access must be explicit, privileged, and auditable.
- Client input is never trusted to establish tenant identity or role. Authorization must derive from verified authentication claims and database policies.
- Sensitive and destructive actions must be auditable. Financial and attendance history should use corrections or reversals rather than unaudited destructive edits.

## 5 Locked Core Screens

1. Receptionist Dashboard — Action queue, live search, quick add member.
2. Add/Edit Member Modal — Duplicate phone warning, dynamic auto-expiry, payment mode.
3. Member Profile & History — Payment timeline, attendance heatmap grid.
4. Unpaid Dues & Defaulters Sheet — Multi-select bulk WhatsApp reminders.
5. Superadmin Control Panel — Multi-tenant management & subscription status.

---

## Phase 1 — Project Scaffolding & Supabase Architecture

- [x] Chunk 1.1: Next.js 14 App Router init (TypeScript, Tailwind, dark theme tokens), folder structure, roadmap.
- [x] Chunk 1.2: Supabase schema + migrations (`tenants`, `members`, `payments`, `attendance`, `users/roles`). Strict RLS policies.
- [x] Chunk 1.3: Auth roles (`receptionist`, `owner`, `superadmin`) with JWT claims and middleware route guards.

## Phase 2 — Core Data Layer & Security

- [x] Chunk 2.1: Typed Supabase clients (`database.ts`, service vs anon).
- [x] Chunk 2.2: DB-level RLS policies verified (receptionist no profit aggregate, no DELETE).
- [x] Chunk 2.3: Seed scripts + test tenants.

## Phase 3 — UI Screens (Locked 5)

- [x] Chunk 3.1: Receptionist Dashboard.
- [x] Chunk 3.2: Add/Edit Member Modal.
- [ ] Chunk 3.3: Member Profile & History.
- [ ] Chunk 3.4: Unpaid Dues & Defaulters Sheet.
- [ ] Chunk 3.5: Superadmin Control Panel.

## Phase 4 — Integrations & Operational Automation

- [ ] Chunk 4.1: WhatsApp reminder workflow with tenant-scoped templates, consent checks, and delivery audit logs.
- [ ] Chunk 4.2: Membership expiry, payment-due, and attendance automation with idempotent scheduled jobs.
- [ ] Chunk 4.3: Owner reporting and exports with role-gated financial aggregates and tenant-scoped data access.

## Phase 5 — Quality Assurance, Hardening & Release

- [ ] Chunk 5.1: Unit, integration, and end-to-end coverage for the five locked screens and critical workflows.
- [ ] Chunk 5.2: Security audit covering cross-tenant isolation, role escalation, destructive permissions, and sensitive-data exposure.
- [ ] Chunk 5.3: Performance, accessibility, observability, backup/recovery, and production deployment readiness.

---

## Recommended Source Directory Structure

```text
.
├── src/
│   ├── app/
│   │   ├── (auth)/                 # Authentication route group
│   │   ├── (dashboard)/            # Authenticated tenant application
│   │   ├── api/                    # Route handlers and webhooks
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                     # Reusable design-system primitives
│   │   ├── forms/                  # Domain forms and validation UI
│   │   └── layouts/                # Shells, navigation, and headers
│   ├── features/
│   │   ├── attendance/
│   │   ├── auth/
│   │   ├── members/
│   │   ├── payments/
│   │   ├── superadmin/
│   │   └── tenants/
│   ├── lib/
│   │   ├── supabase/               # Browser/server clients and DB types
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── utils/
│   │   └── validation/
│   ├── hooks/
│   └── middleware.ts
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/                      # RLS and database policy tests
├── public/
├── ROADMAP.md
└── tailwind.config.ts
```

Feature folders should expose a small public API and keep feature-specific components, queries, mutations, and tests together. Shared code belongs in `components`, `hooks`, or `lib` only when it is genuinely reused.
