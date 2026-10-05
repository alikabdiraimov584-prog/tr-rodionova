import "server-only";

/**
 * Реестр интеграций: что подключается в CRM → Интеграции, какие поля нужны и как проверить связь.
 * Секретные поля (secret: true) шифруются в базе и не возвращаются в интерфейс.
 */

export type IntegrationGroup = "payments" | "delivery" | "analytics" | "search" | "messaging" | "service";

export type IntegrationField = { key: string; label: string; secret?: boolean; hint?: string; placeholder?: string; multiline?: boolean };

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
  search: { title: "Поисковики", hint: "Подтверждение прав на сайт для Яндекс Вебмастера и Google Search Console; IndexNow — мгновенная индексация изменений" },
  service: { title: "Резервные копии", hint: "Копии базы за пределами сервера: если диск погибнет, данные восстановятся из бакета" },
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
    key: "cloudpayments",
    group: "payments",
    name: "CloudPayments",
    summary: "Карты, СБП, SberPay, T-Pay, Mir Pay и оплата частями (Долями, Подели, Яндекс Сплит, «Плати частями») в одной кассе. Чеки через CloudKassir.",
    effect: "При включении кнопка «Оплатить» ведёт на платёжную страницу CloudPayments; если включена и ЮKassa, приоритет у CloudPayments.",
    fields: [
      { key: "publicId", label: "Public ID", placeholder: "pk_…", hint: "Кабинет CloudPayments → Сайты → ваш сайт" },
      { key: "apiSecret", label: "API Secret", secret: true, hint: "Там же, кнопка «Пароль для API»" },
      { key: "taxationSystem", label: "Система налогообложения для чеков", placeholder: "0 — ОСН, 1 — УСН доходы, 2 — УСН доходы-расходы (пусто, если одна в кассе)" },
    ],
    guide: [
      "Заключите договор интернет-эквайринга CloudPayments и подключите CloudKassir (облачная касса для чеков 54-ФЗ).",
      "Вставьте Public ID и API Secret, нажмите «Проверить подключение».",
      "В кабинете CloudPayments → Сайты → Уведомления укажите адрес ниже для Pay, Fail и Refund (добавив ?kind=pay, ?kind=fail, ?kind=refund), формат любой, подпись HMAC включена.",
      "Сервисы частями (Долями, Подели, Сплит, «Плати частями») и СБП включаются заявками в кабинете CloudPayments и появляются на платёжной странице сами.",
    ],
    webhookPath: "/api/payments/cloudpayments",
    test: async (c) => {
      if (!c.publicId || !c.apiSecret) return { ok: false, error: "Укажите Public ID и API Secret" };
      const auth = Buffer.from(`${c.publicId}:${c.apiSecret}`).toString("base64");
      const r = await json<{ Success?: boolean; Message?: string | null }>("https://api.cloudpayments.ru/test", { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: "{}" });
      return r.body.Success ? { ok: true, info: r.body.Message ?? "Ключи приняты" } : { ok: false, error: r.body.Message ?? `CloudPayments ответил HTTP ${r.status}` };
    },
  },
  {
    key: "dolyame",
    group: "payments",
    name: "Долями",
    summary: "Оплата четырьмя частями без переплаты (Т-Банк) по прямому договору: кнопка «Частями» в оформлении ведёт на страницу Долями.",
    effect: "При включении способ «Частями» в оформлении обрабатывается напрямую через Долями (комиссия по вашему договору), остальные способы — через CloudPayments или ЮKassa. Если выключено, «Частями» идёт через платёжную страницу кассы.",
    fields: [
      { key: "login", label: "Логин API", hint: "Выдаёт персональный менеджер Долями (partners@dolyame.ru)" },
      { key: "password", label: "Пароль API", secret: true },
      { key: "cert", label: "Клиентский сертификат (PEM)", secret: true, multiline: true, hint: "Кабинет Т-Бизнес → T-API → сертификат для Долями; вставьте файл целиком, с BEGIN CERTIFICATE" },
      { key: "key", label: "Закрытый ключ сертификата (PEM)", secret: true, multiline: true, hint: "Файл private.key из того же архива; никому не передаётся, хранится зашифрованным" },
      { key: "autoCommit", label: "Автоподтверждение заявки (пусто или 1 — да, 0 — вручную из карточки заказа)", placeholder: "1" },
      { key: "fiscalize", label: "Чеки через CloudKassir (1 — да)", hint: "Если 1, чеки предоплаты и полного расчёта пробивает наша касса; иначе фискализацию выполняют Долями по настройкам в их кабинете" },
      { key: "minAmount", label: "Минимальная сумма заказа, ₽", placeholder: "1000" },
      { key: "maxAmount", label: "Максимальная сумма заказа, ₽", placeholder: "150000" },
      { key: "baseUrl", label: "Адрес API (пусто — боевой)", placeholder: "https://partner.dolyame.ru" },
    ],
    guide: [
      "Заключите договор с Долями (dolyame.ru/business) и получите у менеджера логин и пароль API.",
      "В кабинете Т-Бизнес (T-API) выпустите сертификат для Долями, скачайте архив: сертификат и закрытый ключ вставьте сюда целиком.",
      "Нажмите «Проверить подключение»: запрос к API подтвердит пароль и сертификат.",
      "Адрес для уведомлений передаётся в каждой заявке автоматически (ниже), отдельно настраивать не нужно. Проверьте тестовой заявкой с суммой от минимальной.",
    ],
    webhookPath: "/api/payments/dolyame",
    test: async (c) => {
      const { testCredentials } = await import("@/lib/payments/dolyame");
      return testCredentials(c);
    },
  },
  {
    key: "s3_backup",
    group: "service",
    name: "Резервные копии в S3",
    summary: "Каждую ночь дамп базы уходит в S3-бакет (Timeweb Cloud или любой совместимый). Хранится 30 копий, локально на сервере ещё 7 дней.",
    effect: "При включении свежий ночной дамп загружается в бакет ежедневно; результат и ошибки видны здесь и на /api/health, внешняя проверка «Check site» поднимет тревогу, если копия старше двух суток.",
    fields: [
      { key: "endpoint", label: "Адрес S3", placeholder: "https://s3.twcstorage.ru", hint: "Timeweb Cloud: панель → S3-хранилище → настройки бакета" },
      { key: "region", label: "Регион", placeholder: "ru-1" },
      { key: "bucket", label: "Бакет", placeholder: "tr-rodionova-backups", hint: "Создайте приватный бакет, доступ по ключам" },
      { key: "accessKey", label: "Access Key" },
      { key: "secretKey", label: "Secret Key", secret: true },
      { key: "prefix", label: "Папка в бакете", placeholder: "db/" },
      { key: "keep", label: "Сколько копий хранить", placeholder: "30" },
    ],
    guide: [
      "В панели Timeweb Cloud создайте S3-хранилище (приватный бакет) и пару ключей доступа к нему.",
      "Вставьте адрес, бакет и ключи, нажмите «Проверить подключение»: приложение проверит доступ к бакету и покажет число копий.",
      "Включите интеграцию. Первая копия уйдёт ближайшей ночью; проверить вручную можно кнопкой проверки через день.",
      "Раз в месяц скачивайте копию из бакета и разворачивайте на тестовой базе: бэкап, который никто не открывал, не считается.",
    ],
    test: async (c) => {
      const { testS3 } = await import("@/lib/backups");
      return testS3(c);
    },
  },
  {
    key: "telegram_alerts",
    group: "service",
    name: "Тревоги в Telegram",
    summary: "Сообщение владельцу, когда что-то сломалось: не прошло автообновление, не сделался дамп базы, устарела копия в S3, упали ночные задачи.",
    effect: "Тревоги приходят в указанный чат; одна и та же проблема не повторяется чаще раза в 6 часов. Внешняя проверка «Check site» в GitHub шлёт свои тревоги отдельно (секреты в GitHub).",
    fields: [
      { key: "botToken", label: "Токен бота", secret: true, hint: "Создайте бота у @BotFather в Telegram и скопируйте токен" },
      { key: "chatId", label: "Chat id", placeholder: "123456789", hint: "Напишите боту любое сообщение, затем откройте https://api.telegram.org/bot<токен>/getUpdates и возьмите chat → id; для группы id начинается с минуса" },
    ],
    guide: [
      "В Telegram откройте @BotFather, команда /newbot, назовите бота, скопируйте токен.",
      "Напишите боту «Привет» (или добавьте его в группу и напишите там).",
      "Откройте в браузере https://api.telegram.org/bot<токен>/getUpdates и найдите chat → id.",
      "Вставьте токен и chat id, нажмите «Проверить подключение»: в чат придёт пробное сообщение. Включите интеграцию.",
    ],
    test: async (c) => {
      const { testTelegramAlerts } = await import("@/lib/alerts");
      return testTelegramAlerts(c);
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
    key: "dadata",
    group: "delivery",
    name: "DaData: подсказки адреса",
    summary: "Подсказки адреса при оформлении заказа: меньше ошибок в доставке, индекс и город подставляются сами.",
    effect: "Поле адреса в оформлении начинает предлагать варианты по мере ввода (бесплатно до 10 000 запросов в день).",
    fields: [{ key: "token", label: "API-ключ", secret: true, hint: "dadata.ru → Кабинет → API-ключи" }],
    guide: ["Зарегистрируйтесь на dadata.ru (бесплатный тариф) и скопируйте API-ключ.", "Нажмите «Проверить подключение»."],
    test: async (c) => {
      if (!c.token) return { ok: false, error: "Укажите API-ключ" };
      const r = await json<{ suggestions?: unknown[] }>("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${c.token}` }, body: JSON.stringify({ query: "Москва, Тверская 1", count: 1 }) });
      return r.status === 200 ? { ok: true, info: "Подсказки работают" } : { ok: false, error: `DaData ответила HTTP ${r.status}` };
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
    guide: ["Добавьте сайт в webmaster.yandex.ru, выберите способ «Мета-тег» и вставьте код.", "После подтверждения укажите в Вебмастере sitemap: /sitemap.xml и добавьте товарный фид /yml.xml в разделе «Товары и предложения».", "Видимость в ответах ИИ: отчёт «Эффективность → Показы сайта в Алисе AI» (https://webmaster.yandex.ru/) — единственная первичная метрика GEO для Яндекса; сверяйте раз в месяц."],
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
  {
    key: "indexnow",
    group: "search",
    name: "IndexNow: Яндекс и Bing",
    summary: "Мгновенное уведомление поисковиков об изменённых страницах: новые статьи, вещи, цены.",
    effect: "После сохранения статьи или вещи в CRM адрес страницы отправляется в api.indexnow.org (его читают Яндекс, Bing и другие участники). Ключ отдаётся по адресу /indexnow/<ключ>.txt.",
    fields: [{ key: "key", label: "Ключ", hint: "8–128 латинских букв и цифр; оставьте пустым — создастся автоматически при включении" }],
    guide: ["Включите интеграцию: ключ создастся сам, регистрироваться нигде не нужно.", "В Яндекс Вебмастере раздел «Индексирование → IndexNow» покажет принятые адреса через несколько часов.", "Проверка связи ниже запрашивает файл ключа с боевого сайта."],
    test: async (config) => {
      const key = (config.key ?? "").trim();
      if (!key) return { ok: false, error: "Ключ ещё не создан: сохраните интеграцию включённой" };
      const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
      if (!base) return { ok: false, error: "APP_URL не задан в .env" };
      try {
        const res = await fetch(`${base}/indexnow/${key}.txt`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
        const text = (await res.text()).trim();
        return res.ok && text === key ? { ok: true, info: `Файл ключа отдаётся: ${base}/indexnow/${key}.txt` } : { ok: false, error: `Файл ключа недоступен (HTTP ${res.status})` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "нет связи" };
      }
    },
  },
];

export const byKey = new Map(INTEGRATIONS.map((i) => [i.key, i]));
