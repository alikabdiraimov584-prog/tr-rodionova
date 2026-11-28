import type { Metadata } from "next";
import Image from "next/image";
import { getSetting } from "@/lib/settings";
import { TextPage } from "@/components/shop/page-shell";
import { JsonLd, absolute, founderJsonLd, ids } from "@/lib/seo";
import { brandHeroImage } from "@/lib/brand-image";

export const metadata: Metadata = {
  title: "О бренде",
  description: "T.Rodionova — российский бренд женской одежды, основанный Татьяной Родионовой. Производство в Москве.",
};

export default async function About() {
  const [brand, hero] = await Promise.all([getSetting("brand"), brandHeroImage()]);
  const founder = founderJsonLd(brand);
  return (
    <TextPage
      eyebrow="О бренде"
      title={brand.name}
      intro={`${brand.name} — российский бренд женской одежды. Мы шьём в Москве.`}
      crumbs={[{ name: "О бренде", path: "/about" }]}
    >
      <JsonLd
        data={[
          { "@context": "https://schema.org", "@type": "AboutPage", "@id": absolute("/about"), name: `О бренде ${brand.name}`, url: absolute("/about"), inLanguage: "ru-RU", isPartOf: { "@id": ids().website }, about: { "@id": ids().organization }, mainEntity: { "@id": ids().organization } },
          ...(founder ? [{ "@context": "https://schema.org", "@type": "ProfilePage", "@id": absolute("/about#profile"), name: founder.name, url: absolute("/about#founder"), inLanguage: "ru-RU", isPartOf: { "@id": ids().website }, mainEntity: founder }] : []),
        ]}
      />
      <div className="space-y-4">
        <p id="founder" className="scroll-mt-24">Основательница бренда — Татьяна Родионова.</p>
        <p>Миссия бренда — вдохновлять девушек проявлять себя в вечерних и повседневных образах.</p>
        <p>Мы используем только премиальные ткани, чтобы обеспечить качество каждого изделия. Они нежно обнимают тело.</p>
        <p>Тонкая грань женственности и сексуальности.</p>
      </div>
      <div className="relative aspect-[16/9] bg-sand">
        {hero ? <Image src={hero} alt={`${brand.name}: съёмка коллекции`} fill priority sizes="(min-width: 1024px) 60rem, 100vw" className="object-cover object-top" /> : <Image src="/images/placeholder/hero.svg" alt="" fill unoptimized className="object-cover" />}
      </div>
    </TextPage>
  );
}
