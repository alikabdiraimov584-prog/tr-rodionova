-- Prisma timestamps are UTC. Reschedule only entries still at their original time.
UPDATE "Article" AS a
SET "publishedAt" = schedule.new_time, "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('sled-ot-veshalki', TIMESTAMP '2026-11-25 07:00:00', TIMESTAMP '2026-11-24 09:30:00'),
  ('krep-ili-atlas', TIMESTAMP '2026-11-26 07:00:00', TIMESTAMP '2026-11-24 12:00:00'),
  ('test-shlicy', TIMESTAMP '2026-11-27 07:00:00', TIMESTAMP '2026-11-24 14:30:00'),
  ('odin-zhaket-dva-vorota', TIMESTAMP '2026-11-28 07:00:00', TIMESTAMP '2026-11-24 17:00:00'),
  ('tonalnye-tufli-i-midi', TIMESTAMP '2026-11-29 07:00:00', TIMESTAMP '2026-11-25 09:30:00'),
  ('kak-slozhit-yubku-plisse', TIMESTAMP '2026-11-30 07:00:00', TIMESTAMP '2026-11-25 12:00:00'),
  ('podkladka-ili-chehol', TIMESTAMP '2026-12-01 07:00:00', TIMESTAMP '2026-11-25 14:30:00'),
  ('test-rukava-pod-palto', TIMESTAMP '2026-12-02 07:00:00', TIMESTAMP '2026-11-25 17:00:00'),
  ('odno-plate-dve-sumki', TIMESTAMP '2026-12-03 07:00:00', TIMESTAMP '2026-11-25 07:00:00'),
  ('poluzapravka-rubashki', TIMESTAMP '2026-12-04 07:00:00', TIMESTAMP '2026-11-26 12:00:00'),
  ('kak-hranit-remni', TIMESTAMP '2026-12-05 07:00:00', TIMESTAMP '2026-11-26 14:30:00'),
  ('sarza-i-polotno', TIMESTAMP '2026-12-06 07:00:00', TIMESTAMP '2026-11-26 17:00:00'),
  ('test-karmana', TIMESTAMP '2026-12-07 07:00:00', TIMESTAMP '2026-11-26 07:00:00'),
  ('odna-yubka-dva-verha', TIMESTAMP '2026-12-08 07:00:00', TIMESTAMP '2026-11-26 09:30:00'),
  ('sergi-k-vysokomu-vorotu', TIMESTAMP '2026-12-09 07:00:00', TIMESTAMP '2026-11-27 14:30:00'),
  ('sledy-zazhimov', TIMESTAMP '2026-12-10 07:00:00', TIMESTAMP '2026-11-27 17:00:00'),
  ('vors-i-napravlenie', TIMESTAMP '2026-12-11 07:00:00', TIMESTAMP '2026-11-27 07:00:00'),
  ('test-poyasa-sidya', TIMESTAMP '2026-12-12 07:00:00', TIMESTAMP '2026-11-27 09:30:00'),
  ('odno-palto-dva-sharfa', TIMESTAMP '2026-12-13 07:00:00', TIMESTAMP '2026-11-27 12:00:00'),
  ('manzhety-pod-zhaketom', TIMESTAMP '2026-12-14 07:00:00', TIMESTAMP '2026-11-28 17:00:00'),
  ('kak-ukladyvat-trikotazh', TIMESTAMP '2026-12-15 07:00:00', TIMESTAMP '2026-11-28 07:00:00'),
  ('poplin-ili-oksford', TIMESTAMP '2026-12-16 07:00:00', TIMESTAMP '2026-11-28 09:30:00'),
  ('test-podola-v-dvizhenii', TIMESTAMP '2026-12-17 07:00:00', TIMESTAMP '2026-11-28 12:00:00'),
  ('odni-bryuki-dva-remnya', TIMESTAMP '2026-12-18 07:00:00', TIMESTAMP '2026-11-28 14:30:00'),
  ('botilony-i-pryamye-bryuki', TIMESTAMP '2026-12-19 07:00:00', TIMESTAMP '2026-11-29 07:00:00'),
  ('kak-provetrivat-palto', TIMESTAMP '2026-12-20 07:00:00', TIMESTAMP '2026-11-29 09:30:00'),
  ('matovaya-i-glyantsevaya-pryazha', TIMESTAMP '2026-12-21 07:00:00', TIMESTAMP '2026-11-29 12:00:00'),
  ('test-zastezhki-zhaketa', TIMESTAMP '2026-12-22 07:00:00', TIMESTAMP '2026-11-29 14:30:00'),
  ('odna-rubashka-dva-silueta', TIMESTAMP '2026-12-23 07:00:00', TIMESTAMP '2026-11-29 17:00:00')
) AS schedule(slug, old_time, new_time)
WHERE a.slug = schedule.slug AND a."publishedAt" = schedule.old_time;
