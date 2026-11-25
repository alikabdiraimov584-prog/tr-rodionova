UPDATE "Product"
SET "description" = 'Платье мини с несъёмным воротником-халтер и открытой спиной. Потайная молния.',
    "care" = 'Деликатная стирка при 30 °C. Химчистка.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'TR-DR-101';
