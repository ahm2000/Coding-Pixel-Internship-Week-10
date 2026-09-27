# Assignment 1 — Integration tests with Supertest

Tests the RBAC/security API from Week 9 through its actual HTTP surface,
against a throwaway database, with every test independent of every other
one. The API itself is unchanged from Week 9's `assignment-3` except for
`src/bootstrap.ts`, extracted so the suite and `main.ts` can never drift
apart on which pipes/filters/interceptors are applied.

## Run it

```
npm install
cp .env.example .env             # dev database, same as Week 9
cp .env.test.example .env.test   # a *separate* database, for tests only
npm run migration:run            # builds the dev schema
npm test                         # unit tests (mocked repositories) - 8 tests
npm run test:e2e                 # Supertest suite against .env.test - 7 tests
```

`test:e2e` runs the real migrations against whatever `.env.test` points at
before the suite starts (W1) - there is no separate "seed the test schema"
step to remember. `npm test` never touches a database at all; it's the same
mocked-repository suite from Week 9's `auth.service.spec.ts`.

## W1/W2 — a separate, disposable test database

`.env.test` configures its own `DB_NAME` (`Week_10_test` locally), never the
one `.env` points at (`Week_10`). Two things make this real rather than a
convention someone can forget:

- **`test/global-setup.js`** runs once, before any test file, and does two
  things: runs `npm run migration:run:test` (the same migrations
  `migration:run` applies to the dev database, via `NODE_ENV=test` pointing
  `data-source.ts` at `.env.test` instead of `.env`), and refuses to
  continue if `.env.test` resolves to the *same* host/port/database as
  `.env`. It compares the two files' `DB_NAME` (not a hardcoded name), so
  the guard works even if the test database is renamed - it only breaks if
  someone renames it to collide with dev.
- **`test/setup-env.js`** (Jest's `setupFiles`, runs per test file, before
  `AppModule`'s `ConfigModule.forRoot()` reads `process.env`) loads
  `.env.test` first. `dotenv.config()` never overrides an already-set
  variable, so by the time `ConfigModule` loads `.env` for real, `DB_NAME`
  etc. are already pinned to the test database and nothing overwrites them
  - the same mechanism Week 9's `test-setup.ts` already used for
  `ARGON2_MEMORY_COST`.

**Verified, not assumed:**
- A full `npm run test:e2e` run, then `psql -d Week_10 -c "select count(*)
  from users"` → `0`. The dev database has never had a row in it from any
  test run.
- Pointed `.env.test` at `Week_10` (the dev database) on purpose and ran
  `npm run test:e2e` again: it refused to start -
  `Refusing to run the e2e suite: .env.test points at the same database as
  .env (localhost:5432/Week_10)` - before a single migration or test ran.
  Restored `.env.test` afterward.
- Two consecutive full `npm run test:e2e` runs: `7 passed, 7 total` both
  times, with the second run's migration step correctly reporting
  `No migrations are pending`.

Between tests, `test/helpers/db.ts`'s `truncateAll()` runs in every
spec file's `afterEach` - `TRUNCATE ... RESTART IDENTITY CASCADE` across
every table TypeORM knows about (read from `dataSource.entityMetadatas`,
not a hand-maintained list, so a future migration adding a table doesn't
need this file touched). It refuses to run at all against a database whose
name doesn't end in `_test`, on top of the check `global-setup.js` already
ran once - the same guard at the one-time boot check and at the point of
every actual destructive query.

## C1-C4 — the Supertest suite (`test/projects.e2e-spec.ts`)

- **C1**: `POST /projects` then `GET /projects/:id` on the same id -
  asserts the created body and the fetched body agree on `name`, and that
  `owner.id` is the caller's own id.
- **C2**: an empty `name` → `400` with `statusCode`/`message`; a write
  with no `Authorization` header at all → `401`.
- **C3**: `GET`, `PATCH` and `DELETE` on id `999999` (well-formed, absent)
  each → `404`.
- **C4**: every test calls `registerAndLogin()` (`test/helpers/auth.ts`)
  for its own fresh user - no fixture user or project is created at
  `describe`/module scope. One test explicitly asserts a brand-new user
  sees zero projects, which would fail immediately if an earlier test's
  row had leaked forward.

Both spec files share `test/helpers/app.ts`'s `createTestApp()`, which
calls the same `configureApp()` `main.ts` calls - the suite is exercising
the actual `ValidationPipe`/`AllExceptionsFilter`/`ClassSerializerInterceptor`
config, not a hand-rolled stand-in that could quietly diverge from
production.

**Verified:**
- `npm run test:e2e` → `Test Suites: 2 passed, 2 total`, `Tests: 7 passed,
  7 total`.
- A single test in isolation: `npx jest --config test/jest-e2e.json
  --runInBand -t "creates a project and reads the same one back"` →
  `Tests: 6 skipped, 1 passed, 7 total` - passes with nothing else in the
  file having run first.
- Shuffled order: `npm run test:e2e:shuffle` (Jest's `--randomize`, needs
  `jest-circus`, the default runner since Jest 27) → `7 passed, 7 total`,
  a different `Seed` each run.

```
PASS test/projects.e2e-spec.ts (5.4 s)
Test Suites: 1 skipped, 1 passed, 1 of 2 total
Tests:       6 skipped, 1 passed, 7 total
```

## X1 — combinable filters (`test/tasks.e2e-spec.ts`)

Seeds three tasks across two projects: one matching `status=todo` **and**
`projectId=A`, one matching only the status, one matching only the
project. `GET /tasks?status=todo&projectId=A` asserts exactly one row
comes back, and it's the one that matches both - a broken `AND` (e.g. an
accidental `OR`, or a filter silently ignored) would return more than one
and fail immediately.

## X2 — `forbidNonWhitelisted` from the outside

`POST /projects` with `{ name, ownerId: 999 }` → `400` naming `ownerId`
specifically, and a follow-up `GET /projects` for that same user confirms
the list is still empty - the request never reached `ProjectsService`,
let alone the database.

## X3 — refuse to run against the wrong database

Covered under W1/W2 above: the guard lives in `global-setup.js`, runs once
before migrations, and was verified live to abort with a named reason when
`.env.test` was deliberately pointed at the dev database.

## Where things are

- `src/bootstrap.ts` — `configureApp()`, shared by `main.ts` and
  `test/helpers/app.ts` so the suite can't drift from production config.
- `test/global-setup.js` — W1 (runs `migration:run:test`), X3 (the
  same-database guard, checked once before the suite starts).
- `test/setup-env.js` — loads `.env.test` before `AppModule` reads
  `process.env`.
- `test/helpers/app.ts` — `createTestApp()`.
- `test/helpers/db.ts` — `truncateAll()` (W2, plus its own X3 check).
- `test/helpers/auth.ts`, `test/helpers/projects.ts` — the factories C4
  asks for (`registerAndLogin()`, `createProject()`).
- `test/projects.e2e-spec.ts` — C1-C4, X2.
- `test/tasks.e2e-spec.ts` — X1.
- `.env.test.example` — the test-database env template; `.env.test`
  itself is gitignored, same as `.env`.
- `src/migrations/`, `src/entities/`, `src/auth/`, `src/rbac/`,
  `src/projects/`, `src/tasks/`, `src/comments/`, `src/common/` — the
  Week 8/9 application this suite tests, unchanged.
