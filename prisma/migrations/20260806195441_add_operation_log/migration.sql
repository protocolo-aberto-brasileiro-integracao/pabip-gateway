-- CreateEnum
CREATE TYPE "operation_type" AS ENUM ('analytics_batch_received', 'video_session_live_requested', 'video_session_history_requested');

-- CreateTable (particionada por dia — ver operation-log-partition.job.ts)
CREATE TABLE "operation_log" (
    "id" TEXT NOT NULL,
    "operationType" "operation_type" NOT NULL,
    "peerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_log_pkey" PRIMARY KEY ("id","createdAt")
) PARTITION BY RANGE ("createdAt");

-- CreateIndex
CREATE INDEX "operation_log_operationType_createdAt_idx" ON "operation_log"("operationType", "createdAt");

-- Nenhuma partição diária real é criada aqui — `OperationLogPartitionJob`
-- garante isso no boot e via cron diário, sempre com antecedência
-- (hoje + OPERATION_LOG_PARTITION_LOOKAHEAD_DAYS). Esta partição DEFAULT
-- existe só como rede de segurança contra um insert cair fora de qualquer
-- partição já criada (ex.: processo fora do ar por mais tempo que o
-- lookahead cobre) — nunca deveria receber linhas em operação normal.
CREATE TABLE "operation_log_default" PARTITION OF "operation_log" DEFAULT;
