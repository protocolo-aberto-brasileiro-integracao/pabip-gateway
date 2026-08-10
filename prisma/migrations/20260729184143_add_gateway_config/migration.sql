-- CreateEnum
CREATE TYPE "config_source" AS ENUM ('file', 'env', 'api', 'default');

-- CreateTable
CREATE TABLE "gateway_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" "config_source" NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_config_pkey" PRIMARY KEY ("key")
);
