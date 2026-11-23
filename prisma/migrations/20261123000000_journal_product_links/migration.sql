BEGIN;

-- Правки действующих статей по адресу. Даты выпуска и содержимое других статей сохраняются.
UPDATE "Article"
SET body = regexp_replace(body, $journal$\[([^\]\n]+)\]\(/product/(?:zhaket-tr-noir|yubka-tr-01)\)$journal$, $journal$\1$journal$, 'g'), "updatedAt" = CURRENT_TIMESTAMP
WHERE body ~ $journal$\[([^\]\n]+)\]\(/product/(?:zhaket-tr-noir|yubka-tr-01)\)$journal$;

UPDATE "Article" SET body = replace(body, $journal$## Если вы между размерами$journal$, $journal$После замеров сравните посадку конкретной вещи: [платье TR Halter](/product/plate-tr-halter), [брюки TR Palazzo](/product/bryuki-tr-palazzo) или [боди TR 01](/product/bodi-tr-01). Доступные размеры указаны в карточке каждой модели.

## Если вы между размерами$journal$), "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 'kak-vybrat-razmer-onlayn' AND strpos(body, $journal$## Если вы между размерами$journal$) > 0;
UPDATE "Article" SET body = replace(body, $journal$как у **Платья TR Halter**, где лиф держит форму сам.$journal$, $journal$как у [платья TR Halter](/product/plate-tr-halter), где лиф держит форму сам. В карточке можно сверить доступные размеры.

![Открытая спина и съёмный шарф платья TR Halter](/images/brand/TR-DR-101/tr-halter-04.jpg)$journal$), "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 'plate-halter-komu-idet' AND strpos(body, $journal$как у **Платья TR Halter**, где лиф держит форму сам.$journal$) > 0;
UPDATE "Article" SET body = replace(body, $journal$Платье отшивается под предзаказ, поэтому при заказе укажите мерки в комментарии: мы проверим посадку ещё до раскроя.$journal$, $journal$В карточке [TR Halter](/product/plate-tr-halter) указаны доступные размеры и условия оформления. Если сомневаетесь, начните с [таблицы размеров](/sizes).$journal$), "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 'plate-halter-komu-idet' AND strpos(body, $journal$Платье отшивается под предзаказ, поэтому при заказе укажите мерки в комментарии: мы проверим посадку ещё до раскроя.$journal$) > 0;
UPDATE "Article" SET body = replace(body, $journal$Поэтому мы отшиваем **Брюки TR Palazzo** с запасом по длине и подгоняем под ваш каблук в ателье: примерка курьером позволяет приколоть длину прямо дома.$journal$, $journal$В карточке [брюк TR Palazzo](/product/bryuki-tr-palazzo) можно посмотреть посадку и выбрать размер. На примерку подготовьте обувь, с которой планируете их носить.$journal$), "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 's-chem-nosit-bryuki-palazzo' AND strpos(body, $journal$Поэтому мы отшиваем **Брюки TR Palazzo** с запасом по длине и подгоняем под ваш каблук в ателье: примерка курьером позволяет приколоть длину прямо дома.$journal$) > 0;
UPDATE "Article" SET body = replace(body, $journal$**Выход.** Палаццо и **Боди TR 01** с открытыми плечами$journal$, $journal$**Выход.** [Брюки TR Palazzo](/product/bryuki-tr-palazzo) и [боди TR 01](/product/bodi-tr-01) с открытыми плечами$journal$), "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 's-chem-nosit-bryuki-palazzo' AND strpos(body, $journal$**Выход.** Палаццо и **Боди TR 01** с открытыми плечами$journal$) > 0;
UPDATE "Article" SET body = replace(body, $journal$Курьер приезжает в течение 1–2 дней после заказа. Доставка с примеркой стоит 500 ₽, а при заказе от 15 000 ₽ она бесплатна.$journal$, $journal$Для примерки начните с модели: [брюки TR Palazzo](/product/bryuki-tr-palazzo) или [боди TR 01](/product/bodi-tr-01). Актуальную стоимость и условия смотрите в разделе [«Доставка и возврат»](/delivery).$journal$), "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 'primerka-kurerom-kak-rabotaet' AND strpos(body, $journal$Курьер приезжает в течение 1–2 дней после заказа. Доставка с примеркой стоит 500 ₽, а при заказе от 15 000 ₽ она бесплатна.$journal$) > 0;

UPDATE "Article" SET body = $journal$Для новогоднего вечера начните с формата встречи. В ресторане хорошо работает платье с открытой спиной, на корпоративе — широкие брюки с жакетом, а дома — мягкое боди и удобная обувь. Ниже три сочетания на основе коллекции T.Rodionova.

## Ресторан или вечеринка

[Платье TR Halter](/product/plate-tr-halter) из шёлкового крепа цвета айвори подойдёт, если хочется открытых плеч и спины. Съёмный шарф спадает по спине. С ним достаточно небольших серёг, без него можно выбрать акцентную пару. К платью подойдут лодочки или минималистичные босоножки. Если дорога проходит по снегу, возьмите праздничную обувь с собой и переобуйтесь в гардеробе.

При примерке подвигайте руками и сядьте, чтобы проверить, держится ли лиф. Как выбрать размер и с чем носить такой вырез, разобрали в [гиде по платью халтер](/journal/plate-halter-komu-idet).

## Корпоратив

[Брюки TR Palazzo](/product/bryuki-tr-palazzo) можно надеть с белой рубашкой или закрытым топом и жакетом из своего гардероба. На ужин после официальной части достаточно снять жакет или добавить серьги. При подборе длины проверьте подол именно в той обуви, в которой будете весь вечер. Для плоской пары подойдёт острый нос, который не скрывается под широкой штаниной. Больше сочетаний — в [гиде по палаццо](/journal/s-chem-nosit-bryuki-palazzo).

## Новый год дома

[Боди TR 01](/product/bodi-tr-01) с открытыми плечами можно сочетать с палаццо, свободными брюками или юбкой из своего гардероба. Для камерного вечера достаточно одной акцентной детали: серёг, необычной пары туфель или матовой помады. Если будет прохладно, держите под рукой мягкий кардиган. Сочетания на другие случаи собраны в статье [«Боди как база гардероба»](/journal/bodi-baza-garderoba).

## Размер, примерка и сроки

- Снимите мерки и сравните их с [таблицей размеров](/sizes). У платья проверьте посадку лифа, у брюк — талию и длину в выбранной обуви.
- Для Москвы и Петербурга проверьте [условия примерки курьером](/journal/primerka-kurerom-kak-rabotaet). Она поможет сравнить посадку дома с вашей обувью и верхней одеждой.
- Перед заказом проверьте доступность размера и дату доставки. Если на карточке указан предзаказ, сверяйтесь со сроком отшива и оставляйте запас до мероприятия.

Смотреть [актуальную коллекцию](/catalog).$journal$, excerpt = $journal$Три новогодних образа с моделями T.Rodionova: платье TR Halter для ресторана, брюки TR Palazzo для корпоратива и боди TR 01 для домашнего вечера.$journal$, "metaDescription" = $journal$Что надеть на Новый год 2027: три сочетания с платьем TR Halter, брюками TR Palazzo и боди TR 01. Советы по посадке, примерке и срокам доставки.$journal$, "updatedAt" = CURRENT_TIMESTAMP WHERE slug = 'plate-na-novyy-god';

DELETE FROM "_ArticleProducts" ap USING "Article" a, "Product" p
WHERE ap."A" = a.id AND ap."B" = p.id AND a.slug = 'plate-na-novyy-god'
  AND p.slug IN ('plate-ines', 'kostyum-tr-blanc', 'zhaket-tr-noir');
INSERT INTO "_ArticleProducts" ("A", "B")
SELECT a.id, p.id FROM "Article" a CROSS JOIN "Product" p
WHERE a.slug = 'plate-na-novyy-god' AND p.slug IN ('plate-tr-halter', 'bryuki-tr-palazzo', 'bodi-tr-01')
ON CONFLICT DO NOTHING;

COMMIT;
