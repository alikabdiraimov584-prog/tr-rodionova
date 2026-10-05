import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { activeIntegration, recordCheck } from "@/lib/integrations/store";
import { sendAlert } from "@/lib/alerts";

/**
 * Резервные копии базы. Дамп делает сервис `backup` в docker compose (pg_dump каждую ночь) в общий том,
 * который приложение видит как BACKUP_DIR (только чтение). Приложение раз в сутки загружает свежий дамп
 * в S3 по ключам из CRM → Интеграции → «Резервные копии в S3» и удаляет в бакете копии старше лимита.
 * Так копии живут отдельно от сервера, а ключи не нужно вводить в консоли.
 */

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/app/backups";
const STATE_KEY = "backupState";

type BackupState = { lastFile?: string; uploadedAt?: string; lastError?: string | null; lastErrorAt?: string; objects?: number };

async function state(): Promise<BackupState> {
  const row = await db.setting.findUnique({ where: { key: STATE_KEY } });
  return ((row?.value as BackupState | null) ?? {}) as BackupState;
}

async function saveState(patch: BackupState) {
  const next = { ...(await state()), ...patch };
  await db.setting.upsert({ where: { key: STATE_KEY }, update: { value: next }, create: { key: STATE_KEY, value: next } });
  return next;
}

/** Свежий локальный дамп: имя и время. */
export async function latestLocalDump(): Promise<{ file: string; path: string; mtime: Date; size: number } | null> {
  let names: string[];
  try {
    names = (await readdir(BACKUP_DIR)).filter((n) => n.endsWith(".sql.gz"));
  } catch {
    return null;
  }
  const withTime = await Promise.all(names.map(async (n) => ({ file: n, path: path.join(BACKUP_DIR, n), ...(await stat(path.join(BACKUP_DIR, n)).then((s) => ({ mtime: s.mtime, size: s.size }))) })));
  withTime.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return withTime[0] ?? null;
}

type S3Config = { endpoint: string; region: string; bucket: string; accessKey: string; secretKey: string; prefix: string; keep: number };

function toConfig(c: Record<string, string>): S3Config | null {
  if (!c.bucket || !c.accessKey || !c.secretKey) return null;
  return {
    endpoint: (c.endpoint || "https://s3.twcstorage.ru").replace(/\/$/, ""),
    region: c.region || "ru-1",
    bucket: c.bucket,
    accessKey: c.accessKey,
    secretKey: c.secretKey,
    prefix: (c.prefix || "db/").replace(/^\/+/, "").replace(/\/?$/, "/"),
    keep: Number(c.keep) > 0 ? Number(c.keep) : 30,
  };
}

function client(c: S3Config) {
  return new S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true, credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey } });
}

/** Проверка ключей из карточки интеграции: доступ к бакету и число копий в нём. */
export async function testS3(config: Record<string, string>) {
  const c = toConfig(config);
  if (!c) return { ok: false as const, error: "Укажите бакет, Access Key и Secret Key" };
  try {
    const s3 = client(c);
    await s3.send(new HeadBucketCommand({ Bucket: c.bucket }));
    const list = await s3.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: c.prefix, MaxKeys: 1000 }));
    const n = list.KeyCount ?? list.Contents?.length ?? 0;
    const local = await latestLocalDump();
    return { ok: true as const, info: `Бакет доступен, копий в ${c.prefix}: ${n}${local ? `; свежий локальный дамп ${local.mtime.toLocaleString("ru-RU")}` : "; локального дампа ещё нет"}` };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "S3 недоступен" };
  }
}

/** Загрузить свежий дамп в S3 (если ещё не загружен) и удалить лишние копии. Вызывается ежедневно из cron. */
export async function uploadLatestBackup(): Promise<{ ok: boolean; uploaded?: string; skipped?: string; error?: string }> {
  const i = await activeIntegration("s3_backup");
  const c = i ? toConfig(i.config) : null;
  if (!c) return { ok: true, skipped: "S3 не настроен" };
  const local = await latestLocalDump();
  if (!local) {
    await saveState({ lastError: "локальный дамп не найден: проверьте сервис backup", lastErrorAt: new Date().toISOString() });
    await recordCheck("s3_backup", false, "локальный дамп не найден");
    await sendAlert("копия базы не загружена в S3: на сервере нет дампа. Проверьте CRM → Интеграции → «Резервные копии в S3».", { key: "backup-no-dump" });
    return { ok: false, error: "локальный дамп не найден" };
  }
  const st = await state();
  if (st.lastFile === local.file && !st.lastError) return { ok: true, skipped: "уже загружен" };
  try {
    const s3 = client(c);
    const key = `${c.prefix}${local.file}`;
    await s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: createReadStream(local.path), ContentLength: local.size, ContentType: "application/gzip" }));
    const list = await s3.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: c.prefix, MaxKeys: 1000 }));
    const objects = (list.Contents ?? []).filter((o) => o.Key?.endsWith(".sql.gz")).sort((a, b) => (a.Key ?? "").localeCompare(b.Key ?? ""));
    const extra = objects.slice(0, Math.max(0, objects.length - c.keep));
    if (extra.length) await s3.send(new DeleteObjectsCommand({ Bucket: c.bucket, Delete: { Objects: extra.map((o) => ({ Key: o.Key! })), Quiet: true } }));
    await saveState({ lastFile: local.file, uploadedAt: new Date().toISOString(), lastError: null, objects: objects.length - extra.length });
    await recordCheck("s3_backup", true, null);
    return { ok: true, uploaded: key };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "S3 недоступен";
    await saveState({ lastError: msg, lastErrorAt: new Date().toISOString() });
    await sendAlert(`не удалось загрузить копию базы в S3: ${msg}`, { key: "backup-upload" });
    await recordCheck("s3_backup", false, msg);
    return { ok: false, error: msg };
  }
}

/** Сводка для /api/health и мониторинга. */
/**
 * Состояние службы дампов: файл .status, который сервис backup пишет при старте и после каждой попытки
 * («started …», «ok <файл> …», «failed: <ошибка pg_dump> …»). Если файла нет — служба не запускалась
 * или том не подключён к приложению; если каталог недоступен — об этом тоже сообщаем.
 */
async function localStatus(): Promise<string> {
  try {
    const text = (await readFile(path.join(BACKUP_DIR, ".status"), "utf8")).trim();
    // кавычки убираем, чтобы строка в JSON /api/health читалась простыми средствами (sed в проверке сайта)
    return text.replace(/"/g, "'") || "служба дампов ещё ничего не сообщала";
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      try {
        await readdir(BACKUP_DIR);
        return "служба дампов ещё не запускалась (нет файла состояния)";
      } catch {
        return "каталог бэкапов недоступен приложению (том не подключён)";
      }
    }
    return `файл состояния не читается: ${code ?? String(e)}`;
  }
}

export async function backupStatus() {
  const [local, status, st, i] = await Promise.all([latestLocalDump(), localStatus(), state(), activeIntegration("s3_backup")]);
  return {
    localAt: local?.mtime.toISOString() ?? null,
    localStatus: status,
    s3Enabled: !!(i && toConfig(i.config)),
    uploadedAt: st.uploadedAt ?? null,
    objects: st.objects ?? null,
    error: st.lastError ?? null,
  };
}

const STALE_HOURS = 36;

/**
 * Ежедневная проверка копий (вызывается после загрузки в S3): дамп не сделался или старше STALE_HOURS,
 * копия в S3 при включённой интеграции старше STALE_HOURS — тревога владельцу.
 */
export async function checkBackupHealth() {
  const st = await backupStatus();
  const problems: string[] = [];
  const age = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : Infinity);
  if (st.localStatus.startsWith("failed")) problems.push(`дамп базы не сделан: ${st.localStatus}`);
  else if (age(st.localAt) > STALE_HOURS) problems.push(st.localAt ? `последний дамп базы сделан ${Math.round(age(st.localAt))} ч назад` : `дампов базы на сервере нет (${st.localStatus})`);
  if (st.s3Enabled && age(st.uploadedAt) > STALE_HOURS) problems.push(st.uploadedAt ? `копия в S3 старше ${Math.round(age(st.uploadedAt))} ч` : "копия в S3 ещё ни разу не загружалась");
  if (problems.length) await sendAlert(`резервные копии: ${problems.join("; ")}.`, { key: "backup-health" });
  return { problems };
}
