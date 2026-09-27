import { DataSource } from 'typeorm';

const REQUIRED_SUFFIX = '_test';

// W2/X3: the one place a test truncates data. Refuses to run against
// anything whose name doesn't look like a test database - cheap insurance
// against a misconfigured `.env.test` wiping real rows, on top of the
// same check global-setup already runs once before the suite starts.
export async function truncateAll(dataSource: DataSource): Promise<void> {
  const dbName = (dataSource.options as { database?: string }).database;
  if (
    typeof dbName !== 'string' ||
    !dbName.toLowerCase().endsWith(REQUIRED_SUFFIX)
  ) {
    throw new Error(
      `Refusing to truncate database "${String(dbName)}" - its name doesn't end in ` +
        `"${REQUIRED_SUFFIX}", so this doesn't look like the test database.`,
    );
  }

  const tables = dataSource.entityMetadatas
    .map((meta) => `"${meta.tableName}"`)
    .join(', ');
  await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
