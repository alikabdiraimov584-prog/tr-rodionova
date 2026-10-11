-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'yandex_direct',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'external',
    "category" TEXT,
    "state" TEXT,
    "status" TEXT,
    "statusPayment" TEXT,
    "strategy" TEXT,
    "weeklyBudget" INTEGER,
    "plannedWeekly" INTEGER,
    "targetCpa" INTEGER,
    "utmCampaign" TEXT,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdStat" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'yandex_direct',
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_provider_externalId_key" ON "AdCampaign"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AdStat_date_idx" ON "AdStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdStat_provider_campaignId_date_key" ON "AdStat"("provider", "campaignId", "date");

