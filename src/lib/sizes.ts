/** Единая таблица мерок построения. Все обхваты в сантиметрах. */
export const SIZE_ROWS = [
  { ru: 40, size: "XXS", bust: [80, 80], waist: [60, 60], hips: [88, 88] },
  { ru: 42, size: "XS", bust: [82, 82], waist: [64, 64], hips: [92, 92] },
  { ru: 44, size: "S", bust: [88, 88], waist: [68, 70], hips: [96, 96] },
  { ru: 46, size: "M", bust: [92, 92], waist: [72, 74], hips: [100, 102] },
] as const;

export type Measures = { bust?: number | null; waist?: number | null; hips?: number | null; height?: number | null };

export type Fit = "точно" | "на грани, лучше взять больше" | "между размерами" | "нужна примерка";

export type SizeAdvice = { size: string; fit: Fit; note: string };

export function recommendSize(measures: Measures): SizeAdvice | null {
  const keys = (["bust", "waist", "hips"] as const).filter(key => (measures[key] ?? 0) > 0);
  if (!keys.length) return null;

  const indices = keys.map(key => {
    const index = SIZE_ROWS.findIndex(row => measures[key]! <= row[key][1]);
    return index < 0 ? SIZE_ROWS.length - 1 : index;
  });
  const largest = Math.max(...indices);
  const smallest = Math.min(...indices);
  const row = SIZE_ROWS[largest];
  if (keys.some(key => measures[key]! > SIZE_ROWS[SIZE_ROWS.length - 1][key][1])) {
    return { size: row.size, fit: "нужна примерка", note: "Мерки выходят за таблицу. Уточните посадку в службе заботы." };
  }
  if (largest !== smallest) {
    return { size: row.size, fit: "между размерами", note: `По разным меркам подходят размеры ${SIZE_ROWS[smallest].size} и ${row.size}. Ориентируйтесь на больший.` };
  }
  const exact = keys.every(key => measures[key]! >= row[key][0]);
  return exact
    ? { size: row.size, fit: "точно", note: `Мерки соответствуют размеру ${row.size}.` }
    : { size: row.size, fit: "между размерами", note: `Ближайший размер по таблице — ${row.size}.` };
}

/** Как снять мерки — для страницы размеров и профиля. */
export const MEASURE_GUIDE: { key: "bust" | "waist" | "hips" | "height"; label: string; how: string }[] = [
  { key: "bust", label: "Обхват груди", how: "Сантиметр по самым выступающим точкам груди, горизонтально, не затягивая. В тонком белье." },
  { key: "waist", label: "Обхват талии", how: "По самому узкому месту — обычно на 2–3 см выше пупка. Не втягивайте живот." },
  { key: "hips", label: "Обхват бёдер", how: "По самой широкой части бёдер и ягодиц, ноги вместе. Сантиметр параллельно полу." },
  { key: "height", label: "Рост", how: "Без обуви, у стены. Нужен, чтобы подсказать длину рукава и изделия." },
];
