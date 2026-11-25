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
  // костюмы — категория для комплектов (жакет, топ, юбка одним артикулом); создаётся вместе с первым костюмом
  if (!(await db.product.findUnique({ where: { slug: "kostyum-tr-blanc" }, select: { id: true } })) && !(await db.category.findUnique({ where: { slug: "suits" }, select: { id: true } })))
    await db.category.create({ data: { slug: "suits", name: "Костюмы", order: 1 } });
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
    },
    {
      slug: "amore",
      care: "Сухая чистка; съёмный шарф отстёгивать перед чисткой. Хранить на мягких плечиках, корсаж не складывать.",
      sku: "TR-DR-101",
      name: "Платье Amore",
      category: "dresses",
      price: 46_900,
      material: "Смесовая ткань",
      sizeChart: "dress",
      composition: "47% вискозы, 50% полиэстера, 3% эластана",
      description: "Платье мини с воротником-халтер и съёмным шарфом, спадающим по спине. Открытая спина, потайная молния с монограммой TR.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Айвори", "#F8F5EE"]],
      image: "dress",
      featured: true,
    },
    {
      slug: "kostyum-tr-blanc",
      care: "Сухая чистка. Кольцо и пряжку TR перед чисткой обернуть тканью, молнию топа застегнуть. Жакет и топ хранить на плечиках, юбку — с зажимами за пояс, всё в чехле.",
      sku: "TR-ST-101",
      name: "Костюм TR Blanc",
      category: "suits",
      price: 72_900,
      // состав и материал вводит владелица в CRM: ткань по фото не определяется, придуманных данных здесь нет
      material: null,
      sizeChart: "outer",
      composition: null,
      description: "Костюм из трёх вещей: укороченный жакет с воротником-стойкой, топ-бюстье и юбка мини. Жакет застёгивается под горлом на фирменное кольцо TR, под ним вырез-капля, на спине — открытая полоса между лопаток, на манжетах по три золотые пуговицы. Топ-бюстье на молнии спереди. Юбка с высокой посадкой, асимметричным запахом и пряжкой TR на поясе. Плотная костюмная ткань держит форму; три вещи носятся вместе и по отдельности — с брюками TR Palazzo или под жакет TR Noir.",
      sizes: ["XS", "S", "M", "L"],
      colors: [["Белый", "#F3F0E9"]],
      image: "jacket",
      featured: true,
    },
  ];
  for (const it of items) {
    const existing = await db.product.findFirst({ where: { OR: [{ sku: it.sku }, { slug: it.slug }] }, select: { id: true } });
    if (existing) continue;
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

}
