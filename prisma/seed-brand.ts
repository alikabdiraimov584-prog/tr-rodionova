import type { PrismaClient } from "../src/generated/prisma/client";

const RUB = 100;

/**
 * Вещи бренда из присланных эскизов. Фото подставляются из public/images/brand/<sku>/*.jpg,
 * если файлы есть (см. scripts/attach-brand-photos.ts), иначе остаются заглушки.
 */
export async function seedBrand(db: PrismaClient) {
  const cat = async (slug: string) => (await db.category.findUnique({ where: { slug } }))?.id ?? null;
  const collection = await db.collection.findUnique({ where: { slug: "aw26" } });
  // боди — отдельная категория бренда
  await db.category.upsert({ where: { slug: "bodysuits" }, update: { name: "Боди" }, create: { slug: "bodysuits", name: "Боди", order: 3 } });
  const items = [
    {
      slug: "bodi-tr-01",
      sku: "TR-BD-101",
      name: "Боди TR 01",
      category: "bodysuits",
      price: 18_900,
      cost: 5_600,
      material: "вискоза",
      sizeChart: "knit",
      composition: "72% вискоза, 24% полиамид, 4% эластан",
      description: "Боди с высокой горловиной и открытыми плечами. Спинка на фирменной молнии с монограммой TR, кнопки по шаговому шву. Плотное эластичное полотно держит силуэт и не просвечивает: база для жакета TR Noir и брюк TR Palazzo.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Чёрный", "#0E0E0E"]],
      image: "knit",
      featured: true,
      preorder: false,
    },
    {
      slug: "bryuki-tr-palazzo",
      sku: "TR-TR-101",
      name: "Брюки TR Palazzo",
      category: "trousers",
      price: 32_900,
      cost: 10_400,
      material: "шерсть",
      sizeChart: "trousers",
      composition: "96% шерсть, 4% эластан",
      description: "Широкие брюки с высокой посадкой, защипами и фирменной пуговицей TR на поясе. Разрезы по переду штанин открывают обувь, стрелки держат линию. Костюмная шерсть с эластаном: сидят по фигуре и не мнутся.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Чёрный", "#0E0E0E"]],
      image: "trousers",
      featured: true,
      preorder: false,
    },
    {
      slug: "yubka-tr-01",
      sku: "TR-SK-101",
      name: "Юбка TR 01",
      category: "skirts",
      price: 24_900,
      cost: 7_900,
      material: "шерсть",
      sizeChart: "skirt",
      composition: "96% шерсть, 4% эластан",
      description: "Юбка-трапеция мини с высокой посадкой и фирменной пряжкой TR на поясе. Асимметричный запах с разрезом спереди, потайная молния с монограммой на спинке. Плотная костюмная шерсть держит форму весь день.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Чёрный", "#0E0E0E"]],
      image: "skirt",
      preorder: false,
    },
    {
      slug: "zhaket-tr-noir",
      sku: "TR-JK-101",
      name: "Жакет TR Noir",
      category: "jackets",
      price: 54_900,
      cost: 17_500,
      material: "шерсть",
      sizeChart: "outer",
      composition: "92% шерсть, 8% шёлк, подкладка купро",
      description: "Приталенный жакет с баской и открытой спиной, собранный на фирменную пряжку TR по талии. Острое плечо, глубокий V-вырез без лацканов, складки по линии бедра. Вещь для вечера, которая работает и с кожаными брюками, и с юбкой TR 01.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Чёрный", "#0E0E0E"]],
      image: "jacket",
      featured: true,
      preorder: false,
    },
    {
      slug: "plate-tr-halter",
      sku: "TR-DR-101",
      name: "Платье TR Halter",
      category: "dresses",
      price: 46_900,
      cost: 14_800,
      material: "шёлк",
      sizeChart: "dress",
      composition: "100% шёлковый креп",
      description: "Платье мини с воротником-халтер и съёмным шарфом, спадающим по спине. Открытая спина, потайная молния с монограммой TR. Шёлковый креп из Комо с матовой поверхностью: держит силуэт и не просвечивает.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Айвори", "#F8F5EE"]],
      image: "dress",
      featured: true,
      preorder: true,
    },
  ];
  for (const it of items) {
    const product = await db.product.upsert({
      where: { slug: it.slug },
      update: { name: it.name, price: it.price * RUB, costPrice: it.cost * RUB, description: it.description, composition: it.composition, material: it.material, sizeChart: it.sizeChart, isPreorder: !!it.preorder, preorderShipAt: it.preorder ? new Date(Date.now() + 35 * 86_400_000) : null },
      create: {
        slug: it.slug,
        sku: it.sku,
        name: it.name,
        description: it.description,
        composition: it.composition,
        material: it.material,
        sizeChart: it.sizeChart,
        care: "Сухая чистка. Хранить на плечиках.",
        price: it.price * RUB,
        costPrice: it.cost * RUB,
        isNew: true,
        isFeatured: it.featured ?? false,
        isPreorder: !!it.preorder,
        preorderShipAt: it.preorder ? new Date(Date.now() + 35 * 86_400_000) : null,
        categoryId: await cat(it.category),
        collectionId: collection?.id ?? null,
        images: { create: [{ url: `/images/placeholder/${it.image}.svg`, alt: it.name, order: 0 }, { url: `/images/placeholder/${it.image}-2.svg`, alt: `${it.name} — деталь`, order: 1 }] },
      },
    });
    if ((await db.productVariant.count({ where: { productId: product.id } })) === 0) {
      let i = 0;
      for (const [color, hex] of it.colors)
        for (const size of it.sizes) {
          i++;
          const v = await db.productVariant.create({ data: { productId: product.id, sku: `${it.sku}-${String(i).padStart(2, "0")}`, size, color, colorHex: hex, stock: 3 } });
          await db.stockMovement.create({ data: { variantId: v.id, type: "RECEIPT", quantity: 3, unitCost: it.cost * RUB, reason: "Первый приход" } });
        }
    }
  }

  // Образы из вещей бренда — для лукбука и «купить образом»
  const looks = [
    {
      slug: "look-01-body-trousers",
      title: "Look 01 — Боди и брюки",
      description: "Высокая горловина, открытые плечи и широкие брюки с разрезами. Строгий силуэт, в котором читается женственность: фирменная молния на спине и пуговица TR на поясе.",
      cover: "/images/brand/looks/look-01.jpg",
      order: 0,
      items: [["bodi-tr-01", "Основа образа"], ["bryuki-tr-palazzo", "С разрезами на переде"]],
    },
    {
      slug: "look-02-jacket-skirt",
      title: "Look 02 — Жакет и юбка",
      description: "Жакет с открытой спиной и юбка-трапеция с фирменной пряжкой: вечерний комплект, который держит форму весь день.",
      cover: "/images/brand/TR-JK-101/01.jpg",
      order: 1,
      items: [["zhaket-tr-noir", "Пряжка TR по талии"], ["yubka-tr-01", "Запах с разрезом"], ["bodi-tr-01", "Под жакет"]],
    },
  ];
  // демо-образы уходят ниже образов бренда
  await db.look.updateMany({ where: { slug: { notIn: looks.map((l) => l.slug) }, order: { lt: 10 } }, data: { order: { increment: 10 } } });
  for (const l of looks) {
    const look = await db.look.upsert({
      where: { slug: l.slug },
      update: { title: l.title, description: l.description, coverUrl: l.cover, order: l.order, season: "AW26", isPublished: true },
      create: { slug: l.slug, title: l.title, description: l.description, coverUrl: l.cover, order: l.order, season: "AW26", isPublished: true },
    });
    let order = 0;
    for (const [slug, note] of l.items) {
      const product = await db.product.findUnique({ where: { slug } });
      if (!product) continue;
      await db.lookItem.upsert({
        where: { lookId_productId: { lookId: look.id, productId: product.id } },
        update: { order, note },
        create: { lookId: look.id, productId: product.id, order, note },
      });
      order++;
    }
  }
}
