/**
 * Мгновенный отклик при переходе между разделами CRM: меню остаётся на месте, вместо содержимого сразу видна
 * заготовка страницы, пока сервер собирает данные. Без неё клик по разделу ничего не менял до прихода ответа,
 * и при медленной связи CRM казалась зависшей.
 */
export default function CrmLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Загружаем раздел…</span>
      <div aria-hidden className="h-0.5 w-full overflow-hidden rounded bg-line">
        <div className="h-full w-1/3 animate-pulse rounded bg-ink/40" />
      </div>
      <div aria-hidden className="space-y-3">
        <div className="h-7 w-56 animate-pulse rounded bg-sand" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-sand" />
      </div>
      <div aria-hidden className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-sand/60" />
        ))}
      </div>
      <div aria-hidden className="card space-y-3 p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-sand" style={{ width: `${90 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
