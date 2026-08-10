-- CreateEnum
CREATE TYPE "audit_category" AS ENUM ('delivery', 'peer_store', 'access');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "category" "audit_category" NOT NULL,
    "action" TEXT NOT NULL,
    "peerId" TEXT,
    "detail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");
