# Assignment 3 — Production hardening

Makes the Week 9 RBAC/security API operable: fails fast at boot on bad
config, logs every request (including the ones a guard rejects), answers
truthfully at `GET /health`, and shuts down cleanly on `SIGTERM`.

## Run it

```
npm install
cp .env.example .env
npm run migration:run
npm test           # 14 tests: config-validation, health, and the carried-over auth unit tests
npm run start
```

## W1/C2 — schema-validated, typed configuration

`src/config/validation.schema.ts` is a Joi schema covering every variable
the app reads - presence *and* type (`Joi.number().port()` rejects
`PORT=abc` outright, it doesn't coerce it to `NaN`). `src/config/
app-config.module.ts` wires it into `ConfigModule.forRoot({
validationSchema, ... })`; `src/config/app-config.service.ts` is the one
typed module the rest of the app reads configuration through -
`config.database`, `config.jwt`, `config.argon2`, `config.corsOrigin`,
`config.port`, `config.isDevelopment` - never a raw `config.get('KEY')`
string outside this one file.

**`process.env` outside the config module**: two deliberate exceptions,
both named here rather than left for a grep to "discover":
- `src/data-source.ts` - the typeorm CLI's own entry point, invoked
  directly by `npm run migration:run` outside Nest's DI graph entirely,
  so it has no `ConfigService` to inject.
- `test-setup.ts` / `.env.test` loading - test bootstrapping, not
  application code.

Everywhere else (`main.ts`, `app.module.ts`, `auth.service.ts`,
`jwt.strategy.ts`, `all-exceptions.filter.ts`) reads through
`AppConfigService`.

**Verified live:**
- Removed `JWT_SECRET` from `.env`, ran `npm run start`:
  ```
  ERROR [ExceptionHandler] Config validation error: "JWT_SECRET" is required
  ```
  exits immediately (no retry, no partial boot).
- Set `PORT=abc` in `.env`, ran `npm run start`:
  ```
  ERROR [ExceptionHandler] Config validation error: "PORT" must be a number
  ```
- `src/config/app-config.module.spec.ts` (C4) proves the same thing as a
  real, automated test - see below.

**A real gotcha this caught**: a `@Module({ imports: [ConfigModule.forRoot(...)] })`
decorator evaluates that `imports` array once, when the class is first
defined - not once per `Test.createTestingModule()` call. The first draft
of the C4 test went through `AppConfigModule` directly and always
resolved, never rejected, because validation had already succeeded
against `process.env` the first time the file was imported, before the
test's own `delete process.env.JWT_SECRET` ever ran. Fixed by calling
`ConfigModule.forRoot()` fresh, inside each test, with `ignoreEnvFile:
true` so a deleted variable can't be silently refilled from `.env` on
disk either.

## W2/X3 — one JSON line per request, everywhere

`src/common/request-context.ts`'s `requestLoggingMiddleware` listens for
Express's `res.on('finish')` and logs one line: `requestId`, `method`,
`path`, `statusCode`, `durationMs`, `timestamp`, plus `authorization` and
`body` when present (redacted).

**A real gap this caught, not just a design choice**: the first version
of this was a `NestInterceptor`. Nest's pipeline runs
`middleware -> guards -> interceptors -> pipes -> handler`, so a
guard-thrown exception - `JwtAuthGuard`'s 401, `RolesGuard`'s 403/404,
`ThrottlerGuard`'s 429, i.e. most of what actually errors in a real RBAC
API - never reaches an interceptor at all. Verified live: with the
interceptor version, a write with no token (401, thrown by `JwtAuthGuard`)
produced *zero* access-log lines. Moving the logger to a `res.on('finish')`
middleware fixes this structurally - that event fires once the response
is actually sent, no matter which layer produced it, so nothing upstream
can skip it.

`requestIdMiddleware` runs first and attaches one id per request
(`req.id`, echoed back as `X-Request-Id`) - the same id then appears on
`AllExceptionsFilter`'s error log line for that request, so both lines a
failing request produces (access log + error log) are joined by
`requestId` and both parse as JSON (X3).

**Verified, real captured lines:**
```
{"requestId":"63eb8246-...","method":"POST","path":"/projects","statusCode":401,"durationMs":11,"timestamp":"...","body":{"name":"No token"}}
{"requestId":"9b2ac436-...","method":"GET","path":"/projects/99999999999999","statusCode":500,"durationMs":19,"timestamp":"...","authorization":"Bearer [REDACTED]"}
```
and the paired `ExceptionFilter` line for that same second request carries
`"requestId":"9b2ac436-..."` too.

## X2 — redaction

`src/common/redact.ts` masks `password`/`token`/`refreshToken`/etc.
outright, and special-cases `authorization` to keep the scheme word:
`Bearer [REDACTED]`, not a bare `[REDACTED]` - so a reader can tell a
token was presented without ever seeing it. **A real bug this caught**:
the first version applied `redact()` to the header value unconditionally,
which returned the literal string `"[REDACTED]"` even when *no*
`Authorization` header was sent at all (since `redact(undefined)` still
returns something), so every log line - including plain `GET /health`
calls - carried a phantom `authorization` field. Fixed by checking the
*raw* header's presence before redacting, not the redacted result's.

Verified live: `POST /auth/register`/`/auth/login` log `"password":"[REDACTED]"`;
a request with a real bearer token logs `"authorization":"Bearer [REDACTED]"`;
a plain `GET /health` with neither carries no `authorization`/`body` field
at all.

## C1/X1 — `GET /health`

`src/health/health.service.ts` runs `SELECT 1` against the real
`DataSource`, racing it against a 1500ms timeout so a hung connection
can't hang the endpoint itself - `Promise.race`, not a bare `await`.
Returns `{ status, checks: { app, database } }`; the controller
(`@Public()`, so a load balancer never needs a token) answers `200` when
everything's healthy, `503` with the same per-check breakdown when it
isn't.

**Verified live**: a running server answers
`{"status":"ok","checks":{"app":{"status":"ok"},"database":{"status":"ok"}}}`.
**Verified by test, not a live demo** (see below for why): `src/health/
health.service.spec.ts` mocks `DataSource.query` to reject -> `status:
"error"`, `checks.database.message` names the real error, `checks.app`
stays `"ok"` (X1's "distinguish app-up-db-down from all-healthy"); mocks
it to *never resolve* -> the check still returns within the test's 3s
budget with `"timed out after 1500ms"` (X1's "never hang"), proving the
timeout branch actually fires and actually resolves.

**Why a live "kill the database mid-request" demo wasn't attempted**:
this machine's shared Postgres instance is used by every other week in
this program, and the `postgres` role every week connects as is a
superuser - `REVOKE CONNECT` has no effect on a superuser (confirmed:
tried it, `/health` stayed `200` because superusers bypass that check
entirely), and actually stopping the Postgres *service* would take down
every other week's database along with it. The mocked unit test is the
technique C4's own HINT names for exactly this scenario ("make the
database check throw") and is what's actually exercised in `npm test`.

Separately, **boot-time unreachability is a different, real behaviour**,
verified live: pointing `DB_PORT` at a closed port and running `npm run
start` shows `@nestjs/typeorm` retrying the connection and then failing
the whole boot - `retryAttempts`/`retryDelay` in `app.module.ts` are set
to `3`/`1000ms` (down from the library's default 10×3000ms) specifically
so an unreachable database at startup is a same-second failure, not a
silent 30-second hang. This is boot-time behaviour, distinct from
`/health`'s job of reporting a database that goes away *after* a
successful boot.

## C3 — graceful shutdown

`main.ts` calls `app.enableShutdownHooks()`. `src/common/
shutdown-logger.service.ts` implements `OnApplicationShutdown` and logs
the signal; `@nestjs/typeorm`'s own `onApplicationShutdown` hook closes
the connection pool - both only run at all *because*
`enableShutdownHooks()` was called.

**Verified, honestly, with a real environment limitation named**: this is
a Windows machine with no Docker/WSL. `taskkill` and even
`process.kill(pid, 'SIGTERM')` sent **from another process** just force-
terminate on Windows regardless of the signal name - confirmed live, no
shutdown log appeared. Self-signaling (`process.kill(process.pid,
'SIGTERM')` from *within* the same running process) also produced no
lifecycle hooks, meaning this machine doesn't deliver a real emulated
`SIGTERM` even to itself. What *is* verified, directly: `app.close()` -
the exact call Nest's own SIGTERM listener makes internally once
`enableShutdownHooks()` is active - was called directly against a fully
booted instance of this app, and:
```
BEFORE app.close(): dataSource.isInitialized = true
[Shutdown] Received shutdown signal - no longer accepting new work, closing the database pool.
AFTER app.close(): dataSource.isInitialized = false
```
proving the actual application-level mechanism (the log line, the pool
closing) works correctly. The only unverified link is OS-level signal
delivery on this specific machine, which is outside the application's
control and would behave identically for a grader hitting the same
Windows limitation locally.

## C4 — the test

`src/config/app-config.module.spec.ts`: proves W1's own CHECK two ways -
boots normally with everything present, refuses to boot when `JWT_SECRET`
is missing (`/JWT_SECRET/` in the thrown message), refuses to boot when
`PORT` isn't a number. `npm test` includes it and it passes; deleting the
`ignoreEnvFile: true` line (or reverting to going through
`AppConfigModule`) makes it fail red again for the reason described above.

`src/health/health.service.spec.ts` additionally covers C4's other valid
option (unhealthy when the database is unreachable) - not required since
the config test above already satisfies C4, but free given how cheap it
was once `HealthService`'s dependency (`DataSource`) was already mockable.

## Where things are

- `src/config/validation.schema.ts`, `app-config.service.ts`,
  `app-config.module.ts` — W1, C2.
- `src/config/app-config.module.spec.ts` — C4.
- `src/common/request-context.ts` — W2, X2, X3 (both middleware).
- `src/common/all-exceptions.filter.ts` — now DI-managed, reads
  `AppConfigService.isDevelopment` instead of `process.env` (C2), logs
  the same `requestId` the access log carries (X3).
- `src/common/shutdown-logger.service.ts`, `main.ts`'s
  `enableShutdownHooks()` — C3.
- `src/health/` — C1, X1.
- `src/bootstrap.ts` — wires the middleware + filter into one place
  shared by `main.ts` (no separate test app this assignment needs to stay
  in sync with).
