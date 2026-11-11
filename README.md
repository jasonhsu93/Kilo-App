# KILO · 私人訓練管理

A mobile-first internal gym application for coach-specific prepaid credits, attendance, purchases, payment reconciliation, transfers, substitutions, and reporting. The interface is Traditional Chinese. The default gym uses TWD and Asia/Taipei.

This is a real Next.js/Supabase application. There is no mock-data mode, public registration, customer login, online payment processing, scheduling, LINE integration, or QR scanning.

## Requirements

- Node.js 22.15+ and npm (`npm ci` installs the locked dependency tree).
- A Supabase project, either local or hosted.
- For local Supabase: Docker/Podman, **or** the Supabase CLI's native runtime on Apple silicon/macOS 14+ or supported Linux. The pinned CLI is included as a development dependency. Native runtime details: [Supabase documentation](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).
- Initial dependency/service downloads require network access. Do not commit credentials.

## Quick start: local development

```sh
npm ci
npm run db:local -- --runtime native --exclude realtime,storage,functions,studio,analytics,pooler --eager
npm run db:env
npm run seed
npm run dev
```

Open http://localhost:3000. The seed creates **one administrator, five coaches, fifty synthetic customers**, paid/complimentary packages, varied balances, attendance, verified/pending/disputed payments, a pending transfer, and an approved substitution. Five customers are inactive. The dataset uses November 2026 dates so its example reports are reproducible; select that month when demonstrating it later.

`db:env` writes this stack's dynamically allocated endpoints and credentials to `.env.local`, with owner-only file permissions. `seed` writes development login credentials to `.local/demo-accounts.json`, also owner-only. Read that file locally to sign in. Neither file is tracked. Seed accounts use `*.example` synthetic addresses and are created without sending email.

The wrapper keeps the Supabase CLI's cache and database under `.local/supabase/` and suppresses credentials in console output. Public signup is disabled; email/password login remains enabled. Only the local mail catcher receives development invitation/reset emails.

For Docker, replace `--runtime native` with `--runtime docker`. A stack retains its runtime; do not switch an existing stack to a different runtime. The wrapper defaults to these MVP exclusions when none are provided. To include Studio, explicitly pass `--exclude realtime,storage,functions,analytics,pooler --eager`.

```sh
npm run db:status
npm run db:stop
# Resume the same stack, preserving its data:
npm run db:local -- --eager
# If local endpoints changed, replace ONLY the local environment file:
npm run db:env -- --refresh
```

The CLI applies migrations on first creation. For subsequent migrations, use `npm run db:migrate` with the stack running. This runner recognizes migrations already applied by the Supabase CLI. Do not use destructive database reset commands against a working gym.

## Environment variables

`.env.example` describes the manual configuration. Next.js and the scripts load `.env.local`; scripts also accept environment variables.

| Variable                                | Purpose                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`              | Supabase API URL; public                                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | Publishable key (legacy anon keys also work); public                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`             | **Server-only** elevated key for account provisioning/bootstrap/seed; never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL`                   | Exact application origin for invitation/password reset redirects                                       |
| `DATABASE_URL`                          | PostgreSQL connection for migrations; server/scripts only                                              |
| `ALLOW_REMOTE_DATABASE`                 | Explicit `true` to let migration scripts target an intended hosted database; default `false`           |
| `GYM_CURRENCY`                          | Optional ISO currency at first bootstrap, default `TWD`; currency is fixed after packages exist        |
| `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` | First administrator; password must be 12–128 characters                                                |
| `DEV_SEED_ALLOWED`                      | Must be `true` for development seeding; disabled by default                                            |
| `SUPABASE_PROJECT_PURPOSE`              | Hosted seeding additionally requires `development` or `test`                                           |
| `DEV_SEED_PASSWORD`                     | Optional development/CI password, at least 12 characters; otherwise generated per account              |
| `TEST_DATABASE_PORT`                    | Optional isolated PostgreSQL integration-test port, default `55439`                                    |
| `LOCAL_MAIL_URL`                        | Local mail catcher URL generated by `db:env`; full browser Auth tests require it                       |
| `E2E_BASE_URL`                          | Optional browser-test origin; default `http://127.0.0.1:3000`                                          |

Never seed a real gym. The seed refuses a project containing a non-demo administrator. Successful seeds are repeat-safe; interrupted seed commands reuse mutation keys and can be rerun. During an interrupted rerun, development passwords may be regenerated. Existing successfully seeded data is left intact.

Without Supabase configuration, `/login` shows setup instructions. It does not grant access to a demo identity.

## Production initialization and first administrator

1. Create a dedicated Supabase project. Keep its service key exclusively on the server.
2. Copy `.env.example` to `.env.local`, configure the intended API keys, database URL, and application origin. For hosted SQL migrations explicitly set `ALLOW_REMOTE_DATABASE=true`.
3. Run `npm run db:migrate`. Committed SQL is the source of truth; do not create production-only tables manually.
4. In Supabase Auth, disable **Allow new users to sign up**, retain email/password login, set the Site URL to your application origin, and allow `/auth/confirm` and `/reset-password` redirects for that origin.
5. Configure production SMTP. Copy `supabase/templates/invite.html` and `recovery.html` into the corresponding Supabase email templates. Their links pass `token_hash` to the server callback; this is required for invitations/reset flows to work without relying on browser token fragments.
6. Supply `BOOTSTRAP_EMAIL` and a strong `BOOTSTRAP_PASSWORD` in your local environment, then run `npm run bootstrap`. The CLI never prints the password. Remove the bootstrap password from the environment afterward.
7. Sign in, invite staff from **教練團隊**, create customers, and assign coaches from each customer profile. Never enable public signup to add a coach.

Bootstrap is closed once an administrator exists. A database-guarded provisioning function verifies the service role, serializes bootstrap, and refuses a second first administrator. Subsequent invitations revalidate their initiating administrator and atomically commit the staff profile and audit record. Auth creation and profile creation are separate APIs: if provisioning fails, the new Auth user has no application access; retrying the invitation with the same email completes provisioning rather than creating another identity. Resolve any orphaned Auth identity through the administrator workflow or Supabase console.

## Daily workflows

- **Coach:** 我的學員 → customer → 完成一堂 / 扣除一堂 → confirm. Advanced attendance supports backdating, multiple credits, and notes.
- **Purchases:** customer → 新增購課方案 → quantity, tier or custom price, method, timestamp → review total → confirm. A zero price explicitly grants complimentary credits with a reason and no payment receipt.
- **Transfers:** coach submits a reasoned request from a customer. Administrator opens 轉移與代課 and approves/rejects it; approval rechecks available credits. Administrators may initiate and then approve requests, including moving existing credits away from a disabled former coach without restoring their login.
- **Substitutions:** administrator authorizes one customer/owner/instructor/date/credit quantity. The substitute sees a scoped customer identity and authorized balance, and records the approved session from that profile. The owner's package never moves.
- **Reconciliation:** administrator opens 付款與對帳, filters the period, and records verified, pending, or disputed status with a reason. Disputing a payment does not automatically remove credits.
- **Corrections:** administrator opens customer event history and reverses an event with a reason. Purchase reversal also voids its payment. If a reversal would create a negative allocation, reverse dependent sessions/transfers first. Partial refunds are not implemented.
- **History:** attendance stores actual instructor, credit owner, recorder, package allocations, original balance snapshot, and reversal status. Deactivation never deletes these facts.

### Credit and money rules

- One package belongs to one customer and retains its original coach, purchased quantity, currency, date, and unit price permanently.
- Current credits are allocated by package **and current coach**. Packages are consumed FIFO by `(purchased_at, package_id)`. A transferred package keeps its original date in FIFO ordering.
- All credits are whole numbers. Backdated attendance consumes currently available lots and does not reconstruct historical availability. Normal attendance/purchases require an active customer and assigned active coach. Administrators can reverse historical records for inactive customers.
- Every credit mutation locks the customer row, updates allocation projections, appends immutable ledger entries, and commits related records atomically. Unrelated customers can be processed concurrently.
- Every mutation has an actor-scoped persistent idempotency key. Identical committed retries return the prior result; different payloads with the same key fail. A failed transaction leaves no receipt. Keep the same confirmation dialog open when retrying an uncertain network failure.
- A same-day attendance warning is checked under the same customer lock. A new deduction requires explicit acknowledgement. Idempotent retries do not trigger another deduction.
- Money is stored/calculated as bounded integer minor units: **NT$1,750 = 175000**. Decimal input is parsed from digits, never `parseFloat` arithmetic. Each unit price is capped at 100,000,000 minor units and each package at 100,000 credits.
- Coach-recorded in-person payments activate credits immediately while marked **pending**. `gym_settings.credits_on_recorded_payment` documents the policy; this MVP deliberately supports only `true`. A future settlement-gated policy requires a tested command change, not a switch that silently alters existing credits.
- Default tiers are editable data, not hardcoded business logic. Coaches may use custom prices and grant gifts only with an audit reason.
- A purchase is one full recorded payment. Installments, refunds, partial settlements, package expiry, and negative-credit overrides are not supported.
- Added admin adjustment credits have unknown value. Complimentary credits have a known zero value. Unknown opening values are never treated as known zero in reporting.

## Reports and exports

Reports distinguish **recorded cash**, **currently verified cash**, **delivered-session attributed value**, and **current unused package attributed value**. The latter two are operational attribution, **not formally recognized accounting revenue**. Neither attendance nor transfers create a new customer payment.

Date boundaries use Asia/Taipei. Payment reports filter `paid_at`; attendance reports filter `session_at`. Verification timestamps and audit history are retained separately. Reversed/voided rows remain exportable but are excluded from operational totals. A later reversal restates the original period's totals; these are current-state operational reports, not immutable accounting period closures.

Coach filters attribute sales to the original package coach and deliveries to the actual instructor. Payment-status filters only affect payment totals. Remaining balances/value are current snapshots, independent of the date range. Unknown-value credits are counted separately. Monthly exports group actual delivered credits by instructor and month. CSV output includes UTF-8 BOM and escapes formula-like text.

## Spreadsheet migration

Download `public/templates/import.csv` from the import screen (also `templates/import.csv`). Import is administrator-only: upload/paste → validate and inspect row errors/duplicate warnings → confirm → one atomic transaction.

Each CSV row has `row_type` and a stable `external_id`. Blank optional values are omitted. IDs must remain stable across attempts; names are never used to merge records.

| Row type   | Required fields                                                     | Behavior                                                                                           |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `customer` | `external_id`, `name`; optional `coach_id`, contact fields, notes   | Creates a new independent customer; existing external IDs must be referenced rather than recreated |
| `opening`  | `external_id`, `customer_external_id`, `coach_id`, `quantity`       | Explicit opening credit event; optional `remaining`, `unit_price`, `purchased_at`                  |
| `package`  | Same as opening                                                     | Preserves original purchased quantity/date/price when known; only `remaining` credits are opened   |
| `payment`  | `external_id`, `package_external_id`, `amount`, `method`, `paid_at` | Adds only a genuinely documented historical payment; no additional credits                         |

`coach_id` must be an actual coach UUID from the import screen. `unit_price` and `amount` are integer minor units. For other configured currencies, use their ISO minor-unit scale (for example JPY has no fractional unit). Dates must be ISO timestamps with offsets; `remaining` must be between zero and `quantity`. Method values: `cash`, `bank`, `card`, `other`. Unknown price stays blank. All imported package kinds are `opening`, preserving the fact that past attendance was not reconstructed.

There is a 500-row/1 MB limit per batch. The database resolves customers first, packages second, payments last. Every new batch requires a unique stable batch ID. Repeating the identical batch returns the prior batch result, even with a fresh HTTP request key. Reusing a batch ID with different content fails; existing customer/package external IDs and payment/package uniqueness prevent another batch duplicating those facts. One invalid row rolls back the entire batch. Keep the original historical spreadsheet separately; imported purchased quantity minus opening balance does not fabricate historical sessions.

## Automated verification

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:e2e
```

- **Unit:** money/date parsing, input/authority validation, import templates, CSV injection defenses, and operational financial reporting.
- **PostgreSQL integration:** starts a disposable native PostgreSQL server on loopback (no Docker), applies actual migrations and grants, and tests SQL transactions, RLS, concurrency, idempotency, FIFO provenance, substitutions, reconciliation, reversals, imports, deactivation, and projection/ledger equivalence. It shims only Supabase Auth's `auth.uid()`/users interface using transaction-local identity claims. This is real PostgreSQL verification, but it does not substitute for real Auth/Data API testing.
- **Browser:** Playwright uses the real locally seeded Supabase Auth/Data API. Tests run desktop/mobile coach/admin workflows, exports, anonymous access, direct-write restrictions, and disabled signup. The suite fails if credentials/services are missing. `npm run test:e2e:smoke` runs just public-page/anonymous-access checks.
- **CI:** provisions native Supabase, applies migrations, seeds an isolated dataset, builds, and runs the full suite. Required database/browser checks are not silently skipped. Credentials and database files are never uploaded; only failure screenshots/traces are collected.

Tests use system Chrome on this Mac when installed; on Linux/CI run `npx playwright install --with-deps chromium`. Browser tests create synthetic records in the development database and must never point at production. Stop the local stack afterward with `npm run db:stop`.

Webpack is explicitly used for dev/build for compatibility with restricted environments that block Turbopack's internal worker port binding. This does not change Next.js App Router behavior.

## Deploy to Vercel + Supabase

1. Create a production Supabase project, apply migrations, configure Auth/SMTP/templates, and bootstrap the first admin as above. Back up before applying later migrations; validate them on staging first.
2. Connect this repository to Vercel using its Next.js preset and Node 22. Build command: `npm run build`; install command: `npm ci`.
3. Configure the API URL, publishable key, server-only service key, and `NEXT_PUBLIC_APP_URL` for the final production domain. Database connection/bootstrap/seed secrets are not needed in Vercel runtime.
4. Update Supabase Site URL/redirect allowlist for that final domain. Do not share production data or service credentials with arbitrary preview deployments; use a separate test/staging project.
5. Deploy, then smoke-test administrator login, coach-scoped access, a synthetic purchase/attendance/reversal, reconciliation, invitation/reset links, and exports. Never use synthetic demo seeding on production.
6. Retain Supabase backups/PITR according to the gym's recovery needs. Monitor deployment/server logs, Supabase Auth errors, failed commands, and audit history. A rollback must preserve posted ledger facts; use compensating commands rather than editing history.

## Structure and future work

`src/app` owns routes/Server Actions; `src/components` contains responsive interface elements and shadcn-style Radix components; `src/lib/domain` holds typed commands and pure rules; `src/lib/server` owns identity, application services, repositories; `supabase/migrations` owns transactional enforcement and read permissions. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Customer records are independent of Auth. Future portals can add an identity-link table referencing stable customer IDs. LINE identity, notifications, QR tokens, and native APIs can call the existing service boundaries after their own server-side authorization; a QR identifier must never itself authorize a deduction. No speculative integrations or infrastructure have been added.
