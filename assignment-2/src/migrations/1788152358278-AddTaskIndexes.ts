import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaskIndexes1788152358278 implements MigrationInterface {
  name = 'AddTaskIndexes1788152358278';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_6086c8dafbae729a930c04d865" ON "tasks"  ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9eecdb5b1ed8c7c2a1b392c28d" ON "tasks"  ("project_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_855d484825b715c545349212c7" ON "tasks"  ("assignee_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_855d484825b715c545349212c7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9eecdb5b1ed8c7c2a1b392c28d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6086c8dafbae729a930c04d865"`,
    );
  }
}
