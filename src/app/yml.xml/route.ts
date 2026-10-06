import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { absolute, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Товарный фид YML для Яндекса (Вебмастер → Товары и предложения, Яндекс Маркет, Нейро): по одному предложению на вариант
 * размера и цвета, с наличием, ценой, фото и ссылкой на карточку. Только активные вещи текущей коллекции.
 */
export async function GET() {
  const [brand, products, categories] = await Promise.all([
    getSetting("brand"),
    db.product.findMany({ where: { status: "ACTIVE", isPreloved: false }, include: { images: { orderBy: { order: "asc" }, take: 5 }, variants: true, category: true } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<yml_catalog date="${date}">`);
  lines.push("<shop>");
  lines.push(`<name>${esc(brand.name)}</name>`);
  lines.push(`<company>${esc(brand.name)}</company>`);
  lines.push(`<url>${esc(siteUrl())}</url>`);
  lines.push('<currencies><currency id="RUB" rate="1"/></currencies>');
  lines.push("<categories>");
  for (const c of categories) lines.push(`<category id="${esc(c.slug)}">${esc(c.name)}</category>`);
  lines.push("</categories>");
  lines.push("<offers>");
  for (const p of products) {
    for (const v of p.variants) {
      const available = p.isPreorder || v.stock - v.reserved > 0;
      lines.push(`<offer id="${esc(v.sku)}" group_id="${esc(p.sku)}" available="${available}">`);
      lines.push(`<name>${esc(`${p.name}, ${v.size}${v.color ? `, ${v.color}` : ""}`)}</name>`);
      lines.push(`<url>${esc(absolute(`/product/${p.slug}`))}</url>`);
      lines.push(`<price>${Math.round((v.price ?? p.price) / 100)}</price>`);
      lines.push("<currencyId>RUB</currencyId>");
      if (p.category) lines.push(`<categoryId>${esc(p.category.slug)}</categoryId>`);
      for (const img of p.images) lines.push(`<picture>${esc(absolute(img.url))}</picture>`);
      lines.push(`<vendor>${esc(brand.name)}</vendor>`);
      lines.push(`<vendorCode>${esc(p.sku)}</vendorCode>`);
      if (p.description) lines.push(`<description>${esc(p.description)}</description>`);
      lines.push(`<param name="Размер">${esc(v.size)}</param>`);
      if (v.color) lines.push(`<param name="Цвет">${esc(v.color)}</param>`);
      if (p.composition) lines.push(`<param name="Состав">${esc(p.composition)}</param>`);
      if (p.madeIn) lines.push(`<country_of_origin>${esc(p.madeIn)}</country_of_origin>`);
      // самовывоза без шоурума нет; sales_notes (до 50 знаков) показывается в карточке товара Яндекса
      lines.push("<store>false</store><pickup>false</pickup><delivery>true</delivery>");
      lines.push("<sales_notes>Примерка курьером в Москве и Петербурге</sales_notes>");
      lines.push("</offer>");
    }
  }
  lines.push("</offers>");
  lines.push("</shop>");
  lines.push("</yml_catalog>");
  return new Response(lines.join("\n"), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=1800" } });
}
