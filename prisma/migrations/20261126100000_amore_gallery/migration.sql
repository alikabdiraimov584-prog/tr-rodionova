WITH photos (id, filename, alt, position) AS (
    VALUES
        ('amore-gallery-0121', 'amore-open-back-a341.webp', 'Платье Amore, открытая спина крупным планом', 1),
        ('amore-gallery-0122', 'amore-back-a184.webp', 'Платье Amore со спины в студии', 2),
        ('amore-gallery-0120', 'amore-front-a198.webp', 'Платье Amore спереди на тёмном фоне', 3),
        ('amore-gallery-0123', 'amore-profile-a170.webp', 'Платье Amore в профиль', 4)
)
INSERT INTO "ProductImage" ("id", "productId", "url", "alt", "order")
SELECT photos.id,
       product.id,
       '/images/brand/TR-DR-101/' || photos.filename,
       photos.alt,
       COALESCE((
           SELECT MAX(existing."order")
           FROM "ProductImage" existing
           WHERE existing."productId" = product.id
       ), -1) + photos.position
FROM "Product" product
CROSS JOIN photos
WHERE product.sku = 'TR-DR-101'
ON CONFLICT ("id") DO NOTHING;
