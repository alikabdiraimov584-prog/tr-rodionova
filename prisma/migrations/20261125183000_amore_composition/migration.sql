UPDATE "Product"
SET "composition" = '47% вискозы, 50% полиэстера, 3% эластана',
    "material" = CASE WHEN lower("material") IN ('шёлк', 'шелк') THEN 'Смесовая ткань' ELSE "material" END,
    "description" = replace("description", ' Шёлковый креп из Комо с матовой поверхностью: держит силуэт и не просвечивает.', ''),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'TR-DR-101';
