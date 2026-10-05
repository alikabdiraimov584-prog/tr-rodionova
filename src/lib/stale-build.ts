import { unstable_isUnrecognizedActionError } from "next/navigation";

/**
 * Ошибка «разъезда версий»: вкладка открыта до обновления сайта, а кнопка нажата после. Сервер уже не знает
 * старый идентификатор действия или старый файл скрипта. Лечится перезагрузкой страницы, а не показом ошибки.
 */
export function isStaleBuildError(error: Error & { digest?: string }) {
  const err: Error = error;
  if (unstable_isUnrecognizedActionError(err)) return true;
  const { name, message } = error;
  if (name === "ChunkLoadError") return true;
  return /Loading chunk|dynamically imported module|Importing a module script failed|Server Action .* was not found|older or newer deployment/i.test(message ?? "");
}

const KEY = "tr-stale-reload";

/** Перезагрузить страницу один раз в минуту: защита от бесконечного цикла, если ошибка не из-за обновления. */
export function reloadOnceForStaleBuild() {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // приватный режим: перезагружаем без защёлки
  }
  window.location.reload();
  return true;
}
