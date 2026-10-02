import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const RUB = 100; // копейки в рубле

async function main() {
  // ── Уровни лояльности «T.Rodionova Circle» ──
  const tiers = [
    {
      code: "BASE",
      name: "Circle",
      threshold: 0,
      cashbackPct: 3,
      maxPayPct: 20,
      birthdayBonus: 1000,
      order: 0,
      perks: ["3% баллами с каждой покупки", "Подарок ко дню рождения"],
    },
    {
      code: "SILVER",
      name: "Silver",
      threshold: 100_000 * RUB,
      cashbackPct: 5,
      maxPayPct: 25,
      birthdayBonus: 2000,
      order: 1,
      freeShipping: true,
      perks: ["5% баллами", "Бесплатная доставка", "Подарок ко дню рождения"],
    },
    {
      code: "GOLD",
      name: "Gold",
      threshold: 300_000 * RUB,
      cashbackPct: 7,
      maxPayPct: 30,
      birthdayBonus: 3000,
      order: 2,
      freeShipping: true,
      freeReturns: true,
      earlyAccess: true,
      perks: [
        "7% баллами",
        "Бесплатная доставка и возврат",
        "Ранний доступ к коллекциям",
        "Подарок ко дню рождения",
      ],
    },
    {
      code: "BLACK",
      name: "Black",
      threshold: 700_000 * RUB,
      cashbackPct: 10,
      maxPayPct: 30,
      birthdayBonus: 5000,
      order: 3,
      freeShipping: true,
      freeReturns: true,
      earlyAccess: true,
      stylist: true,
      perks: [
        "10% баллами",
        "Персональный стилист",
        "Закрытые показы и предзаказ",
        "Бесплатная доставка и возврат",
        "Подарок ко дню рождения",
      ],
    },
  ];
  for (const t of tiers) {
    await db.loyaltyTier.upsert({ where: { code: t.code }, update: t, create: t });
  }
  const base = await db.loyaltyTier.findUniqueOrThrow({ where: { code: "BASE" } });

  // ── Настройки ──
  const settings: Record<string, unknown> = {
    loyalty: {
      welcomePoints: 1000,
      referralPoints: 1500,
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
      pointsBalance: 1000,
      source: "Instagram",
      tags: ["vip-кандидат"],
    },
  });
  if ((await db.pointsTransaction.count({ where: { userId: customer.id } })) === 0) {
    await db.pointsTransaction.create({
      data: { userId: customer.id, type: "EARN_WELCOME", amount: 1000, comment: "Приветственный бонус" },
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

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
