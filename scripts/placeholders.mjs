// Генерирует SVG-заглушки для фото товаров в палитре бренда.
import { writeFileSync } from "node:fs";
const items = {
  jacket: ["#A89B8C", "Жакет"], coat: ["#D9C29F", "Пальто"], dress: ["#C9BBA8", "Платье"],
  trousers: ["#0E0E0E", "Брюки"], knit: ["#E8DECF", "Трикотаж"], shirt: ["#F8F5EE", "Рубашка"],
  skirt: ["#B8A994", "Юбка"], scarf: ["#D9C29F", "Шарф"], hero: ["#B9AB97", ""],
};
const svg = (bg, label, variant) => {
  const dark = bg === "#0E0E0E";
  const fg = dark ? "#D9C29F" : "#0E0E0E";
  const shade = dark ? "#1A1A1A" : "rgba(0,0,0,0.06)";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
<rect width="800" height="1000" fill="${bg}"/>
<rect x="${variant ? 120 : 200}" y="${variant ? 80 : 180}" width="${variant ? 560 : 400}" height="${variant ? 840 : 640}" fill="${shade}"/>
<text x="400" y="520" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="140" fill="${fg}" opacity="0.55">TR</text>
<text x="400" y="600" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" letter-spacing="6" fill="${fg}" opacity="0.6">${label.toUpperCase()}</text>
</svg>`;
};
for (const [k, [bg, label]] of Object.entries(items)) {
  writeFileSync(`public/images/placeholder/${k}.svg`, svg(bg, label, false));
  writeFileSync(`public/images/placeholder/${k}-2.svg`, svg(bg, label, true));
}
console.log("ok");
