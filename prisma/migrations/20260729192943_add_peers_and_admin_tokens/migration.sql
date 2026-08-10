-- CreateTable
CREATE TABLE "peers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "theirApiKey" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "ipAllowlist" TEXT[],
    "capabilities" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "peers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "peers_apiKeyHash_key" ON "peers"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "admin_tokens_tokenHash_key" ON "admin_tokens"("tokenHash");
