INSERT INTO "ProductVariant" ("id", "productId", "sku", "size", "color", "colorHex", "stock", "reserved")
SELECT 'amore-variant-xxs',
       product.id,
       'TR-DR-101-00',
       'XXS',
       COALESCE(xs."color", 'Айвори'),
       COALESCE(xs."colorHex", '#F8F5EE'),
       0,
       0
FROM "Product" product
LEFT JOIN "ProductVariant" xs ON xs."sku" = 'TR-DR-101-01' AND xs."productId" = product.id
WHERE product."sku" = 'TR-DR-101'
  AND NOT EXISTS (
      SELECT 1 FROM "ProductVariant" variant
      WHERE variant."productId" = product.id
        AND upper(trim(variant."size")) = 'XXS'
        AND variant."archivedAt" IS NULL
  )
ON CONFLICT ("sku") DO UPDATE SET "archivedAt" = NULL
WHERE "ProductVariant"."productId" = excluded."productId"
  AND upper(trim("ProductVariant"."size")) = 'XXS';
