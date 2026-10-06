/** Заглушки из public/images/placeholder: вещи без съёмки уходят в конец списков, чтобы витрину открывали настоящие фото. */
export const isRealPhoto = (url: string | undefined | null) => !!url && !url.startsWith("/images/placeholder/");

/** Устойчивая сортировка: сначала вещи с настоящими фото, порядок внутри групп сохраняется. */
export function photoFirst<T extends { images: { url: string }[] }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(isRealPhoto(b.images[0]?.url)) - Number(isRealPhoto(a.images[0]?.url)));
}
