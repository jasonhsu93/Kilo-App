# Verification record · 2026-11-11

Executed locally on Apple silicon with Node.js 22.15.0 and the locked npm dependencies.

| Check                                  | Result                                              |
| -------------------------------------- | --------------------------------------------------- |
| `npm run typecheck`                    | Passed, including Next.js route type generation     |
| `npm test`                             | 31 unit tests passed                                |
| `npm run test:integration`             | 25 real PostgreSQL integration tests passed         |
| `npm run build`                        | Optimized Next.js production build passed           |
| `CI=1 npm run test:e2e -- --retries=0` | 12 production browser tests passed, without retries |

The browser suite used the real native Supabase stack: PostgreSQL 17, Supabase Auth, PostgREST, and a local SMTP/mail catcher. It exercised both desktop and mobile Chromium, including:

- Invitation delivery, token verification, initial password setup, and password recovery.
- Login, disabled public registration, anonymous route/export rejection, and direct-write denial.
- Customer creation and assignment; paid package purchase and one-credit attendance.
- Substitution by a coach without a permanent assignment, same-day confirmation, and credit transfer approval.
- Company payment reconciliation, report export, and audited attendance reversal.
- Administrator CSV preview/commit with unknown-value opening balances and no fabricated payments.

The PostgreSQL suite applies every committed migration to a fresh isolated database and tests actual grants, RLS, row locks, concurrent transactions, idempotency, FIFO across prices, package provenance, reversals, inactive customers/staff, departed-coach transfers, imports/rollback, substitute price privacy, and allocation/ledger equivalence. Only its Auth identity interface is shimmed; the browser suite additionally verifies the real Auth/Data API integration.

Desktop and mobile dashboard screenshots were inspected. Mobile tables render as labeled cards; dialogs support keyboard focus management and explicit financial confirmations. Success messages live outside conditional table rows, so approving a request cannot remove its success feedback.

CI is configured to repeat the unit, database, build, and full real-service browser checks on Ubuntu. CI itself has not been run from this workspace. Physical iOS/Safari testing, public SMTP delivery, and a live Vercel/hosted Supabase deployment were not performed; the README provides deployment and smoke-test instructions. No production system was modified.
