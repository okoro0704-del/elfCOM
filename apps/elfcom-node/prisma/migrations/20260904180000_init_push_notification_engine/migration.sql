-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('NORMAL', 'HIGH', 'MAX');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "device_push_tokens" (
    "id" TEXT NOT NULL,
    "trust_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "push_token" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "app_id" TEXT NOT NULL,
    "target_trust_id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "priority" "PriorityLevel" NOT NULL DEFAULT 'HIGH',
    "channel_id" TEXT NOT NULL DEFAULT 'default_alerts',
    "data_payload" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "failure_reason" TEXT,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_push_tokens_push_token_key" ON "device_push_tokens"("push_token");

-- CreateIndex
CREATE INDEX "device_push_tokens_trust_id_app_id_idx" ON "device_push_tokens"("trust_id", "app_id");

-- CreateIndex
CREATE INDEX "device_push_tokens_trust_id_is_active_idx" ON "device_push_tokens"("trust_id", "is_active");

-- CreateIndex
CREATE INDEX "notification_jobs_target_trust_id_created_at_idx" ON "notification_jobs"("target_trust_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_jobs_status_created_at_idx" ON "notification_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_job_id_idx" ON "notification_deliveries"("job_id");

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "notification_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
