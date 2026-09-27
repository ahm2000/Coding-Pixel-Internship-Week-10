# Assignment 2 — End-to-end flow and a coverage threshold

One realistic journey through the Week 9 RBAC/security API - register, log
in, create a project, create a task, comment on it, exercise a few real
CRUD/authorization edges, refresh mid-flow, then log out - plus a coverage
threshold that fails the build if the services drop below 70% statements.

## Run it

```
npm install
cp .env.example .env             # dev database (unused by the tests themselves)
cp .env.test.example .env.test   # a separate database, for the journey only
npm run migration:run            # builds the dev schema
npm test                         # the graded command: journey + coverage gate
npm run test:unit                # carried-over mocked AuthService tests (not scored this week)
```

`npm test` is `jest --config test/jest-e2e.json --runInBand --coverage` -
the one command this assignment is graded on. It runs the real migrations
against `.env.test` first (via `test/global-setup.js`), truncates every
table so the run starts from a genuinely empty database, then runs the
16-step journey and enforces the coverage gate.

## W1/W2 — the journey (`test/journey.e2e-spec.ts`)

One `describe` block, one flow, told as ordered `it()`s so C3/C4's
"delete/break one test" exercises have something discrete to act on.
Each step reuses the previous step's output - the access token stays in a
closure variable and is attached to every request after login; the
project id from step 3 is what step 4 posts against; the task id from
step 4 is what step 5 reads back and step 6 comments on.

Steps, in order: register → login → create project → create task → **read
the task back and assert `project.id` matches** (W2) → add a comment and
assert `task.id` matches (W2) → rename the project → list projects and
find the renamed one → reject a task referencing a non-existent tag (404)
→ reassign the task and attach a real tag → list tasks filtered by
project+status+assignee → **viewer write blocked (403)** (C2) → delete the
task, then confirm deleting it again is 404 → delete the project, then
confirm deleting it again is 404 → **refresh mid-flow, then a protected
route with the new token** (C1) → **logout, then reuse of the revoked
refresh token is 401** (C2).

This file is deliberately never run with `--randomize` - unlike
assignment-1's independent-by-design specs, this journey is order-
dependent by construction, and shuffling it would be testing something
different from what the brief asks for.

## C1 — refresh mid-flow

After the comment step, `POST /auth/refresh` is called with the token
pair from login; the response's `accessToken`/`refreshToken` replace the
stored ones, and the very next request (a protected `GET /projects`,
deliberately chosen because by that point in the flow the original
project has already been deleted by an earlier step) is made with the new
access token and asserted `200`.

## C2 — the denied branches, inside the same flow

- A second user is registered, logged in, and inserted directly into
  `project_members` as `VIEWER` (no membership-management endpoint exists
  in this API's scope, same as Week 9's own tests) - their `POST /tasks`
  on the project is asserted `403`.
- The current refresh token is used for `POST /auth/logout` (`204`), then
  the same token is presented to `POST /auth/refresh` again and asserted
  `401`.

## C3 — coverage threshold, scoped to services

`test/jest-e2e.json`:
```json
"collectCoverageFrom": ["src/**/*.service.ts"],
"coverageThreshold": {
  "./src/**/*.service.ts": { "statements": 70 }
}
```
Jest applies a glob-keyed threshold **per matching file**, not as one
number averaged across all of them - confirmed live: an early attempt at
this journey (before the CRUD-extension steps below existed) left
`projects.service.ts` at 68.75% and `tasks.service.ts` at 37.97%, and
`npm test` failed naming both files individually, each against its own
70% bar.

**Verified, not assumed - the actual "delete one test" exercise the CHECK
asks for:** deleted the `it('reassigns the task to the owner and attaches
a real tag', ...)` step. `npm test` → exit code `1`,
`tasks.service.ts` coverage `62.02%` (`not met`), and one *other* test
also went red (`lists tasks filtered by...`, which depended on the
assignee this deleted step had set) - an honest side effect of the flow
being order-dependent, not hidden. Restored the step: `npm test` → exit
code `0` again, all four service files back over 70%, `16/16` passing.

Current numbers (`npm test`, real run):

| File | Statements |
|---|---|
| `auth.service.ts` | 91.07% |
| `comments.service.ts` | 77.77% |
| `projects.service.ts` | 90.62% |
| `tasks.service.ts` | 81.01% |

## C4 — every test can actually fail

Three tests, broken by hand at the *source*, one at a time, each reverted
before moving to the next:

1. **`blocks a viewer on the project from writing a task (403)`** - added
   `ProjectRole.VIEWER` to `tasks.controller.ts`'s `CAN_WRITE` array.
   Result: `expected 403 "Forbidden", got 201 "Created"` - only this test
   failed, the other 15 stayed green.
2. **`logs out, then rejects reuse of the revoked refresh token (401)`** -
   changed `auth.service.ts`'s `if (existing.revokedAt !== null)` to
   `if (false && existing.revokedAt !== null)`, disabling revocation
   entirely. Result: `expected 401 "Unauthorized", got 200 "OK"` - only
   this test failed.
3. **`reads the task back and confirms it still belongs to the project`** -
   removed `.leftJoinAndSelect('task.project', 'project')` from
   `tasks.service.ts`'s `findOne()`. Result:
   `TypeError: Cannot read properties of undefined (reading 'id')` on
   `res.body.project.id` - only this test failed.

Each break was reverted immediately after confirming the red result;
`npm test` was run again afterward and returned to `16/16` passing with
the same coverage numbers as the table above, confirming nothing was left
broken.

## X1 — coverage published from CI

`.github/workflows/assignment-2.yml` (repo root) runs against a real
`postgres:16` service container - writes `.env`/`.env.test` from the
workflow itself (never committed), runs `npm test` (the exact same
command as above, so CI enforces the identical 70%-per-service gate), and
uploads the `coverage/` directory as a workflow artifact
(`actions/upload-artifact@v4`) so the HTML/lcov report is downloadable
from the run page, not just a number in the log.

## X2 — an honestly-raised branch

`tasks.service.ts`'s private `loadTags()` throws `NotFoundException` when
a `tagIds` entry doesn't resolve to a real row - untested until this
assignment, because nothing in assignment-1's tests ever created a task
with tags at all. **What breaks if it regresses**: without this check, a
client could create a task pointing at a tag id that doesn't exist (e.g.
one that was since deleted), leaving a task silently referencing nothing
- the join would just quietly return no tag rather than surfacing that
the caller's request was wrong. The journey's
`rejects creating a task with a tag that does not exist (404)` step
exercises the throwing branch, and the following
`reassigns the task to the owner and attaches a real tag` step exercises
the non-throwing return path with a real `Tag` row (inserted directly via
repository, since this API has no tag-creation endpoint) - both branches
of the same `if`, not just the failure path.

## X3 — repeatable, and why

Ran `npm run test:e2e` **5 times in a row**: `16 passed, 16 total` every
time. The three usual causes, and why none of them apply here:

- **Shared state** - `test/global-setup.js` truncates every table
  (`TRUNCATE ... RESTART IDENTITY CASCADE`, via a plain `pg` client, not
  through the Nest app) once, right after migrations, before the single
  test file runs. Every invocation of `npm test`/`npm run test:e2e` starts
  from a genuinely empty database regardless of whether the previous
  invocation finished cleanly or crashed mid-flow - the second run in a
  row never fails on "email already registered."
- **Timing** - no `setTimeout`/sleep-based wait anywhere in the flow;
  every step's precondition is the previous step's actual response body,
  never a guessed delay.
- **Ports** - the journey talks to `app.getHttpServer()` (an unlistened
  `http.Server` Supertest drives directly), never `app.listen()` on a
  real TCP port, so there is no port to collide with another process on.

## Where things are

- `test/journey.e2e-spec.ts` — W1, W2, C1, C2, X2.
- `test/jest-e2e.json` — C3's `coverageThreshold`.
- `test/global-setup.js` — migrations + the truncate-before-run step
  behind X3's repeatability, plus the same-database guard carried over
  from assignment-1.
- `test/helpers/app.ts` — `createTestApp()`, reusing `src/bootstrap.ts`'s
  `configureApp()` so the journey exercises the real pipes/filters.
- `.github/workflows/assignment-2.yml` (repo root) — X1.
- `src/`, `src/migrations/` — the Week 9 application this journey drives,
  unchanged except none (no code changes were needed - only tests were
  added; the three C4 breaks above were all reverted).
