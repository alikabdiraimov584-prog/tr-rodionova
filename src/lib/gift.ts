import { randomInt } from "node:crypto";

/** Номиналы и правила подарочных сертификатов (в рублях). */
export const GIFT_PRESETS = [10_000, 20_000, 30_000, 50_000] as const;
export const GIFT_MIN_RUB = 5_000;
export const GIFT_MAX_RUB = 300_000;
export const GIFT_VALIDITY_MONTHS = 12;

/** Код вида TR-XXXX-XXXX-XXXX-XXXX без похожих символов (0/O, 1/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateGiftCode() {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `TR-${group()}-${group()}-${group()}-${group()}`;
}
