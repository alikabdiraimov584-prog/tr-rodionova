import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const RUB = 100; // копейки в рубле

async function main() {
  // ── Уровни лояльности «T.Rodionova Circle» (см. docs/01-market-research.md) ──
  const tiers = [
    {
      code: "ATELIER",
      name: "Atelier",
      threshold: 0,
      cashbackPct: 3,
      maxPayPct: 30,
      birthdayBonus: 3000,
      order: 0,
      freeShipping: false,
      freeReturns: false,
      earlyAccess: false,
      stylist: false,
      perks: ["3% баллами с каждой покупки", "Оплата баллами до 30% заказа", "Закрытые предпродажи", "3 000 баллов ко дню рождения"],
    },
    {
      code: "MAISON",
      name: "Maison",
      threshold: 150_000 * RUB,
      cashbackPct: 5,
      maxPayPct: 30,
      birthdayBonus: 4000,
      order: 1,
      freeShipping: true,
      freeReturns: false,
      earlyAccess: true,
      stylist: false,
      perks: ["5% баллами", "Бесплатная доставка", "Ранний доступ к коллекциям", "4 000 баллов ко дню рождения"],
    },
    {
      code: "PRIVE",
      name: "Privé",
      threshold: 400_000 * RUB,
      cashbackPct: 7,
      maxPayPct: 30,
      birthdayBonus: 5000,
      order: 2,
      freeShipping: true,
      freeReturns: true,
      earlyAccess: true,
      stylist: true,
      perks: [
        "7% баллами",
        "Персональный стилист и примерка дома",
        "Приват-показы и предзаказ коллекций",
        "Бесплатные доставка и возврат",
        "Уход за изделиями в ателье",
        "5 000 баллов ко дню рождения",
      ],
    },
  ];
  for (const t of tiers) {
    await db.loyaltyTier.upsert({ where: { code: t.code }, update: t, create: t });
  }
  const base = await db.loyaltyTier.findUniqueOrThrow({ where: { code: "ATELIER" } });
  // Старые уровни из ранних версий схемы: переводим клиентов на базовый и удаляем
  const legacy = await db.loyaltyTier.findMany({ where: { code: { notIn: tiers.map((t) => t.code) } } });
  if (legacy.length) {
    await db.user.updateMany({ where: { loyaltyTierId: { in: legacy.map((t) => t.id) } }, data: { loyaltyTierId: base.id } });
    await db.loyaltyTier.deleteMany({ where: { id: { in: legacy.map((t) => t.id) } } });
  }

  // ── Настройки ──
  const settings: Record<string, unknown> = {
    loyalty: {
      welcomePoints: 2000,
      referralPoints: 2000,
      reviewPoints: 300,
      pointsExpireDays: 365,
      pointValueKopecks: 100, // 1 балл = 1 ₽
    },
    delivery: {
      freeFrom: 15_000 * RUB,
      courier: 500 * RUB,
      cdek: 350 * RUB,
      boxberry: 300 * RUB,
      yandex: 450 * RUB,
    },
    brand: {
      name: "T.Rodionova",
      tagline: "Premium womenswear",
      phone: "+7 (495) 000-00-00",
      email: "care@t-rodionova.ru",
      telegram: "https://t.me/trodionova",
    },
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }

  // ── Сотрудники и демо-клиент ──
  const passwordHash = await bcrypt.hash("admin12345", 10);
  await db.user.upsert({
    where: { email: "admin@t-rodionova.ru" },
    update: {},
    create: {
      email: "admin@t-rodionova.ru",
      passwordHash,
      firstName: "Татьяна",
      lastName: "Родионова",
      role: "ADMIN",
      loyaltyTierId: base.id,
    },
  });
  await db.user.upsert({
    where: { email: "manager@t-rodionova.ru" },
    update: {},
    create: {
      email: "manager@t-rodionova.ru",
      passwordHash: await bcrypt.hash("manager12345", 10),
      firstName: "Мария",
      role: "MANAGER",
      loyaltyTierId: base.id,
    },
  });
  const customer = await db.user.upsert({
    where: { email: "anna@example.com" },
    update: {},
    create: {
      email: "anna@example.com",
      phone: "+7 916 000-00-01",
      passwordHash: await bcrypt.hash("anna12345", 10),
      firstName: "Анна",
      lastName: "Смирнова",
      birthday: new Date("1990-05-14"),
      role: "CUSTOMER",
      loyaltyTierId: base.id,
      pointsBalance: 2000,
      source: "Instagram",
      preferredSize: "S",
      marketingConsent: true,
      tags: ["vip-кандидат"],
    },
  });
  if ((await db.pointsTransaction.count({ where: { userId: customer.id } })) === 0) {
    await db.pointsTransaction.create({
      data: { userId: customer.id, type: "EARN_WELCOME", amount: 2000, comment: "Приветственный бонус" },
    });
  }

  // ── Категории ──
  const categories = [
    ["jackets", "Жакеты"],
    ["coats", "Пальто и тренчи"],
    ["dresses", "Платья"],
    ["trousers", "Брюки"],
    ["knitwear", "Трикотаж"],
    ["shirts", "Рубашки и блузы"],
    ["skirts", "Юбки"],
    ["accessories", "Аксессуары"],
  ] as const;
  const cat: Record<string, string> = {};
  for (const [i, [slug, name]] of categories.entries()) {
    const c = await db.category.upsert({
      where: { slug },
      update: { name, order: i },
      create: { slug, name, order: i },
    });
    cat[slug] = c.id;
  }

  const collection = await db.collection.upsert({
    where: { slug: "aw26" },
    update: {},
    create: {
      slug: "aw26",
      name: "Осень–зима 2026",
      season: "AW26",
      description:
        "Коллекция о тишине и выборе. Шерсть, кашемир, шёлк — ткани, которые ощущаются кожей, а не глазами.",
      coverUrl: "/images/placeholder/coat.svg",
    },
  });

  // ── Товары ──
  type P = {
    slug: string;
    sku: string;
    name: string;
    category: string;
    price: number;
    cost: number;
    composition: string;
    description: string;
    sizes: string[];
    colors: [string, string][];
    isNew?: boolean;
    isFeatured?: boolean;
    image: string;
  };
  const products: P[] = [
    {
      slug: "zhaket-aurora",
      sku: "TR-JK-001",
      name: "Жакет Aurora",
      category: "jackets",
      price: 42_900,
      cost: 14_500,
      composition: "80% шерсть, 20% шёлк",
      description:
        "Однобортный жакет с мягкой линией плеча. Полуприлегающий силуэт, подкладка из купро, роговые пуговицы.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Taupe", "#A89B8C"], ["Чёрный", "#0E0E0E"]],
      isFeatured: true,
      isNew: true,
      image: "jacket",
    },
    {
      slug: "palto-claire",
      sku: "TR-CT-001",
      name: "Пальто Claire",
      category: "coats",
      price: 89_900,
      cost: 31_000,
      composition: "90% шерсть, 10% кашемир",
      description:
        "Прямое пальто длины миди с поясом. Двусторонняя ткань без подкладки — лёгкое и тёплое.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Айвори", "#F8F5EE"], ["Шампань", "#D9C29F"]],
      isFeatured: true,
      isNew: true,
      image: "coat",
    },
    {
      slug: "plate-ines",
      sku: "TR-DR-001",
      name: "Платье Inès",
      category: "dresses",
      price: 36_900,
      cost: 11_800,
      composition: "100% шёлк",
      description: "Платье-комбинация на тонких бретелях из плотного шёлка. Косой крой, длина миди.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Шампань", "#D9C29F"], ["Чёрный", "#0E0E0E"]],
      isFeatured: true,
      image: "dress",
    },
    {
      slug: "plate-margot",
      sku: "TR-DR-002",
      name: "Платье Margot",
      category: "dresses",
      price: 44_900,
      cost: 15_200,
      composition: "70% шерсть, 30% полиэстер",
      description: "Трикотажное платье-футляр с длинным рукавом. Держит форму, не просвечивает.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Taupe", "#A89B8C"]],
      image: "dress",
    },
    {
      slug: "bryuki-noa",
      sku: "TR-TR-001",
      name: "Брюки Noa",
      category: "trousers",
      price: 27_900,
      cost: 9_100,
      composition: "65% шерсть, 33% вискоза, 2% эластан",
      description: "Прямые брюки с высокой посадкой и стрелками. Длина в пол при каблуке 5 см.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Чёрный", "#0E0E0E"], ["Taupe", "#A89B8C"]],
      isFeatured: true,
      image: "trousers",
    },
    {
      slug: "bryuki-lou",
      sku: "TR-TR-002",
      name: "Брюки Lou",
      category: "trousers",
      price: 29_900,
      cost: 9_800,
      composition: "100% шерсть",
      description: "Широкие брюки-палаццо из костюмной шерсти. Защипы, боковые карманы.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Айвори", "#F8F5EE"]],
      isNew: true,
      image: "trousers",
    },
    {
      slug: "dzhemper-elsa",
      sku: "TR-KN-001",
      name: "Джемпер Elsa",
      category: "knitwear",
      price: 38_900,
      cost: 13_400,
      composition: "100% кашемир",
      description: "Кашемир 12 gauge из Монголии. Круглый вырез, спущенное плечо, рукав с отворотом.",
      sizes: ["S", "M", "L"],
      colors: [["Шампань", "#D9C29F"], ["Taupe", "#A89B8C"], ["Чёрный", "#0E0E0E"]],
      isFeatured: true,
      image: "knit",
    },
    {
      slug: "kardigan-vera",
      sku: "TR-KN-002",
      name: "Кардиган Vera",
      category: "knitwear",
      price: 46_900,
      cost: 16_000,
      composition: "70% шерсть мериноса, 30% кашемир",
      description: "Удлинённый кардиган крупной вязки с перламутровыми пуговицами.",
      sizes: ["S", "M", "L"],
      colors: [["Айвори", "#F8F5EE"]],
      image: "knit",
    },
    {
      slug: "rubashka-blanche",
      sku: "TR-SH-001",
      name: "Рубашка Blanche",
      category: "shirts",
      price: 21_900,
      cost: 7_000,
      composition: "100% хлопок поплин",
      description: "Классическая рубашка свободного кроя, перламутровые пуговицы, удлинённая спинка.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Белый", "#FFFFFF"], ["Айвори", "#F8F5EE"]],
      image: "shirt",
    },
    {
      slug: "bluza-sol",
      sku: "TR-SH-002",
      name: "Блуза Sol",
      category: "shirts",
      price: 26_900,
      cost: 8_600,
      composition: "100% шёлк",
      description: "Блуза с воротником-стойкой и завязками. Крой с цельнокроеным рукавом.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Шампань", "#D9C29F"]],
      isNew: true,
      image: "shirt",
    },
    {
      slug: "yubka-iris",
      sku: "TR-SK-001",
      name: "Юбка Iris",
      category: "skirts",
      price: 24_900,
      cost: 8_200,
      composition: "100% шёлк",
      description: "Юбка миди косого кроя на тонком поясе. Садится по бёдрам, расширяется книзу.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Чёрный", "#0E0E0E"], ["Taupe", "#A89B8C"]],
      image: "skirt",
    },
    {
      slug: "sharf-nova",
      sku: "TR-AC-001",
      name: "Шарф Nova",
      category: "accessories",
      price: 15_900,
      cost: 5_200,
      composition: "100% кашемир",
      description: "Кашемировый шарф 70 × 200 см с необработанным краем.",
      sizes: ["ONE"],
      colors: [["Шампань", "#D9C29F"], ["Taupe", "#A89B8C"]],
      image: "scarf",
    },
  ];

  for (const p of products) {
    const product = await db.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        description: p.description,
        composition: p.composition,
        care: "Сухая чистка. Хранить на плечиках.",
        price: p.price * RUB,
        costPrice: p.cost * RUB,
        isNew: p.isNew ?? false,
        isFeatured: p.isFeatured ?? false,
        categoryId: cat[p.category],
        collectionId: collection.id,
        images: {
          create: [
            { url: `/images/placeholder/${p.image}.svg`, alt: p.name, order: 0 },
            { url: `/images/placeholder/${p.image}-2.svg`, alt: `${p.name} — деталь`, order: 1 },
          ],
        },
      },
    });
    const existing = await db.productVariant.count({ where: { productId: product.id } });
    if (existing > 0) continue;
    let i = 0;
    for (const [color, hex] of p.colors) {
      for (const size of p.sizes) {
        i++;
        const stock = 2 + ((i * 7) % 5);
        const variant = await db.productVariant.create({
          data: {
            productId: product.id,
            sku: `${p.sku}-${String(i).padStart(2, "0")}`,
            size,
            color,
            colorHex: hex,
            stock,
          },
        });
        await db.stockMovement.create({
          data: {
            variantId: variant.id,
            type: "RECEIPT",
            quantity: stock,
            unitCost: p.cost * RUB,
            reason: "Первый приход с производства",
          },
        });
      }
    }
  }

  // ── Промокод ──
  await db.promoCode.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: { code: "WELCOME10", type: "PERCENT", value: 10, minSubtotal: 10_000 * RUB, perUser: 1 },
  });

  await db.promoCode.upsert({
    where: { code: "CIRCLE" },
    update: {},
    create: { code: "CIRCLE", type: "FREE_SHIPPING", value: 0, perUser: 3 },
  });

  // ── Поддержка: сотрудник, каналы, шаблоны ──
  await db.user.upsert({
    where: { email: "support@t-rodionova.ru" },
    update: {},
    create: { email: "support@t-rodionova.ru", passwordHash: await bcrypt.hash("support12345", 10), firstName: "Ольга", lastName: "Белова", role: "SUPPORT" },
  });
  const channels = [
    ["TELEGRAM", "Telegram"],
    ["WHATSAPP", "WhatsApp"],
    ["INSTAGRAM", "Instagram"],
    ["VK", "ВКонтакте"],
    ["EMAIL", "Email"],
  ] as const;
  for (const [channel, name] of channels) {
    await db.channelIntegration.upsert({ where: { channel }, update: {}, create: { channel, name, enabled: false, config: channel === "WHATSAPP" || channel === "INSTAGRAM" ? { provider: "wazzup" } : {} } });
  }
  const templates = [
    ["Приветствие", "/привет", "{имя}, здравствуйте! Это T.Rodionova. С радостью помогу."],
    ["Где заказ", "/заказ", "{имя}, заказ {заказ} уже в пути. Трек-номер и статус — в личном кабинете в разделе «Заказы». Если что-то не так — напишите, разберёмся."],
    ["Доставка", "/доставка", "Доставляем курьером по Москве и Петербургу с примеркой за 1–2 дня, по России — СДЭК 2–7 дней. Бесплатно от 15 000 ₽ и для уровней Maison и Privé."],
    ["Размер", "/размер", "Подскажите, пожалуйста, ваш рост и обхваты груди, талии и бёдер — подберу размер. Наши модели садятся по размерной сетке, жакеты Aurora чуть свободнее."],
    ["Возврат", "/возврат", "{имя}, вернуть вещь можно в течение 14 дней после получения, если сохранены ярлыки. Оформите возврат в личном кабинете или пришлите номер заказа — я всё сделаю за вас. Деньги вернутся в течение 10 дней."],
    ["Баллы", "/баллы", "{имя}, у вас {баллы} баллов, уровень {уровень}. Баллами можно оплатить до 30% заказа, 1 балл = 1 ₽."],
    ["Стилист", "/стилист", "Запишу вас к стилисту в шоурум на Большой Никитской или на примерку дома. Какие дата и время удобны?"],
  ] as const;
  for (const [i, [title, shortcut, text]] of templates.entries()) {
    await db.replyTemplate.upsert({ where: { shortcut }, update: {}, create: { title, shortcut, text, order: i } });
  }

  if (process.env.SEED_DEMO !== "0") {
    await seedDemo(base.id);
    await seedSupportDemo();
  }

  console.log("Seed complete");
}

// ───────────────────────────── Демо-данные для CRM ─────────────────────────────

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

async function seedDemo(baseTierId: string) {
  if ((await db.order.count()) > 0) return; // демо уже загружено
  const rand = rng(42);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const DAY = 86_400_000;
  const now = Date.now();

  const firstNames = ["Анна", "Мария", "Елена", "Ольга", "Наталья", "Екатерина", "Ирина", "Татьяна", "Светлана", "Юлия", "Дарья", "Алиса", "Виктория", "Ксения", "Полина", "Софья", "Вероника", "Алёна", "Марина", "Валерия", "Кристина", "Евгения", "Александра", "Варвара"];
  const lastNames = ["Иванова", "Петрова", "Соколова", "Морозова", "Волкова", "Лебедева", "Козлова", "Новикова", "Орлова", "Фёдорова", "Белова", "Егорова", "Зайцева", "Павлова", "Голубева", "Виноградова", "Богданова", "Воробьёва", "Комарова", "Кузнецова"];
  const sources = ["Instagram", "Telegram", "Сарафанное радио", "Шоурум", "Яндекс", "Реферальная ссылка", "Pinterest", "Мероприятие"];
  const cities = ["Москва", "Москва", "Москва", "Санкт-Петербург", "Санкт-Петербург", "Казань", "Екатеринбург", "Краснодар", "Новосибирск"];
  const sizes = ["XS", "S", "S", "M", "M", "L"];

  const variants = await db.productVariant.findMany({ include: { product: true } });
  const manager = await db.user.findUniqueOrThrow({ where: { email: "manager@t-rodionova.ru" } });
  const anna = await db.user.findUniqueOrThrow({ where: { email: "anna@example.com" } });
  const pwd = await bcrypt.hash("demo12345", 10);

  // профиль клиента: частота и «температура»
  const customers: { id: string; profile: "vip" | "regular" | "one" | "lapsed" | "none" }[] = [{ id: anna.id, profile: "regular" }];
  for (let i = 0; i < 46; i++) {
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const createdAt = new Date(now - Math.floor(30 + rand() * 480) * DAY);
    const u = await db.user.create({
      data: {
        email: `demo${i + 1}@example.com`,
        phone: `+7 9${String(10 + Math.floor(rand() * 89))} ${String(100 + Math.floor(rand() * 899))}-${String(10 + Math.floor(rand() * 89))}-${String(10 + Math.floor(rand() * 89))}`,
        passwordHash: pwd,
        firstName: fn,
        lastName: ln,
        birthday: new Date(1972 + Math.floor(rand() * 30), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
        loyaltyTierId: baseTierId,
        source: pick(sources),
        preferredSize: pick(sizes),
        marketingConsent: rand() > 0.3,
        createdAt,
      },
    });
    const r = rand();
    customers.push({ id: u.id, profile: r < 0.12 ? "vip" : r < 0.42 ? "regular" : r < 0.7 ? "one" : r < 0.85 ? "lapsed" : "none" });
    await db.pointsTransaction.create({
      data: { userId: u.id, type: "EARN_WELCOME", amount: 2000, comment: "Приветственный бонус", createdAt, expiresAt: new Date(createdAt.getTime() + 365 * DAY) },
    });
    await db.user.update({ where: { id: u.id }, data: { pointsBalance: { increment: 2000 } } });
    await db.address.create({
      data: { userId: u.id, label: "Дом", city: pick(cities), street: pick(["Тверская ул.", "Остоженка", "Большая Никитская ул.", "Невский пр.", "Кутузовский пр.", "ул. Баумана"]), building: String(1 + Math.floor(rand() * 40)), apartment: String(1 + Math.floor(rand() * 120)), isDefault: true },
    });
  }

  const tiers = await db.loyaltyTier.findMany({ orderBy: { threshold: "asc" } });
  const deliveries = ["COURIER", "COURIER", "CDEK", "YANDEX", "PICKUP", "BOXBERRY"] as const;
  const payments = ["CARD", "CARD", "SBP", "INSTALLMENT"] as const;

  for (const c of customers) {
    const user = await db.user.findUniqueOrThrow({ where: { id: c.id }, include: { addresses: true, loyaltyTier: true } });
    const count = { vip: 5 + Math.floor(rand() * 5), regular: 2 + Math.floor(rand() * 3), one: 1, lapsed: 1 + Math.floor(rand() * 2), none: 0 }[c.profile];
    const dates: number[] = [];
    for (let k = 0; k < count; k++) {
      const maxAge = Math.max(3, Math.floor((now - user.createdAt.getTime()) / DAY));
      const age = c.profile === "lapsed" ? 250 + Math.floor(rand() * 150) : Math.floor(rand() * Math.min(maxAge, 420));
      dates.push(now - age * DAY - Math.floor(rand() * DAY));
    }
    dates.sort((x, y) => x - y);
    for (const t of dates) {
      const createdAt = new Date(t);
      const ageDays = (now - t) / DAY;
      const lineCount = c.profile === "vip" ? 1 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2);
      const chosen = new Map<string, (typeof variants)[number]>();
      while (chosen.size < lineCount) {
        const v = pick(variants);
        chosen.set(v.id, v);
      }
      const lines = [...chosen.values()];
      const subtotal = lines.reduce((s, v) => s + (v.price ?? v.product.price), 0);
      const tier = user.loyaltyTier ?? tiers[0];
      const deliveryMethod = pick(deliveries);
      const deliveryCost = deliveryMethod === "PICKUP" || subtotal >= 15_000 * RUB ? 0 : 500 * RUB;
      const discount = rand() < 0.15 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal - discount + deliveryCost;
      let status: "NEW" | "PAID" | "CONFIRMED" | "PACKING" | "SHIPPED" | "DELIVERED" | "COMPLETED" | "CANCELLED" | "RETURNED";
      if (ageDays < 1) status = pick(["NEW", "PAID", "CONFIRMED"] as const);
      else if (ageDays < 4) status = pick(["CONFIRMED", "PACKING", "SHIPPED"] as const);
      else if (ageDays < 18) status = pick(["SHIPPED", "DELIVERED", "DELIVERED"] as const);
      else status = rand() < 0.06 ? "CANCELLED" : rand() < 0.06 ? "RETURNED" : "COMPLETED";
      const paid = status !== "NEW" && status !== "CANCELLED";
      const method = pick(payments);
      const address = user.addresses[0];
      const deliveredAt = ["DELIVERED", "COMPLETED", "RETURNED"].includes(status) ? new Date(t + 3 * DAY) : null;

      const order = await db.order.create({
        data: {
          userId: user.id,
          status,
          email: user.email,
          phone: user.phone ?? "+7 900 000-00-00",
          firstName: user.firstName,
          lastName: user.lastName,
          deliveryMethod,
          addressId: deliveryMethod === "PICKUP" ? null : address?.id ?? null,
          trackingNumber: ["SHIPPED", "DELIVERED", "COMPLETED"].includes(status) && deliveryMethod === "CDEK" ? `10${Math.floor(rand() * 1e8)}` : null,
          deliveryCost,
          subtotal,
          discount,
          total,
          createdAt,
          updatedAt: createdAt,
          paidAt: paid || status === "CANCELLED" ? null : null,
          deliveredAt,
          completedAt: status === "COMPLETED" ? new Date(t + 17 * DAY) : null,
          items: {
            create: lines.map((v) => ({
              variantId: v.id,
              productName: v.product.name,
              size: v.size,
              color: v.color,
              sku: v.sku,
              price: v.price ?? v.product.price,
              costPrice: v.product.costPrice,
              quantity: 1,
              returnedQty: status === "RETURNED" ? 1 : 0,
            })),
          },
          payments: {
            create: {
              method,
              amount: total,
              status: status === "NEW" ? "PENDING" : status === "CANCELLED" ? "FAILED" : status === "RETURNED" ? "REFUNDED" : "SUCCEEDED",
              createdAt,
            },
          },
          history: {
            create: [
              { status: "NEW", message: "Заказ создан", createdAt },
              ...(paid ? [{ status: "PAID" as const, message: "Оплата получена", createdAt: new Date(t + 600_000) }] : []),
              ...(status !== "NEW" && status !== "PAID" ? [{ status, message: "Статус изменён", createdBy: manager.id, createdAt: new Date(t + 2 * DAY) }] : []),
            ],
          },
        },
      });
      if (paid) await db.order.update({ where: { id: order.id }, data: { paidAt: new Date(t + 600_000) } });

      // склад
      for (const v of lines) {
        const fresh = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
        if (status === "NEW") {
          if (fresh.stock - fresh.reserved < 1) {
            await db.productVariant.update({ where: { id: v.id }, data: { stock: { increment: 4 } } });
            await db.stockMovement.create({ data: { variantId: v.id, type: "RECEIPT", quantity: 4, unitCost: v.product.costPrice, reason: "Допошив", createdAt: new Date(t - DAY) } });
          }
          await db.productVariant.update({ where: { id: v.id }, data: { reserved: { increment: 1 } } });
          await db.stockMovement.create({ data: { variantId: v.id, type: "RESERVE", quantity: -1, orderId: order.id, createdAt } });
        } else if (paid) {
          if (fresh.stock - fresh.reserved < 1) {
            await db.productVariant.update({ where: { id: v.id }, data: { stock: { increment: 4 } } });
            await db.stockMovement.create({ data: { variantId: v.id, type: "RECEIPT", quantity: 4, unitCost: v.product.costPrice, reason: "Допошив", createdAt: new Date(t - DAY) } });
          }
          await db.productVariant.update({ where: { id: v.id }, data: { stock: { decrement: 1 } } });
          await db.stockMovement.create({ data: { variantId: v.id, type: "SALE", quantity: -1, orderId: order.id, unitCost: v.product.costPrice, createdAt } });
          if (status === "RETURNED") {
            await db.productVariant.update({ where: { id: v.id }, data: { stock: { increment: 1 } } });
            await db.stockMovement.create({ data: { variantId: v.id, type: "RETURN", quantity: 1, orderId: order.id, reason: "Не подошёл размер", createdAt: new Date(t + 8 * DAY) } });
          }
        }
      }

      // финансы
      if (paid) {
        const cogs = lines.reduce((s, v) => s + (v.product.costPrice ?? 0), 0);
        await db.ledgerEntry.createMany({
          data: [
            { type: "INCOME_SALE", amount: total, orderId: order.id, date: createdAt, comment: `Заказ №${order.number}` },
            { type: "EXPENSE_COGS", amount: cogs, orderId: order.id, date: createdAt, comment: `Себестоимость заказа №${order.number}` },
            { type: "EXPENSE_ACQUIRING", amount: Math.round(total * (method === "SBP" ? 0.007 : 0.025)), orderId: order.id, date: createdAt, comment: `Эквайринг заказа №${order.number}` },
            ...(status === "RETURNED" ? [{ type: "REFUND" as const, amount: subtotal - discount, orderId: order.id, date: new Date(t + 8 * DAY), comment: `Возврат по заказу №${order.number}` }] : []),
          ],
        });
      }

      // баллы — начисляются при завершении заказа
      if (status === "COMPLETED") {
        const pts = Math.floor(((total - deliveryCost) * tier.cashbackPct) / 100 / RUB);
        const at = new Date(t + 17 * DAY);
        await db.pointsTransaction.create({
          data: { userId: user.id, type: "EARN_PURCHASE", amount: pts, orderId: order.id, comment: `Заказ №${order.number}: ${tier.cashbackPct}% баллами`, createdAt: at, expiresAt: new Date(at.getTime() + 365 * DAY) },
        });
        await db.order.update({ where: { id: order.id }, data: { pointsEarned: pts } });
        await db.user.update({ where: { id: user.id }, data: { pointsBalance: { increment: pts } } });
      }

      // пересчёт уровня
      const yearAgo = new Date(now - 365 * DAY);
      const agg = await db.order.findMany({
        where: { userId: user.id, status: { in: ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] } },
        select: { total: true, deliveryCost: true, createdAt: true },
      });
      const lifetime = agg.reduce((s, o) => s + o.total - o.deliveryCost, 0);
      const year = agg.filter((o) => o.createdAt >= yearAgo).reduce((s, o) => s + o.total - o.deliveryCost, 0);
      const newTier = [...tiers].reverse().find((x) => year >= x.threshold) ?? tiers[0];
      await db.user.update({ where: { id: user.id }, data: { lifetimeSpent: lifetime, yearSpent: year, loyaltyTierId: newTier.id } });
      user.loyaltyTier = newTier as typeof user.loyaltyTier;
    }
  }

  // операционные расходы по месяцам
  for (let m = 13; m >= 0; m--) {
    const d = new Date(now - m * 30 * DAY);
    d.setDate(5);
    await db.ledgerEntry.createMany({
      data: [
        { type: "EXPENSE_RENT", amount: 280_000 * RUB, date: d, category: "Шоурум", comment: "Аренда шоурума" },
        { type: "EXPENSE_SALARY", amount: 520_000 * RUB, date: d, category: "Команда", comment: "ФОТ" },
        { type: "EXPENSE_MARKETING", amount: Math.round((120 + rand() * 180) * 1000) * RUB, date: d, category: "Таргет и блогеры", comment: "Маркетинг" },
        { type: "EXPENSE_SHIPPING", amount: Math.round((25 + rand() * 30) * 1000) * RUB, date: d, category: "Логистика", comment: "СДЭК, курьеры" },
      ],
    });
  }

  // заметки, задачи, отзывы, лист ожидания
  const someCustomers = await db.user.findMany({ where: { role: "CUSTOMER" }, take: 12, orderBy: { lifetimeSpent: "desc" } });
  const noteTexts = ["Предпочитает приглушённые оттенки, не носит чёрный у лица", "Просила сообщить о поступлении кашемира", "Покупает к деловым поездкам, удобна доставка в офис", "Любит брюки с высокой посадкой, рост 172", "Приходила в шоурум с подругой — приглашена в Circle"];
  for (const [i, u] of someCustomers.entries()) {
    await db.customerNote.create({ data: { userId: u.id, text: noteTexts[i % noteTexts.length], createdBy: manager.id, createdAt: new Date(now - i * 5 * DAY) } });
  }
  const taskTitles = ["Пригласить на закрытый показ AW26", "Позвонить: подбор капсулы к отпуску", "Поздравить с днём рождения лично", "Уточнить размер для предзаказа пальто Claire", "Вернуть спящего клиента: подборка новинок"];
  for (const [i, u] of someCustomers.slice(0, 8).entries()) {
    await db.crmTask.create({
      data: { title: taskTitles[i % taskTitles.length], customerId: u.id, assigneeId: manager.id, dueAt: new Date(now + (i - 2) * DAY), status: i === 5 ? "DONE" : "OPEN" },
    });
  }
  const completed = await db.orderItem.findMany({ where: { order: { status: "COMPLETED" } }, include: { order: true, variant: true }, take: 14 });
  const reviewTexts = ["Безупречная посадка, ткань ощущается дорого.", "Цвет точно как на фото, очень мягкий кашемир.", "Немного большемерит, взяла на размер меньше.", "Лучшие брюки в моём гардеробе.", "Упаковка — отдельное удовольствие."];
  const reviewed = new Set<string>();
  for (const [i, it] of completed.entries()) {
    const key = `${it.order.userId}-${it.variant.productId}`;
    if (!it.order.userId || reviewed.has(key)) continue;
    reviewed.add(key);
    await db.review.create({ data: { userId: it.order.userId, productId: it.variant.productId, rating: i % 5 === 2 ? 4 : 5, text: reviewTexts[i % reviewTexts.length], isPublic: i % 3 !== 0 } });
  }
  const outOfStock = await db.productVariant.findMany({ take: 3, orderBy: { stock: "asc" } });
  for (const [i, v] of outOfStock.entries()) {
    const u = someCustomers[i + 2];
    if (u) await db.stockSubscription.upsert({ where: { userId_variantId: { userId: u.id, variantId: v.id } }, update: {}, create: { userId: u.id, variantId: v.id } });
  }
}

async function seedSupportDemo() {
  if ((await db.conversation.count()) > 0) return;
  const support = await db.user.findUniqueOrThrow({ where: { email: "support@t-rodionova.ru" } });
  const manager = await db.user.findUniqueOrThrow({ where: { email: "manager@t-rodionova.ru" } });
  const customers = await db.user.findMany({ where: { role: "CUSTOMER", orders: { some: {} } }, include: { orders: { orderBy: { createdAt: "desc" }, take: 1 }, loyaltyTier: true }, orderBy: { lifetimeSpent: "desc" }, take: 6 });
  const min = 60_000;
  const now = Date.now();
  type Script = { channel: "TELEGRAM" | "WHATSAPP" | "INSTAGRAM" | "VK" | "EMAIL" | "WEBSITE"; who: (typeof customers)[number] | null; name: string; ext: string; status: "OPEN" | "PENDING" | "CLOSED"; assignee: string | null; tags: string[]; priority?: "HIGH"; msgs: [("IN" | "OUT" | "NOTE"), string, number][] };
  const c = customers;
  const scripts: Script[] = [
    { channel: "TELEGRAM", who: c[0], name: `${c[0].firstName} ${c[0].lastName ?? ""}`, ext: "100200300", status: "OPEN", assignee: support.id, tags: ["доставка", "privé"], priority: "HIGH", msgs: [["IN", `Добрый день! Подскажите, когда приедет заказ №${c[0].orders[0]?.number}?`, 22]] },
    { channel: "WHATSAPP", who: c[1], name: c[1].firstName, ext: (c[1].phone ?? "79160000000").replace(/\D/g, ""), status: "OPEN", assignee: support.id, tags: ["размер"], msgs: [["IN", "Здравствуйте, пальто Claire большемерит? Рост 168, обычно ношу S", 6]] },
    { channel: "INSTAGRAM", who: null, name: "kate.minimal", ext: "ig_558812", status: "OPEN", assignee: null, tags: ["наличие"], msgs: [["IN", "Привет! Будет ли джемпер Elsa в чёрном размер M?", 3]] },
    { channel: "VK", who: null, name: "Дарья Левина", ext: "2000000017", status: "PENDING", assignee: manager.id, tags: ["оплата"], msgs: [["IN", "Можно ли оплатить в рассрочку?", 180], ["OUT", "Здравствуйте, Дарья! Да, при оформлении выберите «Рассрочка» — оформление онлайн за пару минут, без переплаты на 4 месяца.", 170]] },
    { channel: "EMAIL", who: c[2], name: `${c[2].firstName} ${c[2].lastName ?? ""}`, ext: c[2].email, status: "OPEN", assignee: support.id, tags: ["возврат"], msgs: [["IN", `Здравствуйте. Хочу вернуть брюки из заказа №${c[2].orders[0]?.number} — не подошёл размер. Как это сделать?`, 40], ["NOTE", "Клиентка Maison — предложить обмен на размер больше, курьер заберёт бесплатно", 35]] },
    { channel: "WEBSITE", who: c[3], name: `${c[3].firstName} ${c[3].lastName ?? ""}`, ext: c[3].id, status: "CLOSED", assignee: support.id, tags: ["баллы"], msgs: [["IN", "Почему баллы за последний заказ ещё не начислены?", 2 * 24 * 60], ["OUT", `${c[3].firstName}, баллы начисляются через 14 дней после получения — когда закончится срок возврата. Ваши баллы придут автоматически.`, 2 * 24 * 60 - 9], ["IN", "Поняла, спасибо!", 2 * 24 * 60 - 20]] },
  ];
  for (const sc of scripts) {
    const contact = await db.contact.create({ data: { channel: sc.channel, externalId: sc.ext, name: sc.name, email: sc.channel === "EMAIL" ? sc.ext : null, phone: sc.channel === "WHATSAPP" ? sc.ext : null, username: sc.channel === "INSTAGRAM" ? `@${sc.name}` : null, userId: sc.who?.id ?? null } });
    const first = sc.msgs[0][2];
    const last = sc.msgs[sc.msgs.length - 1][2];
    const lastIn = [...sc.msgs].reverse().find((m) => m[0] === "IN")?.[2] ?? first;
    const firstOut = sc.msgs.find((m) => m[0] === "OUT")?.[2];
    const conv = await db.conversation.create({
      data: {
        channel: sc.channel,
        contactId: contact.id,
        customerId: sc.who?.id ?? null,
        assigneeId: sc.assignee,
        status: sc.status,
        priority: sc.priority ?? "NORMAL",
        tags: sc.tags,
        orderNumbers: sc.who?.orders[0] && /№/.test(sc.msgs[0][1]) ? [sc.who.orders[0].number] : [],
        unread: sc.status === "OPEN" ? sc.msgs.filter((m) => m[0] === "IN").length : 0,
        createdAt: new Date(now - first * min),
        lastMessageAt: new Date(now - last * min),
        lastInboundAt: new Date(now - lastIn * min),
        waitingSince: sc.status === "OPEN" ? new Date(now - first * min) : null,
        firstResponseAt: firstOut !== undefined ? new Date(now - firstOut * min) : null,
        closedAt: sc.status === "CLOSED" ? new Date(now - last * min) : null,
      },
    });
    for (const [dir, text, ago] of sc.msgs) {
      await db.message.create({ data: { conversationId: conv.id, direction: dir, text, authorId: dir === "IN" ? null : sc.assignee ?? support.id, status: dir === "IN" ? "RECEIVED" : "SENT", createdAt: new Date(now - ago * min) } });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
