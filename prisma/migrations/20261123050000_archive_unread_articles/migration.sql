BEGIN;
CREATE TEMP TABLE retired_journal_slugs ON COMMIT DROP AS
SELECT a.slug FROM "Article" a
WHERE a."publishedAt" <= CURRENT_TIMESTAMP AND a.slug IN (
  'belaya-rubashka-s-chem-nosit',
  'belye-veshchi-uhod',
  'belyy-kostyum-zimoy',
  'bodi-baza-garderoba',
  'chto-nadet-na-sobesedovanie',
  'garderob-v-komandirovku',
  'hranenie-mezhdu-sezonami',
  'italyanskaya-kostyumnaya-sherst',
  'kak-gladit-rubashku',
  'kak-otlichit-kachestvennuyu-veshch',
  'kak-sozdaetsya-veshch',
  'kak-stirat-kashemir',
  'kak-zavyazat-sharf',
  'kakie-bryuki-vybrat',
  'kapsula-iz-pyati-veshchey',
  'kardigan-vmesto-zhaketa',
  'kashemir-kak-otlichit',
  'malyy-tirazh-odezhdy',
  'merinos-i-kashemir',
  'mnogosloynost-v-odezhde',
  'naturalnye-tkani-zimoy',
  'palto-s-chem-nosit',
  'plate-na-novyy-god',
  'pochemu-net-rasprodazh',
  'poplin-chto-eto-za-tkan',
  'poshiv-v-evrope',
  'predzakaz-odezhdy',
  'primerka-kurerom-kak-rabotaet',
  'pyatna-na-shyolke',
  's-chem-nosit-bryuki-palazzo',
  'sherst-s-shyolkom-v-zhakete',
  'sherstyanoe-plate-zimoy',
  'shyolk-iz-komo',
  'shyolk-zimoy',
  'shyolkovaya-bluza-v-ofis',
  'sintetika-v-sostave',
  'smart-casual-dlya-zhenshchin',
  'stoimost-za-nosku',
  'uhod-za-kostyumnoy-sherstyu',
  'uhod-za-palto',
  'viskoza-v-trikotazhe',
  'vozvrat-odezhdy-pravila',
  'yubka-trapetsiya-mini-osenyu',
  'zhaket-i-yubka-obraz'
) AND NOT EXISTS (
  SELECT 1 FROM "AnalyticsEvent" e JOIN "VisitorSession" s ON s.id = e."sessionId"
  WHERE e.type = 'PAGEVIEW' AND e."createdAt" >= a."publishedAt"
  AND rtrim(split_part(split_part(e.path, '?', 1), '#', 1), '/') = '/journal/' || a.slug
);
UPDATE "Article" SET "publishedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE slug IN (SELECT slug FROM retired_journal_slugs);
-- Preserve readable anchor text in the remaining articles.
DO $$
DECLARE retired record;
BEGIN
  FOR retired IN SELECT slug FROM retired_journal_slugs LOOP
    UPDATE "Article" SET body = regexp_replace(body, '\[([^]]+)\]\(/journal/' || retired.slug || '\)', '\1', 'g'),
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "publishedAt" IS NOT NULL AND strpos(body, '](/journal/' || retired.slug || ')') > 0;
  END LOOP;
END $$;
COMMIT;
