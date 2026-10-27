-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "caseRef" TEXT,
ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "operation_log" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "caseRef" TEXT,
ADD COLUMN     "requestId" TEXT;
