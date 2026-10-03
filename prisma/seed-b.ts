import type { PrismaClient } from "../src/generated/prisma/client";

/** Демо-данные: заявки на выкуп, pre-loved товары, подборки стилиста, мерки клиенток. Идемпотентно. */
export async function seedB(db: PrismaClient) {
  const anna = await db.user.findUnique({ where: { email: "anna@example.com" } });
  const manager = await db.user.findUnique({ where: { email: "manager@t-rodionova.ru" } });
  if (!anna || !manager) return;

  // ── Мерки для 10 клиенток (по размеру из профиля) ──
  const bySize: Record<string, { bust: number; waist: number; hips: number }> = {
    XS: { bust: 82, waist: 62, hips: 88 },
    S: { bust: 86, waist: 66, hips: 92 },
    M: { bust: 90, waist: 70, hips: 96 },
    L: { bust: 94, waist: 74, hips: 100 },
    XL: { bust: 98, waist: 78, hips: 104 },
  };
  const measured = await db.user.count({ where: { role: "CUSTOMER", bust: { not: null } } });
  const others = measured > 0 ? [] : await db.user.findMany({ where: { role: "CUSTOMER", bust: null, id: { not: anna.id } }, orderBy: { createdAt: "asc" }, take: 9 });
  const customers = measured > 0 ? [] : [anna, ...others];
  for (const [i, c] of customers.entries()) {
    const base = bySize[c.preferredSize ?? "S"] ?? bySize.S;
    const d = (i % 3) - 1; // −1 / 0 / +1 см — чтобы были «на грани» и «точно»
    await db.user.update({
      where: { id: c.id },
      data: { bust: base.bust + d, waist: base.waist + d, hips: base.hips + d + (i % 2), height: 162 + ((i * 3) % 14) },
    });
  }

  // ── Заявки на выкуп: REQUESTED (Анна), OFFERED, RECEIVED ──
  if (!(await db.resaleRequest.findFirst({ where: { userId: anna.id }, select: { id: true } }))) {
    // У Анны может не быть доставленных заказов — тогда заявка по товару из любого её заказа
    const annaItem = await db.orderItem.findFirst({
      where: { order: { userId: anna.id, status: { in: ["DELIVERED", "COMPLETED"] } }, returnedQty: 0 },
      include: { variant: { select: { productId: true } } },
    });
    const anyItem = annaItem ?? (await db.orderItem.findFirst({ where: { order: { userId: anna.id } }, include: { variant: { select: { productId: true } } } }));
    const productId = anyItem?.variant.productId ?? (await db.product.findFirst({ where: { status: "ACTIVE", isPreloved: false }, select: { id: true } }))?.id;
    if (productId) {
      await db.resaleRequest.create({
        data: {
          userId: anna.id,
          orderItemId: annaItem?.id ?? null,
          productId,
          condition: "как новое",
          description: "Надевала два раза на мероприятия, после химчистки. Дефектов нет, ярлык сохранила.",
          status: "REQUESTED",
        },
      });
    }
  }
  if ((await db.resaleRequest.count({ where: { status: { in: ["OFFERED", "RECEIVED"] } } })) === 0) {
    const delivered = await db.orderItem.findMany({
      where: { order: { status: { in: ["DELIVERED", "COMPLETED"] }, userId: { not: anna.id } }, returnedQty: 0, resales: { none: {} } },
      include: { order: { select: { userId: true } }, variant: { select: { productId: true } } },
      orderBy: { order: { createdAt: "desc" } },
      take: 200,
    });
    const second = delivered[0];
    const third = delivered.find((i) => i.order.userId !== second?.order.userId) ?? delivered[1];
    if (second) {
      await db.resaleRequest.create({
        data: {
          userId: second.order.userId!,
          orderItemId: second.id,
          productId: second.variant.productId,
          condition: "хорошее",
          description: "Носила сезон, аккуратно. Небольшие катышки на боках, после чистки.",
          status: "OFFERED",
          offerPoints: Math.floor((second.price * 20) / 100 / 100),
          managerNote: "Спасибо за фото! По состоянию — 20%, катышки уберём в ателье.",
        },
      });
    }
    if (third) {
      const points = Math.floor((third.price * 30) / 100 / 100);
      await db.$transaction(async (tx) => {
        const r = await tx.resaleRequest.create({
          data: {
            userId: third.order.userId!,
            orderItemId: third.id,
            productId: third.variant.productId,
            condition: "как новое",
            description: "Не подошёл фасон, надевала один раз дома. Как новое.",
            status: "RECEIVED",
            offerPoints: points,
            managerNote: "Принято, вещь в идеальном состоянии.",
          },
        });
        await tx.pointsTransaction.create({
          data: { userId: third.order.userId!, type: "EARN_MANUAL", amount: points, comment: `Выкуп: ${third.productName}, ${third.size}`, createdBy: manager.id, expiresAt: new Date(Date.now() + 365 * 86_400_000) },
        });
        await tx.user.update({ where: { id: third.order.userId! }, data: { pointsBalance: { increment: points } } });
        await tx.auditLog.create({ data: { userId: manager.id, action: "resale.receive", entity: "ResaleRequest", entityId: r.id, payload: { points, demo: true } } });
      });
    }
  }

  // ── Pre-loved товар на витрине ──
  if ((await db.product.count({ where: { isPreloved: true } })) === 0) {
    const source = await db.product.findFirst({ where: { status: "ACTIVE", isPreloved: false, variants: { some: {} } }, include: { images: { orderBy: { order: "asc" } }, variants: { orderBy: { sku: "asc" } } }, orderBy: { createdAt: "asc" } });
    if (source) {
      const v0 = source.variants.find((v) => v.size === "S") ?? source.variants[0];
      const price = Math.round((source.price * 0.55) / 100) * 100;
      const p = await db.product.create({
        data: {
          slug: `${source.slug}-preloved-demo`,
          sku: `${source.sku}-PL-DEMO`,
          name: `${source.name} · pre-loved`,
          description: `Вещь из программы выкупа T.Rodionova. Состояние: как новое — надевалась дважды, после химчистки. ${source.description ?? ""}`.trim(),
          composition: source.composition,
          care: source.care,
          madeIn: source.madeIn,
          price,
          compareAt: source.price,
          status: "ACTIVE",
          isPreloved: true,
          condition: "как новое",
          material: source.material,
          sizeChart: source.sizeChart,
          categoryId: source.categoryId,
          collectionId: source.collectionId,
          images: { create: source.images.map((i) => ({ url: i.url, alt: i.alt, order: i.order })) },
        },
      });
      const v = await db.productVariant.create({ data: { productId: p.id, sku: `${source.sku}-PL-DEMO-01`, size: v0.size, color: v0.color, colorHex: v0.colorHex, stock: 1 } });
      await db.stockMovement.create({ data: { variantId: v.id, type: "RECEIPT", quantity: 1, reason: "Выкуп (демо)", createdBy: manager.id } });
    }
  }

  // ── Подборки стилиста ──
  if ((await db.selection.count()) === 0) {
    const products = await db.product.findMany({ where: { status: "ACTIVE", isPreloved: false }, include: { variants: true }, orderBy: { createdAt: "asc" }, take: 8 });
    const variantFor = (p: (typeof products)[number], size: string | null) => p.variants.find((v) => v.size === size && v.stock - v.reserved > 0) ?? p.variants.find((v) => v.stock - v.reserved > 0) ?? null;
    const comments = [
      "Основа капсулы: носите с брюками и с платьем, рукав можно подворачивать.",
      "Под жакет и отдельно — с тонким трикотажем. Длина чуть ниже колена.",
      "Мягкий трикотаж на каждый день, цвет перекликается с жакетом.",
    ];
    if (products.length >= 3) {
      const sent = await db.selection.create({
        data: {
          userId: anna.id,
          stylistId: manager.id,
          title: "Осенняя капсула: офис и выходные",
          note: "Анна, собрала три вещи, которые сочетаются между собой и с тем, что у вас уже есть. Размер S — по вашим меркам сидит точно. Если захотите примерить дома — напишите.",
          status: "SENT",
          sentAt: new Date(Date.now() - 2 * 86_400_000),
          items: {
            create: products.slice(0, 3).map((p, order) => ({ productId: p.id, variantId: variantFor(p, anna.preferredSize)?.id ?? null, comment: comments[order], order })),
          },
        },
      });
      const contact = await db.contact.upsert({
        where: { channel_externalId: { channel: "WEBSITE", externalId: anna.id } },
        update: {},
        create: { channel: "WEBSITE", externalId: anna.id, name: `${anna.firstName} ${anna.lastName ?? ""}`.trim(), email: anna.email, phone: anna.phone, userId: anna.id },
      });
      let conv = await db.conversation.findFirst({ where: { contactId: contact.id }, orderBy: { lastMessageAt: "desc" } });
      if (!conv) conv = await db.conversation.create({ data: { channel: "WEBSITE", contactId: contact.id, customerId: anna.id, status: "PENDING", tags: ["стилист"] } });
      await db.message.create({
        data: { conversationId: conv.id, direction: "OUT", text: `${anna.firstName}, я собрала для вас подборку «${sent.title}» — посмотрите в кабинете: /account/stylist/${sent.id}`, status: "SENT", authorId: manager.id, createdAt: sent.sentAt! },
      });
      await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), status: conv.status === "OPEN" ? "OPEN" : "PENDING", closedAt: null } });
    }
    const other = await db.user.findFirst({ where: { role: "CUSTOMER", id: { not: anna.id }, bust: { not: null } }, orderBy: { createdAt: "asc" } });
    if (other && products.length >= 5) {
      await db.selection.create({
        data: {
          userId: other.id,
          stylistId: manager.id,
          title: "К отпуску: платья и трикотаж",
          note: "Черновик — уточнить даты поездки.",
          status: "DRAFT",
          items: { create: products.slice(3, 5).map((p, order) => ({ productId: p.id, variantId: variantFor(p, other.preferredSize)?.id ?? null, comment: order === 0 ? "Лёгкое, не мнётся в чемодане." : null, order })) },
        },
      });
    }
  }
}
