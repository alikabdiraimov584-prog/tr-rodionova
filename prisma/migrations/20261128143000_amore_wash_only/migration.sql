UPDATE "Product"
SET "care" = 'Деликатная стирка при температуре не выше 30 °C.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'TR-DR-101';
