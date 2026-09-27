import { SetMetadata } from '@nestjs/common';

export const PROJECT_SOURCE_KEY = 'projectSource';

export type ProjectSource =
  | { kind: 'project-param'; param: string }
  | { kind: 'body-field'; field: string }
  | { kind: 'query-field'; field: string }
  | { kind: 'task-param'; param: string };

/** The route param named `param` IS the project id (e.g. /projects/:id). */
export const ProjectFromRoute = (param: string) =>
  SetMetadata(PROJECT_SOURCE_KEY, {
    kind: 'project-param',
    param,
  } satisfies ProjectSource);

/** The project id is a field in the request body (e.g. POST /tasks). */
export const ProjectFromBody = (field: string) =>
  SetMetadata(PROJECT_SOURCE_KEY, {
    kind: 'body-field',
    field,
  } satisfies ProjectSource);

/** The project id is a query parameter (e.g. GET /tasks?projectId=). */
export const ProjectFromQuery = (field: string) =>
  SetMetadata(PROJECT_SOURCE_KEY, {
    kind: 'query-field',
    field,
  } satisfies ProjectSource);

/**
 * The route param named `param` is a TASK id - RolesGuard loads that task
 * to find the project it belongs to (e.g. /tasks/:id, /tasks/:taskId/comments).
 * This is what makes C3 (a role on project A grants nothing on project B)
 * hold for routes that only carry a task id, not a project id.
 */
export const ProjectFromTask = (param: string) =>
  SetMetadata(PROJECT_SOURCE_KEY, {
    kind: 'task-param',
    param,
  } satisfies ProjectSource);
