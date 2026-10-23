import type { JournalBatchArticle } from "./types";
import { batch20261023 } from "./2026-10-23";
import { batch20261028 } from "./2026-10-28";
import { batch20261102 } from "./2026-11-02";

/** Все пачки статей по порядку выхода. Новая пачка — новый файл и строка здесь; проверка: npm run check:journal */
export const JOURNAL_BATCHES: JournalBatchArticle[][] = [batch20261023, batch20261028, batch20261102];
