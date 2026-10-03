/** Размерные таблицы бренда и советник по размеру. Все мерки — в сантиметрах. */

export type SizeChartKey = "outer" | "knit" | "dress" | "trousers" | "skirt";

export type SizeRow = {
  size: string;
  bust: [number, number];
  waist: [number, number];
  hips: [number, number];
};

export type SizeChart = {
  key: SizeChartKey;
  title: string;
  hint: string;
  /** Какие мерки определяют размер для этого типа вещей */
  primary: ("bust" | "waist" | "hips")[];
  rows: SizeRow[];
};

const SIZES = ["XS", "S", "M", "L", "XL"] as const;

/** Базовая сетка тела: XS 80/60/86 … XL 96/76/102, шаг 4 см. */
const grid = (offset: { bust: number; waist: number; hips: number }): SizeRow[] =>
  SIZES.map((size, i) => ({
    size,
    bust: [80 + i * 4 + offset.bust, 84 + i * 4 + offset.bust],
    waist: [60 + i * 4 + offset.waist, 64 + i * 4 + offset.waist],
    hips: [86 + i * 4 + offset.hips, 90 + i * 4 + offset.hips],
  }));

export const SIZE_CHARTS: Record<SizeChartKey, SizeChart> = {
  outer: {
    key: "outer",
    title: "Пальто и жакеты",
    hint: "Свободная посадка с запасом на слой: ориентируйтесь на обхват груди.",
    primary: ["bust"],
    rows: grid({ bust: 0, waist: 0, hips: 0 }),
  },
  knit: {
    key: "knit",
    title: "Трикотаж",
    hint: "Тянется на 2–4 см. Для посадки «оверсайз» берите на размер больше.",
    primary: ["bust"],
    rows: grid({ bust: 0, waist: 2, hips: 2 }),
  },
  dress: {
    key: "dress",
    title: "Платья",
    hint: "Размер по груди и бёдрам; если они в разных размерах — выбирайте больший.",
    primary: ["bust", "hips"],
    rows: grid({ bust: 0, waist: 0, hips: 0 }),
  },
  trousers: {
    key: "trousers",
    title: "Брюки",
    hint: "Главная мерка — бёдра, затем талия. Посадка на талии, длина под рост 170 см.",
    primary: ["hips", "waist"],
    rows: grid({ bust: 0, waist: 0, hips: 0 }),
  },
  skirt: {
    key: "skirt",
    title: "Юбки",
    hint: "Размер по бёдрам; талия — с запасом 2 см на пояс.",
    primary: ["hips", "waist"],
    rows: grid({ bust: 0, waist: 2, hips: 0 }),
  },
};

export const SIZE_CHART_KEYS = Object.keys(SIZE_CHARTS) as SizeChartKey[];

export type Measures = { bust?: number | null; waist?: number | null; hips?: number | null; height?: number | null };

export type Fit = "точно" | "на грани, лучше взять больше" | "между размерами" | "нужна примерка";

export type SizeAdvice = { size: string; fit: Fit; note: string };

/** Индекс строки таблицы, в которую попадает мерка; за пределами сетки — крайние размеры. */
function rowIndex(chart: SizeChart, key: "bust" | "waist" | "hips", value: number): number {
  const rows = chart.rows;
  if (value < rows[0][key][0]) return 0;
  for (let i = 0; i < rows.length; i++) {
    const [min, max] = rows[i][key];
    if (value >= min && value <= max) return i;
    const next = rows[i + 1];
    if (next && value > max && value < next[key][0]) return i + 1;
  }
  return rows.length - 1;
}

/**
 * Подбор размера по меркам. Если мерок для таблицы нет — null.
 * Логика бренда: при сомнениях рекомендуем больший размер — вещи садятся свободно, возвратов из-за тесноты меньше.
 */
export function recommendSize(chart: SizeChart, m: Measures): SizeAdvice | null {
  const known = (["bust", "waist", "hips"] as const).filter((k) => typeof m[k] === "number" && (m[k] as number) > 0);
  const primary = chart.primary.filter((k) => known.includes(k));
  if (primary.length === 0) return null;

  const idx = primary.map((k) => rowIndex(chart, k, m[k] as number));
  const chosen = Math.max(...idx);
  const row = chart.rows[chosen];
  const spread = Math.max(...idx) - Math.min(...idx);

  // Мерка у верхней границы диапазона — на грани
  const nearTop = primary.some((k) => {
    const v = m[k] as number;
    const [, max] = row[k];
    return v >= max - 1 && v <= max;
  });
  const overGrid = primary.some((k) => (m[k] as number) > chart.rows[chart.rows.length - 1][k][1]);

  let fit: Fit;
  let note: string;
  const names: Record<"bust" | "waist" | "hips", string> = { bust: "груди", waist: "талии", hips: "бёдрам" };
  if (overGrid) {
    fit = "нужна примерка";
    note = "Мерки выходят за сетку бренда — запишитесь на примерку в шоурум или домой, стилист подберёт посадку.";
  } else if (spread >= 2) {
    fit = "нужна примерка";
    note = `По ${primary.map((k) => names[k]).join(" и ")} получаются разные размеры — лучше примерить ${row.size} и соседний.`;
  } else if (spread === 1) {
    const smaller = chart.rows[Math.min(...idx)].size;
    fit = "между размерами";
    note = `По ${names[primary[idx.indexOf(Math.min(...idx))]]} подходит ${smaller}, по ${names[primary[idx.indexOf(Math.max(...idx))]]} — ${row.size}. Рекомендуем ${row.size}: посадка будет свободнее.`;
  } else if (nearTop) {
    const bigger = chart.rows[chosen + 1]?.size;
    fit = "на грани, лучше взять больше";
    note = bigger ? `Мерки у верхней границы ${row.size}. Если любите свободную посадку — возьмите ${bigger}.` : `Мерки у верхней границы ${row.size}.`;
  } else {
    fit = "точно";
    note = `Мерки по ${primary.map((k) => names[k]).join(" и ")} попадают в середину диапазона ${row.size}.`;
  }

  if (typeof m.height === "number" && m.height > 0) {
    if (m.height >= 176) note += " Лекала рассчитаны на рост 168–174 см: при вашем росте рукав и длина будут чуть короче.";
    else if (m.height <= 160) note += " Лекала рассчитаны на рост 168–174 см: при вашем росте возможна подгонка длины в ателье бренда (бесплатно).";
  }

  return { size: row.size, fit, note };
}

const CATEGORY_CHART: Record<string, SizeChartKey> = {
  jackets: "outer",
  coats: "outer",
  knitwear: "knit",
  dresses: "dress",
  trousers: "trousers",
  skirts: "skirt",
};

function isChartKey(v: string | null | undefined): v is SizeChartKey {
  return !!v && v in SIZE_CHARTS;
}

/** Таблица для товара: явный product.sizeChart, иначе по slug категории. */
export function chartForProduct(product: { sizeChart?: string | null; category?: { slug: string } | null }): SizeChart | null {
  if (isChartKey(product.sizeChart)) return SIZE_CHARTS[product.sizeChart];
  const slug = product.category?.slug;
  const key = slug ? CATEGORY_CHART[slug] : undefined;
  return key ? SIZE_CHARTS[key] : null;
}

/** Как снять мерки — для страницы размеров и профиля. */
export const MEASURE_GUIDE: { key: "bust" | "waist" | "hips" | "height"; label: string; how: string }[] = [
  { key: "bust", label: "Обхват груди", how: "Сантиметр по самым выступающим точкам груди, горизонтально, не затягивая. В тонком белье." },
  { key: "waist", label: "Обхват талии", how: "По самому узкому месту — обычно на 2–3 см выше пупка. Не втягивайте живот." },
  { key: "hips", label: "Обхват бёдер", how: "По самой широкой части бёдер и ягодиц, ноги вместе. Сантиметр параллельно полу." },
  { key: "height", label: "Рост", how: "Без обуви, у стены. Нужен, чтобы подсказать длину рукава и изделия." },
];
