-- Интервал доставки
ALTER TABLE "Order" ADD COLUMN "deliverySlot" TEXT;

-- Корзина гостя
CREATE TABLE "GuestCartItem" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestCartItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestCartItem_token_variantId_key" ON "GuestCartItem"("token", "variantId");
CREATE INDEX "GuestCartItem_token_idx" ON "GuestCartItem"("token");
ALTER TABLE "GuestCartItem" ADD CONSTRAINT "GuestCartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Коды входа по e-mail
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginCode_email_createdAt_idx" ON "LoginCode"("email", "createdAt");
