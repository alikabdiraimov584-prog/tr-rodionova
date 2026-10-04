import "server-only";

/**
 * Реестр интеграций: что подключается в CRM → Интеграции, какие поля нужны и как проверить связь.
 * Секретные поля (secret: true) шифруются в базе и не возвращаются в интерфейс.
 */

export type IntegrationGroup = "payments" | "delivery" | "analytics" | "search" | "messaging";

export type IntegrationField = { key: string; label: string; secret?: boolean; hint?: string; placeholder?: string };

export type IntegrationDef = {
  key: string;
  group: IntegrationGroup;
  name: string;
  summary: string;
  fields: IntegrationField[];
  guide: string[];
  /** URL, который нужно указать у провайдера (вебхук), если есть */
  webhookPath?: string;
  /** Проверка подключения: вернуть ok или текст ошибки */
  test?: (config: Record<string, string>) => Promise<{ ok: true; info?: string } | { ok: false; error: string }>;
  /** Что даёт включение: подсказка в карточке */
  effect: string;
};

export const GROUPS: Record<IntegrationGroup, { title: string; hint: string }> = {
  payments: { title: "Оплата", hint: "Приём платежей на сайте: карта, СБП, рассрочка, чеки 54-ФЗ" },
  delivery: { title: "Доставка", hint: "Службы доставки: проверка подключения, трек-ссылки для клиенток" },
  messaging: { title: "Мессенджеры, почта и SMS", hint: "Каналы единого inbox и уведомлений — настраиваются на отдельной странице" },
  analytics: { title: "Аналитика", hint: "Счётчики ставятся на сайт только после согласия на cookie" },
  search: { title: "Поисковики", hint: "Подтверждение прав на сайт для Яндекс Вебмастера и Google Search Console" },
};

async function json<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    body = {} as T;
  }
  return { status: res.status, body };
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "yookassa",
    group: "payments",
    name: "ЮKassa",
    summary: "Банковские карты, СБП, рассрочка «Сплит» и «Долями», онлайн-чеки.",
    effect: "При включении кнопка «Оплатить» ведёт на платёжную страницу ЮKassa; демо-оплата отключается.",
    fields: [
      { key: "shopId", label: "shopId (идентификатор магазина)", placeholder: "123456" },
      { key: "secretKey", label: "Секретный ключ", secret: true, hint: "Личный кабинет ЮKassa → Интеграция → Ключи API" },
    ],
    guide: [
      "В личном кабинете ЮKassa создайте секретный ключ (боевой, не тестовый) и вставьте вместе с shopId.",
      "В разделе «HTTP-уведомления» укажите адрес вебхука ниже и отметьте события payment.succeeded и payment.canceled.",
      "Нажмите «Проверить подключение» — запрос к /v3/me подтвердит ключи.",
      "Включите интеграцию: оплата на сайте станет реальной.",
    ],
    webhookPath: "/api/payments/yookassa",
    test: async (c) => {
      if (!c.shopId || !c.secretKey) return { ok: false, error: "Укажите shopId и секретный ключ" };
      const auth = Buffer.from(`${c.shopId}:${c.secretKey}`).toString("base64");
      const r = await json<{ account_id?: string; status?: string; test?: boolean; description?: string }>("https://api.yookassa.ru/v3/me", { headers: { Authorization: `Basic ${auth}` } });
      if (r.status === 200) return { ok: true, info: `Магазин ${r.body.account_id ?? c.shopId}, статус ${r.body.status ?? "?"}${r.body.test ? " (тестовый ключ)" : ""}` };
      return { ok: false, error: r.body.description ?? `ЮKassa ответила HTTP ${r.status}` };
    },
  },
  {
    key: "cdek",
    group: "delivery",
    name: "СДЭК",
    summary: "Пункты выдачи и курьер по России. Отправления создаются из карточки заказа, статусы и накладные подтягиваются сами.",
    effect: "Кнопка «Создать отправление» в заказах со способом «СДЭК», автоматический перевод в «В доставке» и «Доставлен», трек-ссылка в кабинете клиентки.",
    fields: [
      { key: "account", label: "Account (client_id)", hint: "Договор СДЭК → Интеграция → API" },
      { key: "securePassword", label: "Secure password (client_secret)", secret: true },
      { key: "senderCity", label: "Код города отправителя", placeholder: "44 — Москва, 137 — Санкт-Петербург" },
      { key: "tariffCode", label: "Тариф", placeholder: "137 — склад-дверь (курьер), 136 — склад-склад (ПВЗ)" },
      { key: "senderName", label: "Отправитель (название)", placeholder: "T.Rodionova" },
      { key: "senderPhone", label: "Телефон отправителя", placeholder: "+7 ..." },
      { key: "itemWeightGrams", label: "Вес одной вещи, г", placeholder: "700" },
      { key: "testMode", label: "Тестовый контур (1 — да)", hint: "api.edu.cdek.ru с тестовыми ключами СДЭК; для боевых ключей оставьте пустым" },
    ],
    guide: [
      "Запросите доступ к API v2 у менеджера СДЭК по договору (или возьмите тестовые ключи из документации СДЭК и поставьте «Тестовый контур» = 1).",
      "Вставьте account и secure password, укажите код города и тариф, нажмите «Проверить подключение».",
      "После включения в оплаченном заказе со способом «СДЭК» появится кнопка «Создать отправление»; ночная задача сверяет статусы.",
    ],
    test: async (c) => {
      if (!c.account || !c.securePassword) return { ok: false, error: "Укажите account и secure password" };
      const test = c.testMode === "1" || c.testMode === "true" || c.testMode === "да";
      const params = new URLSearchParams({ grant_type: "client_credentials", client_id: c.account, client_secret: c.securePassword });
      const r = await json<{ access_token?: string; error_description?: string }>(`https://${test ? "api.edu.cdek.ru" : "api.cdek.ru"}/v2/oauth/token?${params}`, { method: "POST" });
      return r.body.access_token ? { ok: true, info: `Токен получен, API v2 доступен${test ? " (тестовый контур)" : ""}` } : { ok: false, error: r.body.error_description ?? `СДЭК ответил HTTP ${r.status}` };
    },
  },
  {
    key: "boxberry",
    group: "delivery",
    name: "Boxberry",
    summary: "Пункты выдачи и курьерская доставка.",
    effect: "Трек-ссылки Boxberry для заказов и проверка токена.",
    fields: [{ key: "token", label: "API-токен", secret: true, hint: "Личный кабинет Boxberry → Интеграция" }],
    guide: ["Получите токен в личном кабинете Boxberry.", "Нажмите «Проверить подключение»: запрос ListCities подтвердит токен."],
    test: async (c) => {
      if (!c.token) return { ok: false, error: "Укажите токен" };
      const r = await json<unknown>(`https://api.boxberry.ru/json.php?token=${encodeURIComponent(c.token)}&method=ListCities&CountryCode=643`);
      if (Array.isArray(r.body) && r.body.length > 0) return { ok: true, info: `Доступно городов: ${r.body.length}` };
      const err = (r.body as { err?: string })?.err;
      return { ok: false, error: err ?? `Boxberry ответил HTTP ${r.status}` };
    },
  },
  {
    key: "yandex_delivery",
    group: "delivery",
    name: "Яндекс Доставка",
    summary: "Курьер день в день и экспресс по Москве и Петербургу.",
    effect: "Проверка токена и трек-ссылки для заказов «Яндекс».",
    fields: [{ key: "token", label: "OAuth-токен (Bearer)", secret: true, hint: "Кабинет Яндекс Доставки → Интеграция → API" }],
    guide: ["Создайте токен в кабинете Яндекс Доставки.", "Проверка выполняет запрос списка заявок с лимитом 1."],
    test: async (c) => {
      if (!c.token) return { ok: false, error: "Укажите токен" };
      const r = await json<{ message?: string }>("https://b2b.taxi.yandex.net/b2b/cargo/integration/v2/claims/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", "Accept-Language": "ru" },
        body: JSON.stringify({ limit: 1 }),
      });
      return r.status === 200 ? { ok: true, info: "Токен принят" } : { ok: false, error: r.body.message ?? `Яндекс ответил HTTP ${r.status}` };
    },
  },
  {
    key: "metrika",
    group: "analytics",
    name: "Яндекс Метрика",
    summary: "Счётчик посещений, вебвизор, цели. Ставится после согласия на cookie.",
    effect: "Код счётчика добавляется на все страницы сайта для посетительниц, принявших cookie.",
    fields: [
      { key: "counterId", label: "Номер счётчика", placeholder: "12345678" },
      { key: "webvisor", label: "Вебвизор", hint: "on — включить запись сессий (требует указания в политике ПДн)" },
    ],
    guide: ["Создайте счётчик на metrika.yandex.ru для домена сайта.", "Вставьте номер и включите интеграцию. Цели «заказ» и «регистрация» отправляются автоматически (reachGoal: order, register)."],
  },
  {
    key: "ga4",
    group: "analytics",
    name: "Google Analytics 4",
    summary: "Счётчик GA4 через gtag.js. Ставится после согласия на cookie.",
    effect: "Тег добавляется на страницы сайта для посетительниц, принявших cookie.",
    fields: [{ key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX" }],
    guide: ["В Google Analytics создайте поток данных для сайта и скопируйте Measurement ID."],
  },
  {
    key: "yandex_webmaster",
    group: "search",
    name: "Яндекс Вебмастер",
    summary: "Подтверждение прав на сайт мета-тегом, затем sitemap и индексация.",
    effect: "Мета-тег yandex-verification добавляется на все страницы.",
    fields: [{ key: "verification", label: "Код подтверждения", hint: "Вебмастер → Добавить сайт → Мета-тег: значение content" }],
    guide: ["Добавьте сайт в webmaster.yandex.ru, выберите способ «Мета-тег» и вставьте код.", "После подтверждения укажите в Вебмастере sitemap: /sitemap.xml."],
  },
  {
    key: "google_search_console",
    group: "search",
    name: "Google Search Console",
    summary: "Подтверждение прав мета-тегом.",
    effect: "Мета-тег google-site-verification добавляется на все страницы.",
    fields: [{ key: "verification", label: "Код подтверждения", hint: "Search Console → HTML tag: значение content" }],
    guide: ["Добавьте ресурс «URL-префикс» в Search Console, выберите «HTML-тег» и вставьте код.", "После подтверждения отправьте sitemap: /sitemap.xml."],
  },
];

export const byKey = new Map(INTEGRATIONS.map((i) => [i.key, i]));
