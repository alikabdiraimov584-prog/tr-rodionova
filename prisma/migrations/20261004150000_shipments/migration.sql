-- Отправления службы доставки: идентификатор у перевозчика, статус и время последней сверки
ALTER TABLE "Order" ADD COLUMN "shipmentId" TEXT,
ADD COLUMN "shipmentStatus" TEXT,
ADD COLUMN "shipmentSyncedAt" TIMESTAMP(3);
