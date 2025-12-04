-- CreateTable
CREATE TABLE "AIOrderInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "insightText" TEXT NOT NULL,
    "followupSubject" TEXT,
    "followupBody" TEXT,
    "customerType" TEXT,
    "orderValue" REAL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AIOrderInsight_shop_createdAt_idx" ON "AIOrderInsight"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AIOrderInsight_orderId_idx" ON "AIOrderInsight"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AIOrderInsight_shop_orderId_key" ON "AIOrderInsight"("shop", "orderId");
