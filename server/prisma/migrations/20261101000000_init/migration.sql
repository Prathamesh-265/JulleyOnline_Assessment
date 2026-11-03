-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ORG_ADMIN', 'TENANT_ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tenant_id" UUID,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columns" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "column_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assigned_to" UUID,
    "created_by" UUID,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMP(3),
    "position" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_organization_id_name_key" ON "tenants"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_id_organization_id_key" ON "tenants"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_idx" ON "memberships"("tenant_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_organization_id_tenant_id_key" ON "memberships"("user_id", "organization_id", "tenant_id");

-- CreateIndex
CREATE INDEX "boards_tenant_id_idx" ON "boards"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "boards_id_tenant_id_key" ON "boards"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "columns_board_id_position_idx" ON "columns"("board_id", "position");

-- CreateIndex
CREATE INDEX "columns_tenant_id_idx" ON "columns"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "columns_id_board_id_key" ON "columns"("id", "board_id");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_idx" ON "tasks"("tenant_id");

-- CreateIndex
CREATE INDEX "tasks_column_id_position_idx" ON "tasks"("column_id", "position");

-- CreateIndex
CREATE INDEX "tasks_board_id_idx" ON "tasks"("board_id");

-- CreateIndex
CREATE INDEX "activity_logs_tenant_id_created_at_idx" ON "activity_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_tenant_id_entity_id_idx" ON "activity_logs"("tenant_id", "entity_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (composite: the tenant must belong to the membership's organization)
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "tenants"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (composite: board's organization must match its tenant's organization)
ALTER TABLE "boards" ADD CONSTRAINT "boards_tenant_id_organization_id_fkey" FOREIGN KEY ("tenant_id", "organization_id") REFERENCES "tenants"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (composite: a column's tenant must be its board's tenant)
ALTER TABLE "columns" ADD CONSTRAINT "columns_board_id_tenant_id_fkey" FOREIGN KEY ("board_id", "tenant_id") REFERENCES "boards"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (composite: a task's tenant must be its board's tenant)
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_tenant_id_fkey" FOREIGN KEY ("board_id", "tenant_id") REFERENCES "boards"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (composite: a task's column must be on the task's board)
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_id_fkey" FOREIGN KEY ("column_id", "board_id") REFERENCES "columns"("id", "board_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma's schema language can't express ---------------------------------

-- NULLs are distinct in a normal unique index, so org-level memberships need their own.
CREATE UNIQUE INDEX "memberships_org_level_key" ON "memberships"("user_id", "organization_id") WHERE "tenant_id" IS NULL;

-- Org Admin is the only org-level role; every tenant-level membership is Tenant Admin or Member.
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_scope_check" CHECK (("role" = 'ORG_ADMIN') = ("tenant_id" IS NULL));
