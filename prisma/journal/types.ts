/**
 * Статья из пачки журнала. Пачки пишутся заранее и выходят по расписанию: publishedAt — точное время выхода
 * (ISO с часовым поясом), до него статья не видна ни на сайте, ни в карте сайта, ни в RSS и llms.txt.
 * В момент выхода адрес уходит в Яндекс и Bing через IndexNow (ежечасная задача). Создаётся один раз по slug:
 * правки и снятие с публикации в CRM → Контент не перезаписываются при обновлениях.
 */
export type JournalBatchArticle = {
  slug: string;
  title: string;
  /** «Коротко» под заголовком: прямой ответ на вопрос заголовка в 1–2 предложениях */
  excerpt: string;
  category: "Стиль" | "Уход" | "Ткани" | "Сервис" | "Ателье";
  /** обложка — фото этой вещи (по порядку coverIndex), если у неё есть фото; иначе coverFallback */
  coverProduct?: string;
  coverIndex?: number;
  coverFallback: string;
  publishedAt: string;
  /** вещи из статьи: блок «Вещи из статьи» и разметка mentions */
  products: string[];
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  body: string;
};
