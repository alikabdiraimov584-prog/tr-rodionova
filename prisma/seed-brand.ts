import type { PrismaClient } from "../src/generated/prisma/client";

const RUB = 100;

/**
 * Вещи бренда из присланных эскизов. Фото подставляются из public/images/brand/<sku>/*.jpg,
 * если файлы есть (см. scripts/attach-brand-photos.ts), иначе остаются заглушки.
 */
export async function seedBrand(db: PrismaClient) {
  const cat = async (slug: string) => (await db.category.findUnique({ where: { slug } }))?.id ?? null;
  const collection = await db.collection.findUnique({ where: { slug: "aw26" } });
  const items = [
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
}
