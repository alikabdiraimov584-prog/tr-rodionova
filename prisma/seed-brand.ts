import type { PrismaClient } from "../src/generated/prisma/client";

const RUB = 100;

/**
 * Вещи бренда из присланных эскизов. Фото подставляются из public/images/brand/<sku>/*.jpg,
 * если файлы есть (см. scripts/attach-brand-photos.ts), иначе остаются заглушки.
 * Запускается при каждом старте, но только добавляет недостающее: вещи, образы и категории, которые уже есть,
 * ведутся в CRM — правки названий, цен, описаний, скрытие и удаление категорий обновление сайта не откатывает.
 * Себестоимость не задаётся: реальные цифры вводит владелец в CRM → карточка вещи (придуманных значений здесь нет).
 */
export async function seedBrand(db: PrismaClient) {
  const cat = async (slug: string) => (await db.category.findUnique({ where: { slug } }))?.id ?? null;
  const collection = await db.collection.findUnique({ where: { slug: "aw26" } });
  // боди — отдельная категория бренда; создаётся один раз вместе с первой загрузкой вещей (удалённая в CRM не возвращается)
  if (!(await db.product.findUnique({ where: { slug: "bodi-tr-01" }, select: { id: true } })) && !(await db.category.findUnique({ where: { slug: "bodysuits" }, select: { id: true } })))
    await db.category.create({ data: { slug: "bodysuits", name: "Боди", order: 3 } });
  const items = [
    {
      slug: "bodi-tr-01",
      care: "Ручная или деликатная стирка при 30°, без отбеливания. Сушить горизонтально, не выкручивать. Хранить в сложенном виде.",
      sku: "TR-BD-101",
      name: "Боди TR 01",
      category: "bodysuits",
      price: 18_900,
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
      care: "Сухая чистка один-два раза в сезон. Складки убирать паром. Хранить на плечиках с зажимами за пояс, в чехле.",
      sku: "TR-TR-101",
      name: "Брюки TR Palazzo",
      category: "trousers",
      price: 32_900,
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
      care: "Сухая чистка. Складки убирать паром, утюг только через влажную ткань на режиме «шерсть». Хранить на плечиках с зажимами.",
      sku: "TR-SK-101",
      name: "Юбка TR 01",
      category: "skirts",
      price: 24_900,
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
      care: "Только сухая чистка, не чаще раза в сезон. Между носками — на широких плечиках по форме плеча, в тканевом чехле.",
      sku: "TR-JK-101",
      name: "Жакет TR Noir",
      category: "jackets",
      price: 54_900,
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
      care: "Сухая чистка; съёмный шарф отстёгивать перед чисткой. Хранить на мягких плечиках, корсаж не складывать.",
      sku: "TR-DR-101",
      name: "Платье TR Halter",
      category: "dresses",
      price: 46_900,
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
  const shipAt = () => new Date(Date.now() + 35 * 86_400_000);
  for (const it of items) {
    const existing = await db.product.findUnique({ where: { slug: it.slug }, select: { id: true, isPreorder: true, preorderShipAt: true } });
    if (existing) {
      // у предзаказа дата отшива всегда впереди; остальное в карточке ведёт CRM
      if (existing.isPreorder && (!existing.preorderShipAt || existing.preorderShipAt < new Date())) await db.product.update({ where: { id: existing.id }, data: { preorderShipAt: shipAt() } });
      continue;
    }
    const product = await db.product.create({
      data: {
        slug: it.slug,
        sku: it.sku,
        name: it.name,
        description: it.description,
        composition: it.composition,
        material: it.material,
        sizeChart: it.sizeChart,
        care: it.care,
        price: it.price * RUB,
        isNew: true,
        isFeatured: it.featured ?? false,
        isPreorder: !!it.preorder,
        preorderShipAt: it.preorder ? shipAt() : null,
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
          await db.stockMovement.create({ data: { variantId: v.id, type: "RECEIPT", quantity: 3, unitCost: null, reason: "Первый приход" } });
        }
    }
  }

  // Образы из вещей бренда — для лукбука и «купить образом»
  const looks: { slug: string; title: string; description: string; cover: string | null; order: number; items: [string, string][] }[] = [
    {
      slug: "look-03-tr-halter",
      title: "Look 03 — Платье TR Halter",
      description: "Платье мини с воротником-халтер и съёмным шарфом по спине: открытая спина, монограмма TR на молнии и застёжке шарфа. Съёмка в студии, на модели размер S.",
      // обложка не задана: берётся первое фото платья из карточки — новая съёмка попадает в лукбук сама
      cover: null,
      order: 0,
      items: [["plate-tr-halter", "Шарф съёмный: с ним — вечер, без него — день"]],
    },
    {
      slug: "look-01-body-trousers",
      title: "Look 01 — Боди и брюки",
      description: "Высокая горловина, открытые плечи и широкие брюки с разрезами. Строгий силуэт, в котором читается женственность: фирменная молния на спине и пуговица TR на поясе.",
      cover: "/images/brand/looks/look-01.jpg",
      order: 1,
      items: [["bodi-tr-01", "Основа образа"], ["bryuki-tr-palazzo", "С разрезами на переде"]],
    },
    {
      slug: "look-02-jacket-skirt",
      title: "Look 02 — Жакет и юбка",
      description: "Жакет с открытой спиной и юбка-трапеция с фирменной пряжкой: вечерний комплект, который держит форму весь день.",
      cover: "/images/brand/TR-JK-101/01.jpg",
      order: 2,
      items: [["zhaket-tr-noir", "Пряжка TR по талии"], ["yubka-tr-01", "Запах с разрезом"], ["bodi-tr-01", "Под жакет"]],
    },
  ];
  // образы бренда создаются один раз; дальше обложку, порядок, публикацию и состав ведёт CRM
  const fresh = [];
  for (const l of looks) if (!(await db.look.findUnique({ where: { slug: l.slug }, select: { id: true } }))) fresh.push(l);
  // демо-образы уходят ниже образов бренда — только когда образы бренда появляются впервые
  if (fresh.length > 0) await db.look.updateMany({ where: { slug: { notIn: looks.map((l) => l.slug) }, order: { lt: 10 } }, data: { order: { increment: 10 } } });
  for (const l of fresh) {
    const look = await db.look.create({ data: { slug: l.slug, title: l.title, description: l.description, coverUrl: l.cover, order: l.order, season: "AW26", isPublished: true } });
    let order = 0;
    for (const [slug, note] of l.items) {
      const product = await db.product.findUnique({ where: { slug } });
      if (!product) continue;
      await db.lookItem.create({ data: { lookId: look.id, productId: product.id, order, note } });
      order++;
    }
  }
}
