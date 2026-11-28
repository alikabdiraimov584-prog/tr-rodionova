UPDATE "Product"
SET "care" = 'Деликатная стирка при температуре не выше 30 °C.
Химчистка.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'TR-DR-101';
