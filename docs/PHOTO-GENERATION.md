# Фото изделий для карточек товара: референсы, промпты, загрузка

Назначение: обновить фото пяти изделий и образа Look 01 без изменения формы и вида вещей. Исходные референсы лежат в `public/images/brand/<артикул>/` (22 файла, 170–700 px по длинной стороне). Этот документ содержит точные описания изделий по референсам, единый студийный стиль и готовые промпты для генераторов изображений (англ. и рус.), а также порядок загрузки готовых фото в CRM.

## Правила

1. **Форма и вид не меняются.** Генератор получает референс (image-to-image) и описание из раздела изделия; в промпте перечислено, что обязано остаться как есть. Любой кадр, где изменились вырез, длина, застёжка, фурнитура или цвет, бракуется.
2. **Единый стиль каталога.** Все кадры в одном студийном сетапе (ниже), иначе витрина выглядит собранной из разных магазинов.
3. **Разрешение.** Для карточек товара хватает 2400–3000 px по длинной стороне (в 3:4 это 2400×3200). Сайт сам отдаёт уменьшенные WebP-копии под экран покупательницы, поэтому исходник больше 4000 px только замедляет загрузку в CRM. «8K» (7680 px) имеет смысл только для печати и билбордов.
4. **Исходники храним отдельно** (папка в облаке по артикулам), на сайт грузим JPEG качества 90–92.

## Единый студийный стиль (вставляется в каждый промпт)

EN: `photorealistic e-commerce fashion photography, full-length female model with a neutral calm expression, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture (not a flat silhouette), 85mm lens look, no props, no text, no logos except the small TR hardware, ultra-high resolution, 8K, fine fabric detail`

RU: `фотореалистичная предметная fashion-съёмка для интернет-магазина, модель в полный рост со спокойным нейтральным выражением лица, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, изделие в центре и целиком, резкость на фактуре ткани и швах, чёрный с видимой фактурой (не плоский силуэт), объектив 85 мм, без реквизита, без текста, без логотипов кроме маленькой фурнитуры TR, сверхвысокое разрешение, 8K, мелкая фактура ткани`

## Как генерировать, чтобы форма сохранилась

- **Midjourney**: загрузить референс, использовать `--cref <ссылка на референс> --cw 100` (персонаж/вещь) и `--sref` для стиля; промпт из раздела изделия; `--ar 3:4 --q 2`. Затем Upscale (Subtle) ×2 и, при необходимости, внешний апскейл.
- **Flux Kontext / gpt-image (режим редактирования изображения)**: подать референс и текст из блока «img2img»: «сохранить изделие полностью, заменить фон/свет/модель, повысить детализацию». Это самый надёжный способ не изменить вещь.
- **Stable Diffusion / ComfyUI**: img2img с denoise 0.25–0.35 (выше — вещь «поплывёт»), ControlNet Canny или Depth от референса, затем апскейл Real-ESRGAN x4 или SUPIR.
- **Kandinsky (FusionBrain) / YandexART**: только text-to-image, референс не принимают, поэтому используйте русский промпт целиком и отбирайте кадры по чек-листу «что должно остаться».
- Негативный промпт из раздела изделия подаётся туда, где он поддерживается (SD, Kandinsky); в Midjourney — через `--no`.

## Апскейл без изменения формы

Если нужен большой размер без генерации заново, используйте Real-ESRGAN (x4plus) или Topaz Gigapixel: они увеличивают резкость и размер, не меняя силуэт. Так сделаны файлы `*-x4` из этой задачи: 22 референса увеличены в 4 раза (до 2800×4000 px) без перерисовки.

## Загрузка на сайт

CRM → Товары → карточка изделия → «Фото»: JPEG, PNG, WebP или AVIF, несколько файлов за раз, до 12 МБ каждый. Первое фото — главное (в каталоге), второе показывается при наведении. Обложки образов: CRM → Контент → Образы. Сайт отдаёт фото через оптимизатор (WebP под ширину экрана), поэтому большие исходники не замедляют витрину.

## Изделия

### Образ Look 01: боди TR 01 + брюки TR Palazzo (looks/look-01)
Референсы: `public/images/brand/looks/`.

**Как изделие выглядит на референсах**

- **Силуэт.** Образ из двух отдельных вещей: облегающее боди, заправленное в широкие брюки палаццо с высокой посадкой. Верх плотно сидит по корпусу, низ — прямые широкие штанины, падающие от бедра до пола. Строгий, вытянутый вертикальный силуэт без объёма в плечах.
- **Горловина.** Высокий воротник-стойка (mock neck, примерно 4–5 см, выглядит как прямая стойка, а не складывающийся хомут). Пройма «американка»/халтер: от полностью закрытой груди полотно сужается к шее и переходит в стойку; плечи и ключицы полностью открыты, декольте нет, спереди никаких швов и декора.
- **Рукава / бретели.** Без рукавов. Проймы глубоко вырезаны и спереди, и сзади: спереди — халтер, сзади — спинка типа racerback, узкая между лопатками и расширяющаяся к талии; лопатки и верх спины открыты.
- **Длина.** Боди заправлено в брюки, его низ не виден. Брюки — в пол: при каблуке подол касается пола, видны только острые мысы чёрных туфель.
- **Спинка.** Спинка боди: по центру от самого верха воротника до пояса брюк — открытая (не потайная) металлическая молния золотого тона с мелкими зубцами; у воротника на бегунке маленькая золотая подвеска-монограмма TR. Сзади брюк: гладкий пояс без фурнитуры, два прорезных кармана в рамку без клапанов и пуговиц (по одному на каждой половинке), заутюженные стрелки по задней части штанин. Внизу обеих штанин сзади по линиям стрелок видны вертикальные расхождения ткани (~15–20 см) с нахлёстом слоёв у подола, похожие на разрезы — трактовка см. в неопределённостях.
- **Застёжки.** Боди: единственная застёжка — молния по центру спины; спереди застёжек нет. Брюки: одна круглая пуговица золотого тона с рельефной монограммой TR по центру пояса спереди; под ней виден только вертикальный край гульфика (линия от пояса вниз до линии шага), сама застёжка не видна (предположительно потайная молния). Другой фурнитуры нет: ни ремня, ни пряжек, ни пуговиц на задних карманах.
- **Детали.** Брюки: по два защипа с каждой стороны от застёжки (ближний к центру — глубокий, переходит в стрелку; второй, ближе к карману, — мелкий, читается слабо), косые карманы в боковых швах (на фото руки модели в карманах), заутюженные стрелки спереди и сзади, внизу каждой штанины спереди точно по линии стрелки — вертикальный разрез около 20 см, открывающий носок обуви; подол ровный, без манжет. На поясе по бокам от пуговицы видны вертикальные строчки — возможно, шлёвки. Боди: гладкое, без вытачек, швов и декора спереди.
- **Ткань.** Боди — плотный гладкий матовый эластичный трикотаж, облегает без заломов и не просвечивает, лёгкий бархатистый матовый блик на объёмах. Брюки — матовая костюмная шерсть: держит форму, чёткие заутюженные стрелки, тяжёлая ровная драпировка без складок и морщин. Фурнитура (пуговица, молния, подвеска) — тёплое золото/латунь.
- **Цвет.** Глубокий чёрный у обеих вещей; на фото оттенок одинаковый, фактуры различаются (трикотаж мягче, шерсть суше). Фурнитура — золотой тон. Обувь на фото — чёрные лодочки с острым мысом.

**Что обязано остаться без изменений**

- Боди: высокий воротник-стойка и пройма «американка»/халтер — полотно сужается от закрытой груди к шее, плечи и ключицы полностью открыты, декольте и бретелек нет.
- Боди без рукавов; спинка racerback — узкая между лопатками, лопатки открыты.
- Спинка боди: открытая металлическая молния золотого тона по центру спины от верха воротника до пояса брюк; на верхнем бегунке — маленькая золотая подвеска-монограмма TR. Спереди боди застёжек и швов нет.
- Боди заправлено в брюки; это две отдельные вещи с поясом между ними, а не комбинезон.
- Брюки: высокая посадка на талии, прямой пояс с единственной круглой золотой пуговицей с монограммой TR по центру спереди; никаких других пуговиц, ремней и пряжек.
- По два защипа с каждой стороны от застёжки (ближний к центру глубже) и косые карманы в боковых швах.
- Широкие прямые штанины палаццо в пол с заутюженными стрелками спереди и сзади; без манжет, без сужения и без клёша.
- По одному вертикальному разрезу внизу каждой штанины спереди по линии стрелки (около 20 см); разрезов по бокам не добавлять, сзади разрезы не рисовать (по каталогу их нет; на фото сзади есть спорные расхождения ткани — см. неопределённости).
- Сзади брюк: два прорезных кармана в рамку без клапанов и пуговиц, гладкий пояс без фурнитуры.
- Цвет обеих вещей — глубокий чёрный с читаемой фактурой; фурнитура — тёплое золото. Боди — гладкий матовый эластичный трикотаж, брюки — матовая костюмная шерсть без блеска и принтов.

**Лучшие референсы**

- looks/look-01.jpg — вид спереди (левая фигура композита): горловина, проймы, пуговица TR, защипы, карманы, стрелки, передние разрезы
- looks/look-01.jpg — вид сзади (правая фигура композита): молния на спине, подвеска TR, спинка racerback, задние прорезные карманы
- looks/look-01.jpg — детали (кропы одного файла): пояс с пуговицей TR и защипами ~ область x100–350 / y265–420; верх спины с молнией и подвеской ~ x420–660 / y60–340; передние разрезы ~ x0–360 / y760–1000; задний подол (спорные расхождения) ~ x380–700 / y820–990

**Промпты**

*front*

EN:

```
Front view, black two-piece look: sleeveless matte stretch-jersey bodysuit, high stand collar, cut-away halter armholes, shoulders fully bare, chest covered, no front closures, tucked into high-waisted wide-leg palazzo trousers in matte black suiting wool: straight waistband, one round gold TR-monogram button at centre front, concealed fly, two pleats per side, slanted side pockets, pressed creases, floor-length straight legs, short vertical slit on the crease at each front hem. Photorealistic e-commerce studio photo, full-length female model, neutral calm expression, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид спереди, чёрный образ из двух вещей: боди без рукавов из матового эластичного трикотажа, высокий воротник-стойка, вырезанные проймы «американка», плечи полностью открыты, грудь закрыта, спереди застёжек нет; заправлено в широкие брюки палаццо с высокой посадкой из матовой чёрной костюмной шерсти: прямой пояс, одна круглая золотая пуговица с монограммой TR по центру спереди, потайная застёжка, по два защипа с каждой стороны, косые боковые карманы, заутюженные стрелки, прямые штанины в пол, короткий вертикальный разрез по стрелке внизу каждой штанины спереди. Фотореалистичная студийная съёмка для карточки интернет-магазина, модель в полный рост, спокойное нейтральное выражение лица, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*three-quarter*

EN:

```
Three-quarter view, model turned about 45 degrees, black two-piece look: sleeveless matte stretch-jersey bodysuit, high stand collar, cut-away halter armholes, shoulders and upper back bare, tucked into high-waisted wide-leg palazzo trousers in matte black suiting wool: straight waistband with one round gold TR-monogram button, two pleats per side, slanted side pockets, pressed creases, floor-length straight legs with a short slit at each front hem. Photorealistic e-commerce studio photo, full-length female model, neutral calm expression, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид в три четверти, модель развёрнута примерно на 45 градусов, чёрный образ из двух вещей: боди без рукавов из матового эластичного трикотажа, высокий воротник-стойка, вырезанные проймы «американка», плечи и верх спины открыты; заправлено в широкие брюки палаццо с высокой посадкой из матовой чёрной костюмной шерсти: прямой пояс с одной круглой золотой пуговицей с монограммой TR, по два защипа с каждой стороны, косые боковые карманы, заутюженные стрелки, прямые штанины в пол с коротким разрезом внизу каждой штанины спереди. Фотореалистичная студийная съёмка для карточки интернет-магазина, модель в полный рост, спокойное нейтральное выражение лица, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*back*

EN:

```
Back view, black two-piece look: sleeveless matte stretch-jersey bodysuit with high stand collar and racerback, deep armholes baring shoulders and shoulder blades, exposed gold-tone metal zip down the centre back from collar top to waistband, small gold TR-monogram charm hanging from the zip pull at the collar; tucked into high-waisted wide-leg palazzo trousers in matte black suiting wool: plain waistband, two jetted back pockets without flaps, pressed creases, floor-length straight legs. Photorealistic e-commerce studio photo, full-length female model, neutral calm expression, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид сзади, чёрный образ из двух вещей: боди без рукавов из матового эластичного трикотажа с высоким воротником-стойкой и спинкой racerback, глубокие проймы открывают плечи и лопатки, открытая металлическая молния золотого тона по центру спины от верха воротника до пояса, у воротника на бегунке маленькая золотая подвеска-монограмма TR; заправлено в широкие брюки палаццо с высокой посадкой из матовой чёрной костюмной шерсти: гладкий пояс, два прорезных задних кармана в рамку без клапанов, заутюженные стрелки, прямые штанины в пол. Фотореалистичная студийная съёмка для карточки интернет-магазина, модель в полный рост, спокойное нейтральное выражение лица, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-tr-button*

EN:

```
Close-up detail on a ghost mannequin: front waistband of black wide-leg palazzo trousers in matte suiting wool, straight waistband with one round gold-tone button bearing a raised TR monogram at centre front, concealed fly below it, two pleats on each side of the fly with the inner one deeper, slanted side-pocket openings, the black matte stretch-jersey bodysuit tucked into the waistband above, the button and pleats centred and filling the frame. Photorealistic e-commerce studio photo, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план на невидимом манекене: передняя часть пояса чёрных широких брюк палаццо из матовой костюмной шерсти, прямой пояс с одной круглой пуговицей золотого тона с рельефной монограммой TR по центру спереди, под ней потайная застёжка, по два защипа с каждой стороны от застёжки, ближний к центру глубже, входы косых боковых карманов, сверху чёрное боди из матового эластичного трикотажа, заправленное в пояс; пуговица и защипы по центру, заполняют кадр. Фотореалистичная студийная съёмка для карточки интернет-магазина, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-back-zip*

EN:

```
Close-up detail on a ghost mannequin, upper back: black sleeveless bodysuit in dense matte stretch jersey with a high stand collar and racerback cut, deep armholes, an exposed gold-tone metal zip with fine teeth running straight down the centre back from the top of the collar, a small gold TR-monogram charm hanging from the zip pull at the collar top, smooth seamless fabric on both sides, the zip and charm centred and filling the frame. Photorealistic e-commerce studio photo, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план на невидимом манекене, верх спины: чёрное боди без рукавов из плотного матового эластичного трикотажа с высоким воротником-стойкой и спинкой racerback, глубокие проймы, открытая металлическая молния золотого тона с мелкими зубцами, идущая строго по центру спины от самого верха воротника, у воротника на бегунке маленькая золотая подвеска-монограмма TR, по бокам гладкое полотно без швов; молния и подвеска по центру, заполняют кадр. Фотореалистичная студийная съёмка для карточки интернет-магазина, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-hem-slit*

EN:

```
Close-up detail on a ghost mannequin, lower legs: hems of black wide-leg palazzo trousers in matte suiting wool, straight floor-length legs with sharp pressed front creases, one short vertical slit about 20 cm high at the front hem of each leg exactly on the crease, clean-finished slit edges, plain hem without cuffs just brushing the floor, both hems centred and filling the frame. Photorealistic e-commerce studio photo, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план на невидимом манекене, низ штанин: подолы чёрных широких брюк палаццо из матовой костюмной шерсти, прямые штанины в пол с чёткими заутюженными стрелками спереди, внизу каждой штанины спереди точно по линии стрелки один короткий вертикальный разрез высотой около 20 см, аккуратно обработанные края разреза, ровный подол без манжет едва касается пола; оба подола по центру, заполняют кадр. Фотореалистичная студийная съёмка для карточки интернет-магазина, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-neckline*

EN:

```
Close-up detail on a ghost mannequin, upper front: black sleeveless bodysuit in dense matte stretch jersey, high stand collar about 4-5 cm, cut-away halter armholes with the fabric narrowing from the fully covered chest up to the collar, shoulders completely bare, no front seams, closures or decoration, smooth matte surface, collar and armholes centred and filling the frame. Photorealistic e-commerce studio photo, seamless light warm-grey background (#E8E4DE), soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, sharp focus on fabric texture and seams, true textured black, not a flat silhouette, 85mm lens look, no props, no text, no logos except small TR hardware, ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план на невидимом манекене, верх переда: чёрное боди без рукавов из плотного матового эластичного трикотажа, высокий воротник-стойка около 4–5 см, вырезанные проймы «американка» — полотно сужается от полностью закрытой груди к воротнику, плечи полностью открыты, спереди нет швов, застёжек и декора, гладкая матовая поверхность; воротник и проймы по центру, заполняют кадр. Фотореалистичная студийная съёмка для карточки интернет-магазина, бесшовный светлый тёпло-серый фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева с лёгкой подсветкой, без жёстких теней, вертикальный кадр 3:4, резкий фокус на фактуре ткани и швах, чёрный с читаемой фактурой, не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR, сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

**Негативный промпт (EN)**

```
altered neckline, V-neck, scoop neck, folded turtleneck, straps, spaghetti straps, halter tie at the neck, added sleeves, cap sleeves, covered shoulders, cleavage, cut-outs, sheer fabric, bodysuit worn over the trousers, jumpsuit, no waistband, changed trouser length, cropped trousers, ankle length, tapered legs, skinny legs, bell flare, cuffs, missing slits, extra slits, slits on the side or back, extra buttons, button row, belt, buckles, pocket flaps, visible front zip, side zip, missing TR button, silver hardware, missing back zip, concealed back zip, brand text, lettering, logos, watermark, prints, patterns, satin shine, wrinkled or crumpled fabric, grey or washed-out black, flat crushed black silhouette, colour cast, harsh shadows, busy background, beige sunlit backdrop, props, furniture, sunglasses, hat, necklace, earrings, jewellery, bag, deformed hands, extra fingers, distorted limbs, extra legs, cropped head or feet, duplicate figure, two models in one frame, blurry, low resolution, jpeg artifacts
```

**Инструкция для режима image-to-image (EN)**

```
Keep the garments exactly as in the reference photo: black sleeveless bodysuit with high stand collar, cut-away halter armholes and racerback, exposed gold centre-back zip with small TR charm at the collar; black high-waisted wide-leg palazzo trousers with one round gold TR button, two pleats per side, slanted pockets, pressed creases, floor length, short front slit on each hem, two jetted back pockets. Do not alter cut, proportions, length, hardware, fabric or colour. Change only the photo: replace the beige sunlit backdrop with seamless light warm-grey studio background (#E8E4DE), soft diffused front-left key light with gentle fill, no sunglasses or earrings, neutral calm expression, one figure per 3:4 frame, 8K upscale with fine fabric texture and true textured black.
```

**Что по фото определить нельзя (уточнить у дизайнера)**

- Файл по пути из задания (…/looks/look-01/look-01.jpg) не существует; единственный найденный и изученный файл — /home/user/tr-rodionova/public/images/brand/looks/look-01.jpg (700×1000, композит «вид спереди + вид сзади»). Отдельных детальных кропов в папке нет — детали изучены по увеличенным фрагментам этого файла.
- Исходное фото выглядит как ИИ-рендер/коллаж (срезанные очки, полосы солнечного света, две фигуры на одном фоне): мелкие несоответствия между видами возможны.
- Разрезы сзади: на виде сзади внизу обеих штанин по линиям задних стрелок видны отчётливые вертикальные расхождения ткани (~15–20 см) с нахлёстом слоёв у подола — они выглядят как разрезы, а не как случайная складка. По каталогу (описание брюк и образа) разрезы только по переду, и исходник похож на ИИ-рендер, который мог «отзеркалить» передние разрезы, поэтому в промптах заданы только передние. Подтвердить у заказчика, есть ли разрезы на задней половинке; если есть — добавить их в back, must_keep и убрать «slits on the back» из негатива.
- Второй защип с каждой стороны читается слабо: отчётливо виден только глубокий защип у центра, переходящий в стрелку; мелкая складка ближе к карману может быть вторым защипом или складкой от мешковины кармана (руки модели в карманах). Уточнить у заказчика количество защипов.
- Кнопки по шаговому шву боди (из описания в каталоге) на фото не видны — проверить нельзя.
- Тип застёжки брюк под пуговицей TR: виден только вертикальный край гульфика; молния там или пуговицы — не видно. В промптах указана потайная застёжка без деталей.
- Шлёвки на поясе: по бокам от пуговицы симметрично видны вертикальные строчки (примерно на линии защипов), но однозначно определить, шлёвки ли это или край пояса/подзора, нельзя. В промптах шлёвки не заданы и не запрещены.
- Точный вид пуговицы TR: круглая, золотого тона, буквы TR рельефом на светлом диске; отделка (полировка/матовая/эмаль) из-за размера изображения не определяется.
- Где заканчивается молния боди — ровно у пояса брюк или ниже — скрыто брюками.
- Воротник: прямая стойка ~4–5 см; складывается ли он (хомут) — не видно. Каталожное «высокая горловина» верно, но это стойка с проймой-халтер, а не водолазка.
- Высота передних разрезов — около 20 см (по пропорциям фигуры 18–22 см), не измерена.
- Длина брюк на фото — в пол при каблуке; по каталогу длина подгоняется под обувь, так что эталонная длина без каблука неизвестна.
- Низ боди (вырез по бедру, ластовица) не виден — не описан.
- Аксессуары на фото (чёрные очки спереди, золотые серьги-кольца сзади) — не часть изделия; в генерациях исключены.

### Боди TR 01 (TR-BD-101)
Референсы: `public/images/brand/TR-BD-101/`.

**Как изделие выглядит на референсах**

- **Силуэт.** Облегающее боди «вторая кожа» без рукавов, плотно повторяет фигуру от воротника до линии трусов. Передняя панель цельная и гладкая: без вытачек, швов, складок и декора. Низ с высоким вырезом ног — линия выреза по бокам поднимается до уровня выступа тазовой кости (01.jpg).
- **Горловина.** Высокая горловина — воротник-гольф (стойка высотой примерно 6–8 см, доходит почти до подбородка), с тонким швом у основания (03.jpg, 07.jpg). На 03/07 посередине высоты воротника читается горизонтальная линия — возможно, отворот, но по фото однозначно это не определяется (см. uncertainties). От основания воротника края проймы уходят по диагонали к подмышкам — американская пройма-халтер; ключицы и плечи полностью открыты.
- **Рукава / бретели.** Без рукавов и без бретелей. Спереди — халтер/американская пройма, полотно «держится» на воротнике-гольфе; сзади тот же крой — панель спинки сужается кверху к основанию воротника (борцовка), боковые части верха спины открыты (02.jpg, 04.jpg). Плечи открыты полностью и спереди, и сзади.
- **Длина.** Длина боди — до линии трусов. Спереди высокий вырез ног (линия бикини на уровне тазовой кости), сзади — бразильское/чики-покрытие, ягодицы частично открыты (02.jpg). Ноги модели полностью открыты.
- **Спинка.** Спинка-борцовка: панель спинки сужается кверху к воротнику, плечи и боковые части верха спины открыты; на уровне лопаток панель ещё достаточно широкая (02.jpg). Строго по центру спинки — открытая металлическая молния золотого цвета, начинается у самого верха воротника и идёт вниз до поясницы (заканчивается над ягодицами, 02.jpg). На бегунке у верха воротника — плоская подвеска-монограмма TR (04.jpg, 08.jpg).
- **Застёжки.** Единственная видимая застёжка — открытая молния золотистого металла по центру спинки: металлические зубцы на виду, без планки/кармана под молнию; бегунок с лицевой плоской подвеской «TR» (слитные буквы T и R, полированное золото) у верха воротника. Кнопки по шаговому шву, заявленные в каталоге, ни на одном кадре не видны.
- **Детали.** Фурнитура — только золотистая молния и монограмма TR на бегунке, это единственный «логотип» на изделии. Нет карманов, пуговиц, драпировок, вырезов-cut-out, кантов, принтов, контрастных вставок. Солнцезащитные очки (01, 02) и золотые серьги-кольца модели (01, 02, 07, 08) — аксессуары съёмки, к изделию не относятся.
- **Ткань.** Плотный эластичный трикотаж, непросвечивающий, матовый — без глянца, на сгибах лишь мягкие световые блики (05.jpg). Поверхность с тонкой микротекстурой: на макро 05.jpg читается мелкий сетчатый/точечный рисунок (похож на пике или мелкую сетку). Драпируется упруго, крупными «структурными» волнами, без мелких заломов. Воротник выглядит гладким, рисунок резинки на кропах 03/07/08 не читается.
- **Цвет.** Чистый однотонный чёрный (#0E0E0E), без синевы и коричневых оттенков. Фурнитура — тёплое полированное золото.

**Что обязано остаться без изменений**

- Высокий воротник-гольф — та же высота и форма, доходит почти до подбородка, без изменения горловины
- Американская пройма-халтер спереди: плечи и ключицы полностью открыты, никаких бретелей, лямок и рукавов
- Спинка-борцовка: панель спинки сужается кверху к воротнику, плечи и бока верха спины открыты
- Открытая золотистая металлическая молния строго по центру спинки, от самого верха воротника до поясницы, зубцы на виду, без планки
- Маленькая плоская золотистая подвеска-монограмма TR на бегунке у верха воротника — единственный логотип, без другого брендинга
- Гладкий цельный перед без швов, застёжек, вытачек и декора
- Высокий вырез ног до уровня тазовой кости спереди и бразильское покрытие сзади
- Облегающий силуэт «вторая кожа», без складок, драпировок и свободного объёма
- Плотное матовое полотно с видимой микротекстурой, без глянца и просвечивания
- Чистый чёрный цвет #0E0E0E, фурнитура тёплого золота

**Лучшие референсы**

- front: TR-BD-101/01.jpg
- back: TR-BD-101/02.jpg
- detail zip + TR monogram (best): TR-BD-101/08.jpg
- detail zip + racerback (alternate): TR-BD-101/04.jpg
- detail collar / halter armhole: TR-BD-101/03.jpg
- detail collar / halter armhole (alternate): TR-BD-101/07.jpg
- detail fabric texture: TR-BD-101/05.jpg

**Промпты**

*front*

EN:

```
Black sleeveless bodysuit, colour #0E0E0E, dense matte stretch knit with fine micro-texture. Tall turtleneck collar reaching almost to the chin; halter-style American armholes cut from the collar base toward the underarms, shoulders and collarbones fully bare, no straps. Second-skin fit, plain seamless front, high-cut leg openings rising to the hip bone. Front view, model standing straight, arms relaxed, bare legs. Photorealistic e-commerce fashion photography, full-length female model with a neutral calm expression, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the garment centred and fully visible, sharp focus on fabric texture and seams, true black rendered with visible texture (not a flat silhouette), 85mm lens look, no props, no text, no logos other than the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Чёрное боди без рукавов, цвет #0E0E0E, плотное матовое эластичное трикотажное полотно с тонкой микротекстурой. Высокий воротник-гольф почти до подбородка; американская пройма-халтер от основания воротника к подмышкам, плечи и ключицы полностью открыты, без бретелей. Облегающий силуэт «вторая кожа», гладкий перед без швов и застёжек, высокий вырез ног до уровня тазовой кости. Вид спереди, модель стоит прямо, руки расслаблены, ноги открыты. Фотореалистичная e-commerce фэшн-съёмка, женская модель в полный рост с нейтральным спокойным выражением лица, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный рисующий свет дневной температуры спереди-слева плюс мягкая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, чистый чёрный с видимой фактурой (не плоский силуэт), оптика 85 мм, без реквизита, без текста, без логотипов кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*back*

EN:

```
Black sleeveless bodysuit, colour #0E0E0E, dense matte stretch knit. Tall turtleneck collar; racerback cut with the back panel tapering up to the collar base, shoulders and the sides of the upper back bare. Exposed gold metal zip runs centre-back from the very top of the collar down to the lower back, small flat gold TR monogram zip pull at the collar top. High-cut Brazilian rear. Back view, model standing, hair up. Photorealistic e-commerce fashion photography, full-length female model with a neutral calm expression, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the garment centred and fully visible, sharp focus on fabric texture and seams, true black rendered with visible texture (not a flat silhouette), 85mm lens look, no props, no text, no logos other than the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Чёрное боди без рукавов, цвет #0E0E0E, плотное матовое эластичное трикотажное полотно. Высокий воротник-гольф; спинка-борцовка — панель спинки сужается кверху к основанию воротника, плечи и бока верха спины открыты. Открытая золотистая металлическая молния идёт по центру спинки от самого верха воротника до поясницы, на бегунке у верха воротника маленькая плоская золотистая подвеска-монограмма TR. Высокий бразильский вырез сзади. Вид со спины, модель стоит, волосы собраны. Фотореалистичная e-commerce фэшн-съёмка, женская модель в полный рост с нейтральным спокойным выражением лица, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный рисующий свет дневной температуры спереди-слева плюс мягкая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, чистый чёрный с видимой фактурой (не плоский силуэт), оптика 85 мм, без реквизита, без текста, без логотипов кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*three-quarter*

EN:

```
Black sleeveless bodysuit, colour #0E0E0E, dense matte stretch knit. Tall turtleneck collar; halter-style American armholes leaving shoulders bare; racerback tapering to the collar. Fitted second-skin silhouette, high-cut leg openings at the hip bone. Three-quarter view turned slightly left so both the bare shoulder line and the edge of the gold centre-back zip are visible; model standing, arms relaxed, bare legs. Photorealistic e-commerce fashion photography, full-length female model with a neutral calm expression, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the garment centred and fully visible, sharp focus on fabric texture and seams, true black rendered with visible texture (not a flat silhouette), 85mm lens look, no props, no text, no logos other than the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Чёрное боди без рукавов, цвет #0E0E0E, плотное матовое эластичное трикотажное полотно. Высокий воротник-гольф; американская пройма-халтер, плечи открыты; спинка-борцовка, сужающаяся к воротнику. Облегающий силуэт «вторая кожа», высокий вырез ног до уровня тазовой кости. Ракурс в три четверти с небольшим поворотом влево, чтобы были видны линия открытого плеча и край золотистой молнии на спинке; модель стоит, руки расслаблены, ноги открыты. Фотореалистичная e-commerce фэшн-съёмка, женская модель в полный рост с нейтральным спокойным выражением лица, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный рисующий свет дневной температуры спереди-слева плюс мягкая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, чистый чёрный с видимой фактурой (не плоский силуэт), оптика 85 мм, без реквизита, без текста, без логотипов кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-zip-monogram*

EN:

```
Close-up of the back collar of a black sleeveless bodysuit, colour #0E0E0E, dense matte stretch knit. Tall turtleneck collar; exposed gold metal zip with visible metal teeth starts at the very top of the collar and runs down the centre back; a small flat polished gold TR monogram pull hangs from the slider at the collar top. Macro detail shot on a ghost-mannequin, hardware sharp. Photorealistic e-commerce fashion photography, ghost-mannequin, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the detail centred and filling the frame, sharp focus on fabric texture and seams, true black rendered with visible texture (not a flat silhouette), 85mm lens look, no props, no text, no logos other than the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план задней части воротника чёрного боди без рукавов, цвет #0E0E0E, плотное матовое эластичное трикотажное полотно. Высокий воротник-гольф; открытая золотистая металлическая молния с видимыми металлическими зубцами начинается у самого верха воротника и идёт вниз по центру спинки; на бегунке у верха воротника висит маленькая плоская полированная золотистая подвеска-монограмма TR. Макросъёмка детали на манекене-невидимке, фурнитура резкая. Фотореалистичная e-commerce фэшн-съёмка, манекен-невидимка, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный рисующий свет дневной температуры спереди-слева плюс мягкая подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и заполняет кадр, резкий фокус на фактуре ткани и швах, чистый чёрный с видимой фактурой (не плоский силуэт), оптика 85 мм, без реквизита, без текста, без логотипов кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-collar*

EN:

```
Close-up of the front neckline of a black sleeveless bodysuit, colour #0E0E0E, dense matte stretch knit. Tall turtleneck collar reaching almost to the chin, with a fine seam at its base; halter-style American armhole edges run diagonally from the collar base toward the underarms, shoulders fully bare, no straps. Smooth plain front panel. Macro detail shot on a ghost-mannequin, texture sharp. Photorealistic e-commerce fashion photography, ghost-mannequin, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the detail centred and filling the frame, sharp focus on fabric texture and seams, true black rendered with visible texture (not a flat silhouette), 85mm lens look, no props, no text, no logos other than the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план горловины спереди чёрного боди без рукавов, цвет #0E0E0E, плотное матовое эластичное трикотажное полотно. Высокий воротник-гольф почти до подбородка, с тонким швом у основания; края американской проймы-халтер идут по диагонали от основания воротника к подмышкам, плечи полностью открыты, без бретелей. Гладкая передняя панель. Макросъёмка детали на манекене-невидимке, фактура резкая. Фотореалистичная e-commerce фэшн-съёмка, манекен-невидимка, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный рисующий свет дневной температуры спереди-слева плюс мягкая подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и заполняет кадр, резкий фокус на фактуре ткани и швах, чистый чёрный с видимой фактурой (не плоский силуэт), оптика 85 мм, без реквизита, без текста, без логотипов кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-fabric*

EN:

```
Macro close-up of the fabric of a black bodysuit, colour #0E0E0E: dense, opaque, matte stretch knit with a fine micro-textured surface (tiny grid-like, pique-style pattern), folded in large soft structured waves so the subtle texture catches the light; matte, no gloss, only soft light on the fold ridges, no pilling. Flat-lay fabric detail, no hardware, no seams, no logos. Photorealistic e-commerce fashion photography, flat-lay, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the detail centred and filling the frame, sharp focus on fabric texture, true black rendered with visible texture (not a flat silhouette), 85mm lens look, no props, no text. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Макросъёмка полотна чёрного боди, цвет #0E0E0E: плотный, непросвечивающий, матовый эластичный трикотаж с тонкой микротекстурой поверхности (мелкий сетчатый, пике-подобный рисунок), уложен крупными мягкими структурными волнами, чтобы деликатная фактура ловила свет; матовый, без глянца, лишь мягкий свет на гребнях складок, без катышков. Фактурный план ткани (flat-lay), без фурнитуры, без швов, без логотипов. Фотореалистичная e-commerce фэшн-съёмка, flat-lay, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный рисующий свет дневной температуры спереди-слева плюс мягкая подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и заполняет кадр, резкий фокус на фактуре ткани, чистый чёрный с видимой фактурой (не плоский силуэт), оптика 85 мм, без реквизита, без текста. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

**Негативный промпт (EN)**

```
altered neckline, low neckline, V-neck, scoop neck, crew neck, missing turtleneck, shortened collar, added sleeves, added shoulder straps, spaghetti straps, covered shoulders, off-shoulder band, added shorts or trouser legs, changed leg cut, lowered leg line, boy-short bottom, front zip, front buttons, extra buttons, extra zips, silver zip, hidden zip, zip stopping at the shoulder blades, zip missing, missing TR pull, oversized logo, brand text, lettering, prints, patterns, stripes, glossy latex, satin shine, sheer fabric, see-through, mesh panels, lace, cut-outs, belt, jewellery, sunglasses, earrings, props, text, watermark, colour cast, navy, brown, grey fabric, wrinkles, pilling, flat black silhouette without texture, deformed hands, extra fingers, distorted limbs, extra arms, asymmetrical body, bad anatomy, duplicate model, multiple models, blurry, low resolution, jpeg artifacts, harsh shadows, coloured background, outdoor scene
```

**Инструкция для режима image-to-image (EN)**

```
Treat the reference photo as the exact source of the garment. Keep the black bodysuit TR 01 unchanged: tall turtleneck collar, halter-style American armholes with fully bare shoulders, sleeveless racerback tapering to the collar, exposed gold centre-back zip from collar top to lower back with the small flat gold TR monogram pull, high-cut leg line, dense matte micro-textured knit. Do not reshape, add or remove any garment element. Change only: seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key light from the front-left with gentle fill, remove sunglasses and earrings, full-length female model with a neutral calm expression, 3:4 vertical frame, 85mm look, upscale to ultra-high resolution 8K with fine fabric detail.
```

**Что по фото определить нельзя (уточнить у дизайнера)**

- Отворот воротника: на 03/07 посередине высоты воротника читается горизонтальная линия — это может быть отворот (отложной гольф) или просто залом от наклона шеи; на 04/08 сзади воротник выглядит одинарной стойкой, молния доходит до его верхнего края. В промптах воротник описан как «высокий гольф» без указания отворота — уточнить у дизайнера, складывается ли воротник и какова его высота.
- Кнопки по шаговому шву (из каталожного описания) на фото не видны: ластовица и низ изделия не показаны ни на одном кадре. В промпты эта деталь не включена, чтобы генератор её не выдумал; подтвердить у дизайнера.
- Нижняя точка молнии: на 02.jpg молния доходит до поясницы (заканчивается над ягодицами), но точный конец частично скрыт позой — уточнить, разъёмная ли молния и где именно она заканчивается.
- Калибр молнии: на макро 08.jpg зубцы выглядят как у стандартной металлической молнии среднего размера, на 02.jpg из-за масштаба — тоньше; точный размер по фото не определить.
- Воротник: отдельная деталь из резинки (рибана) или из основного полотна — на кропах 03/07/08 он выглядит гладким, рисунок резинки не читается.
- Степень покрытия сзади (бразильское или чики) видна лишь приблизительно по 02.jpg.
- Внутренняя конструкция (подкладка, чашки, ластовица) не видна ни на одном кадре.
- Точная фактура полотна: на 05.jpg читается мелкая сетчатая/точечная микротекстура (похожа на пике или мелкую сетку), но кроп низкого разрешения — возможно, это шум изображения, а не рисунок полотна.
- Солнцезащитные очки (01, 02) и золотые серьги-кольца (01, 02, 07, 08) на модели — аксессуары съёмки, не часть изделия; в img2img указано их убрать.
- Фото — небольшие кропы с эскизных листов (возможно, визуализации): реальный оттенок золота фурнитуры и глубина чёрного могут отличаться от #0E0E0E.

### Брюки TR Palazzo (TR-TR-101)
Референсы: `public/images/brand/TR-TR-101/`.

**Как изделие выглядит на референсах**

- **Силуэт.** Широкие прямые брюки-палаццо с высокой посадкой. От пояса к бедру — глубокие мягкие складки (по фото 01 — одна глубокая складка с каждой стороны от гульфика, переходящая в стрелку; возможна вторая, меньшая, ближе к карману), ниже штанина падает ровным широким прямым столбом без зауживания и расширения к низу. По центру каждой штанины — чёткая заутюженная стрелка спереди и сзади. Талия узкая, пояс неширокий.
- **Горловина.** Не применимо (брюки). На фото надеты с отдельным чёрным топом-халтером: высокая горловина-стойка, плечи полностью открыты (фото 01), сзади открытые бока и центральная планка с золотой молнией и подвеской TR (фото 02) — топ в артикул не входит.
- **Рукава / бретели.** Не применимо (брюки).
- **Длина.** В пол: низ штанины доходит до пола и почти полностью закрывает обувь; из переднего разреза видны только носы чёрных остроносых туфель-лодочек на каблуке. Сзади низ лежит на полу (фото 02).
- **Спинка.** Спинка чистая, без складок. Узкий гладкий пояс без видимых шлёвок. Два горизонтальных прорезных кармана «в рамку» (с двумя обтачками) на задних половинках, по одному с каждой стороны, без видимых пуговиц и клапанов. Стрелки по центру задней половинки штанин. По низу каждой задней стрелки — вертикальный разрез: на фото 02 у обеих штанин видно расхождение краёв с просветом пола; разрезы висят почти сомкнутыми, их длина по фото не читается. Боковые карманы видны в боковом шве на уровне бедра (рука модели в кармане).
- **Застёжки.** Единственная видимая фурнитура — одна круглая металлическая пуговица золотого цвета с гравировкой монограммы «TR» по центру переда на поясе. Под пуговицей — скрытая застёжка (потайной гульфик, по фото вертикальная линия планки; молния или крючок не видны). Другой фурнитуры на брюках нет.
- **Детали.** Глубокие складки (защипы) от пояса с обеих сторон от гульфика; косые боковые карманы спереди на уровне бедра; заутюженные стрелки по всей длине штанин; вертикальные разрезы по низу каждой штанины вдоль стрелки — спереди (фото 01, 03) и сзади (фото 02). Передний разрез с аккуратно обработанными краями раскрывается при шаге и показывает щиколотку и нижнюю часть голени (фото 03), длина ориентировочно 20–30 см; задние разрезы на фото 02 висят почти сомкнутыми. Два прорезных кармана в рамку сзади.
- **Ткань.** Матовая, плотная, хорошо держащая форму костюмная шерсть; без блеска, без видимой фактуры рубчика; ткань падает тяжёлым ровным столбом, стрелки держатся чётко, складки у пояса объёмные, но не пышные. Выглядит как гладкая тонкая шерстяная костюмка с небольшой эластичностью.
- **Цвет.** Глубокий чёрный (#0E0E0E), однотонный, без контрастной отстрочки. Единственный цветовой акцент — золотая пуговица TR на поясе.

**Что обязано остаться без изменений**

- Широкий прямой силуэт палаццо с высокой посадкой — без зауживания, без клёша, без укорачивания; длина в пол, обувь закрыта, видны только носы туфель.
- Одна круглая золотая пуговица с монограммой TR строго по центру переда на узком поясе — не добавлять вторую пуговицу, пряжку, ремень или крупный логотип.
- Скрытая застёжка-гульфик под пуговицей без видимой молнии и без накладных планок.
- Глубокие складки от пояса с обеих сторон от гульфика (по одной-две на сторону), объёмные, мягко уходящие в стрелку.
- Косые боковые карманы спереди на уровне бедра; сзади — два горизонтальных прорезных кармана в рамку без пуговиц и клапанов.
- Чёткие заутюженные стрелки по центру передней и задней половинки каждой штанины на всю длину.
- Вертикальные разрезы по низу каждой штанины вдоль стрелки — и спереди, и сзади (фото 02), с чистыми обработанными краями; без разрезов в боковых швах; передний разрез заметной длины — при шаге раскрывается до нижней трети голени.
- Пояс узкий, гладкий, без видимых шлёвок, без ремня.
- Ткань — матовая чёрная костюмная шерсть, плотная и держащая форму: без блеска, без атласа, без денима, без видимой клетки или полоски.
- Цвет — глубокий чёрный #0E0E0E, однотонный; никакой контрастной отстрочки, принтов, надписей.

**Лучшие референсы**

- TR-TR-101/01.jpg — front view, pleats, waistband and TR button, front hem slits (best reference for front and the button detail)
- TR-TR-101/02.jpg — back view, jetted back pockets, creases, side pockets, back hem slits (best reference for back)
- TR-TR-101/03.jpg — front hem slit close-up (best reference for the slit detail and length)

**Промпты**

*front*

EN:

```
Black wide-leg palazzo trousers in matte suiting wool: high rise, narrow plain waistband with a single round gold TR-monogram button at centre front, concealed fly below it, deep pleats either side of the fly, slanted side pockets, sharp pressed front creases down wide straight floor-length legs, front hem slits along the creases revealing the toes of black pointed pumps; styled with a plain black high-neck halter top tucked in. Photorealistic e-commerce fashion photography, full-length female model facing camera, neutral calm expression, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully in frame, sharp focus on fabric texture and seams, true black with visible weave, 85mm lens look, no props, no text, no logos except the small TR hardware. 8K ultra-high resolution, fine fabric detail.
```

RU:

```
Чёрные широкие брюки-палаццо из матовой костюмной шерсти: высокая посадка, узкий гладкий пояс с одной круглой золотой пуговицей с монограммой TR по центру переда, под ней скрытый гульфик, глубокие складки с обеих сторон от гульфика, косые боковые карманы, чёткие заутюженные передние стрелки по широким прямым штанинам в пол, разрезы по низу переда вдоль стрелок, из которых видны носы чёрных остроносых лодочек; надеты с простым чёрным топом-халтером с высокой горловиной, заправленным в брюки. Фотореалистичная e-commerce фэшн-съёмка, модель в полный рост лицом к камере, спокойное нейтральное выражение лица, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева плюс деликатная подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, глубокий чёрный с читаемым переплетением, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. 8K, сверхвысокое разрешение, тонкая детализация ткани.
```

*back*

EN:

```
Back view of black wide-leg palazzo trousers in matte suiting wool: high rise, narrow plain waistband with no visible belt loops, two horizontal jetted double-welt pockets without buttons or flaps, slanted side pockets visible at the hip seams, sharp pressed creases down the centre of each wide straight floor-length leg, a short vertical slit along each back crease at the hem hanging closed; styled with a plain black halter top tucked in. Photorealistic e-commerce fashion photography, full-length female model seen from behind, standing calmly, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully in frame, sharp focus on fabric texture and seams, true black with visible weave, 85mm lens look, no props, no text, no logos except the small TR hardware. 8K ultra-high resolution, fine fabric detail.
```

RU:

```
Вид сзади: чёрные широкие брюки-палаццо из матовой костюмной шерсти, высокая посадка, узкий гладкий пояс без видимых шлёвок, два горизонтальных прорезных кармана в рамку без пуговиц и клапанов, боковые карманы видны в швах на бёдрах, чёткие заутюженные стрелки по центру каждой широкой прямой штанины в пол, по низу каждой задней стрелки короткий вертикальный разрез, висящий сомкнутым; надеты с простым чёрным топом-халтером, заправленным в брюки. Фотореалистичная e-commerce фэшн-съёмка, модель в полный рост спиной к камере, спокойная поза, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева плюс деликатная подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, глубокий чёрный с читаемым переплетением, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. 8K, сверхвысокое разрешение, тонкая детализация ткани.
```

*three-quarter*

EN:

```
Three-quarter view of black wide-leg palazzo trousers in matte suiting wool: high rise, narrow plain waistband with a single round gold TR-monogram button at centre front, concealed fly, deep pleats either side of the fly, one hand in a slanted side pocket, sharp pressed creases down wide straight floor-length legs, front hem slits along the creases showing the toe of black pointed pumps; styled with a plain black high-neck halter top tucked in. Photorealistic e-commerce fashion photography, full-length female model turned three-quarter to camera, neutral calm expression, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully in frame, sharp focus on fabric texture and seams, true black with visible weave, 85mm lens look, no props, no text, no logos except the small TR hardware. 8K ultra-high resolution, fine fabric detail.
```

RU:

```
Ракурс три четверти: чёрные широкие брюки-палаццо из матовой костюмной шерсти, высокая посадка, узкий гладкий пояс с одной круглой золотой пуговицей с монограммой TR по центру переда, скрытый гульфик, глубокие складки с обеих сторон от гульфика, одна рука в косом боковом кармане, чёткие заутюженные стрелки по широким прямым штанинам в пол, разрезы по низу переда вдоль стрелок, из которых виден нос чёрной остроносой лодочки; надеты с простым чёрным топом-халтером с высокой горловиной, заправленным в брюки. Фотореалистичная e-commerce фэшн-съёмка, модель в полный рост, развёрнута к камере на три четверти, спокойное нейтральное выражение лица, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева плюс деликатная подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, глубокий чёрный с читаемым переплетением, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. 8K, сверхвысокое разрешение, тонкая детализация ткани.
```

*detail-tr-button*

EN:

```
Close-up detail of the waistband of black wide-leg trousers in matte suiting wool: narrow high-rise waistband with a single round polished gold button engraved with the TR monogram at centre front, concealed fly placket below it with no visible zip, deep pleats falling from the waistband on each side, slanted side pocket openings, crisp seams and fine matte wool weave clearly visible. Photorealistic e-commerce fashion photography, macro product shot on a ghost mannequin or model torso, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, detail centred and fully in frame, sharp focus on fabric texture and seams, true black with visible weave, 85mm lens look, no props, no text, no logos except the small TR hardware. 8K ultra-high resolution, fine fabric detail.
```

RU:

```
Крупный план пояса чёрных широких брюк из матовой костюмной шерсти: узкий пояс высокой посадки с одной круглой полированной золотой пуговицей с гравировкой монограммы TR по центру переда, под ней скрытая планка гульфика без видимой молнии, глубокие складки, уходящие от пояса с обеих сторон, входы косых боковых карманов, чёткие швы и тонкое матовое шерстяное переплетение хорошо читаются. Фотореалистичная e-commerce фэшн-съёмка, макро-кадр изделия на невидимом манекене или торсе модели, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева плюс деликатная подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, глубокий чёрный с читаемым переплетением, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. 8K, сверхвысокое разрешение, тонкая детализация ткани.
```

*detail-hem-slit*

EN:

```
Close-up detail of the hem of black wide-leg trousers in matte suiting wool: a clean vertical slit along the pressed front crease of one leg, roughly 20-30 cm long and reaching the lower shin, neatly finished edges, opening mid-step to reveal the ankle and a black patent pointed-toe pump; floor-length straight wide hem, matte wool weave and crisp crease clearly visible, no slit on the side seams. Photorealistic e-commerce fashion photography, lower-leg product shot on a female model, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, detail centred and fully in frame, sharp focus on fabric texture and seams, true black with visible weave, 85mm lens look, no props, no text, no logos except the small TR hardware. 8K ultra-high resolution, fine fabric detail.
```

RU:

```
Крупный план низа чёрных широких брюк из матовой костюмной шерсти: аккуратный вертикальный разрез вдоль заутюженной передней стрелки одной штанины, длиной примерно 20–30 см, до нижней трети голени, с чисто обработанными краями, раскрывающийся в шаге и показывающий щиколотку и чёрную лаковую остроносую лодочку; прямой широкий низ в пол, матовое шерстяное переплетение и чёткая стрелка хорошо читаются, разрезов в боковых швах нет. Фотореалистичная e-commerce фэшн-съёмка, кадр нижней части ног модели, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева плюс деликатная подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, глубокий чёрный с читаемым переплетением, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. 8K, сверхвысокое разрешение, тонкая детализация ткани.
```

*detail-back-pockets*

EN:

```
Close-up detail of the back of black wide-leg trousers in matte suiting wool: narrow plain waistband with no belt loops, two horizontal jetted double-welt pockets, one on each back panel, without buttons or flaps, smooth seat, pressed back creases beginning below the pockets, fine matte wool weave and clean topstitch-free seams clearly visible. Photorealistic e-commerce fashion photography, macro product shot on a ghost mannequin or model from behind, seamless light warm-grey studio background (#E8E4DE), soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, detail centred and fully in frame, sharp focus on fabric texture and seams, true black with visible weave, 85mm lens look, no props, no text, no logos except the small TR hardware. 8K ultra-high resolution, fine fabric detail.
```

RU:

```
Крупный план задней части чёрных широких брюк из матовой костюмной шерсти: узкий гладкий пояс без шлёвок, два горизонтальных прорезных кармана в рамку, по одному на каждой задней половинке, без пуговиц и клапанов, гладкая область сидения, заутюженные задние стрелки, начинающиеся ниже карманов, тонкое матовое шерстяное переплетение и чистые швы без отстрочки хорошо читаются. Фотореалистичная e-commerce фэшн-съёмка, макро-кадр изделия на невидимом манекене или модели со спины, бесшовный светлый тёпло-серый студийный фон (#E8E4DE), мягкий рассеянный дневной рисующий свет спереди-слева плюс деликатная подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, глубокий чёрный с читаемым переплетением, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. 8K, сверхвысокое разрешение, тонкая детализация ткани.
```

**Негативный промпт (EN)**

```
tapered legs, skinny fit, cropped or ankle length, flared or bootcut hem, low rise, wide or corset waistband, belt, belt loops, visible zip, second button, extra buttons, buckles, snaps, flap pockets, patch pockets, cargo pockets, side-seam slits, missing hem slits, slits longer than the shin, no pleats, flat-front trousers, pintuck rows, cuffs or turn-ups, shiny satin or silk sheen, denim, leather, pinstripe, check, glossy fabric, dark grey or navy instead of black, flat black silhouette without texture, contrast topstitching, visible brand text, large logo, watermark, text, lettering, props, chair, flowers, coloured or dark background, outdoor scene, harsh shadows, mixed warm-cool lighting, wide-angle distortion, deformed hands, extra fingers, extra limbs, bent or deformed legs, cropped feet cut off, jewellery, sunglasses, visible face from reference photo, blurry, low resolution, noise, oversaturation, HDR look, cartoon, illustration, painting, 3D render
```

**Инструкция для режима image-to-image (EN)**

```
Use the reference photo as the exact garment source. Keep unchanged: wide straight palazzo silhouette and floor length, high rise with narrow plain waistband, the single round gold TR-monogram button at centre front, concealed fly, deep pleats on each side, slanted side pockets, two jetted back pockets, pressed front and back creases, and the hem slits along both front and back creases with their length. Keep the fabric as matte black suiting wool with visible weave. Change only: seamless light warm-grey studio backdrop (#E8E4DE), soft diffused daylight-balanced key from front-left with gentle fill, no harsh shadows, no sunglasses, a full-length female model with a neutral expression in a plain black halter top, 3:4 frame, 85mm look, sharper fabric texture, 8K upscale.
```

**Что по фото определить нельзя (уточнить у дизайнера)**

- Каталог пишет «защипы», но на фото 01 это глубокие объёмные складки от пояса (не мелкие защипы); точное количество складок на каждую сторону (одна или две) по кропу не читается — уточнить по лекалу.
- Тип застёжки под пуговицей TR не виден: на фото только вертикальная линия скрытой планки; молния это или крючок — не определить.
- Шлёвки на поясе не видны ни спереди (01), ни сзади (02); вероятно, их нет — подтвердить, в промптах пояс описан как гладкий без шлёвок.
- Задние карманы: видны два прорезных кармана в рамку, но наличие пуговиц, петель или клапанов на них по фото не подтвердить (на фото их нет).
- Задние разрезы: на фото 02 у низа обеих штанин по центру задней половинки видно расхождение краёв с просветом пола — разрезы по задней стрелке есть, но их длина и совпадает ли она с передними по фото не определяется; взять из техописания.
- Длина переднего разреза: стоя (фото 01) видно только нижние ~17–20 см раскрытия, в шаге (фото 03) разрез уходит до нижней трети голени — ориентировочно 20–30 см; точную величину взять из техописания.
- Чёрный топ-халтер с высокой горловиной и золотой молнией со подвеской TR на спине (фото 02) — отдельное изделие, не часть артикула TR-TR-101; молния и подвеска TR на спине относятся к топу, а не к брюкам.
- Ширина пояса и высота посадки в сантиметрах по фото не измерить; визуально пояс неширокий (около 3–4 см), посадка на талии.
- Состав (96% шерсть, 4% эластан) по фото проверить нельзя; визуально ткань матовая и плотная, соответствует костюмной шерсти.
- Подкладка, внутренняя обработка, наличие потайных карманов — не видны.
- На фото модель в солнцезащитных очках и серёжках, с проработанным освещением с жёсткой тенью — это стилизация референса, не свойство изделия; в генерациях не переносить.

### Юбка TR 01 (TR-SK-101)
Референсы: `public/images/brand/TR-SK-101/`.

**Как изделие выглядит на референсах**

- **Силуэт.** Юбка-трапеция (А-силуэт) мини с высокой посадкой: от широкого прямого притачного пояса полотно ровно расширяется к низу, без складок, сборок и драпировок; низ прямой. Спереди одна асимметричная диагональная линия в духе запаха: от нижнего края пластины TR (её правого в кадре угла) она уходит пологой, почти прямой диагональю вниз к левому бедру модели (в кадре — вправо), так что между поясом и этой линией остаётся узкий треугольный участок. Читается ли линия как свободный край верхнего полотна или как шов, по фото не определить. Ближе к низу у левого бока переда — короткий прямой разрез, сквозь который видна кожа (второго слоя ткани за разрезом нет).
- **Горловина.** Не применимо — юбка, горловины нет.
- **Рукава / бретели.** Не применимо — юбка; рукавов и бретелей нет.
- **Длина.** Мини. На всех кадрах только юбка (кроп по низу), ног модели не видно; под краем на кадре 04 виден участок кожи. По пропорциям (ширина по низу примерно равна длине) низ приходится ориентировочно на верхнюю–среднюю треть бедра. Пояс по пропорциям около 4–5 см.
- **Спинка.** Спинка гладкая, без видимых вытачек, карманов и шлицы. Такой же широкий прямой пояс. По центру спинки потайная молния: зубцы и тесьма не видны, на верхнем крае пояса — маленький круглый золотистый бегунок, с которого свисает узкий прямоугольный золотистый язычок-подвеска с мелкой гравировкой TR. От молнии до низа идёт ровный заутюженный центральный шов спинки.
- **Застёжки.** Единственная застёжка — потайная молния по центру спинки с фирменным золотистым язычком TR. Спереди застёжек нет: квадратная золотистая рамка с монограммой TR на поясе читается как плоская декоративная пластина (без шпенька, ремешка и отверстий); диагональная деталь зафиксирована в поясе. Пуговиц, кнопок, крючков в кадре нет.
- **Детали.** 1) Фирменная пластина-«пряжка»: тонкая квадратная рамка полированного тёплого жёлто-золотистого металла, внутри переплетённые засечковые буквы T и R (T слева и выше, её перекладина сверху; R справа и ниже, её стойка накладывается на ножку T, ножка R уходит вниз-вправо; буквы почти касаются рамки сверху и снизу), сквозь рамку видна чёрная ткань; посажена плоско по центру переда пояса, по высоте примерно равна поясу. 2) Диагональная линия начинается у нижнего края пластины (её правого в кадре угла) и идёт вниз к левому бедру модели. 3) Короткий прямой разрез по низу у левого бока переда (ориентировочно 1/5–1/4 длины юбки): узкий V-образный просвет, расширяющийся к низу, сквозь него видна кожа; над разрезом линия шва/края продолжается вверх; края гладкие, обтачные, без отстрочки. 4) Язычок молнии сзади: узкий вертикальный прямоугольник, золотистый, с мелкой гравировкой TR, висит на маленьком круглом бегунке. Карманов, шлёвок, отстрочек, пуговиц нет.
- **Ткань.** Плотная костюмная шерсть: матовая, без блеска, с мелким равномерным зернистым (крепоподобным, «галечным») рельефом поверхности — на кадре 03 зерно читается отчётливо; гладкого сукна с ворсом нет. Хорошо держит форму трапеции, не драпируется и не мнётся, пояс жёсткий (дублированный). Края разреза и низ гладкие, обтачные, без видимой отстрочки. Эластичность (4% эластана) визуально не читается.
- **Цвет.** Глубокий чёрный (#0E0E0E) с видимой фактурой шерсти, не «провал» в плоский силуэт. Фурнитура (пластина TR и язычок молнии) — полированный тёплый жёлто-золотистый металл, не серебро.

**Что обязано остаться без изменений**

- Силуэт: трапеция мини с высокой посадкой, ровное расширение от пояса к прямому низу, без складок, сборок и драпировок.
- Широкий прямой притачной пояс (примерно 4–5 см) одинаковой ширины спереди и сзади, без шлёвок.
- Одна небольшая квадратная золотистая рамка-пластина с монограммой TR по центру пояса спереди, плоская, по высоте примерно равна поясу; через рамку видна ткань.
- Одна пологая диагональная линия от нижнего края пластины вниз к левому бедру модели (в кадре — вправо); между поясом и линией — узкий треугольный участок; других линий, швов и слоёв спереди не видно.
- Короткий прямой разрез по низу у левого бока переда (в кадре справа) — не по центру переда и не на спинке; сквозь разрез видна кожа, второго слоя ткани за ним нет; длина около 1/5–1/4 юбки.
- Спинка гладкая: потайная молния по центру с маленьким круглым бегунком и золотистым прямоугольным язычком TR на верхнем крае пояса, ровный центральный шов до низа, без шлицы и вытачек.
- Ткань: плотная матовая костюмная шерсть с мелким зернистым (крепоподобным) рельефом, без блеска, без эффекта атласа, кожи, трикотажа или гладкого сукна с ворсом.
- Цвет — глубокий чёрный #0E0E0E с видимой фактурой; вся фурнитура жёлто-золотистая, не серебряная.
- Никаких добавленных элементов: карманов, пуговиц, второй пряжки, ремня, отстрочки, надписей, принтов.

**Лучшие референсы**

- TR-SK-101/01.jpg — перед: общий вид, пластина TR, диагональная линия, положение разреза (в кадре справа внизу)
- TR-SK-101/02.jpg — спинка: потайная молния, круглый бегунок и язычок TR, центральный шов
- TR-SK-101/03.jpg — деталь: пластина-«пряжка» TR на поясе (форма рамки, переплетение букв, зернистая фактура ткани)
- TR-SK-101/04.jpg — деталь: разрез по низу у левого бока переда, сквозь него видна кожа

**Промпты**

*front*

EN:

```
Front view: black high-waisted A-line mini skirt in dense matte suiting wool with fine pebbled grain, wide straight waistband, small square open-frame gold-tone TR monogram plaque at centre front, one shallow diagonal line from under the plaque down to the wearer's left hip with a narrow triangular panel above it, short straight slit at the hem on the wearer's left showing bare skin, plain fitted cream top tucked in. Photorealistic e-commerce fashion photography, full-length female model facing camera, neutral expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид спереди: чёрная юбка-трапеция мини с высокой посадкой из плотной матовой костюмной шерсти с мелким зернистым рельефом, широкий прямой пояс, небольшая квадратная золотистая рамка-пластина с монограммой TR по центру пояса спереди, одна пологая диагональная линия из-под пластины вниз к левому бедру модели с узким треугольным участком над ней, короткий прямой разрез по низу у левого бока модели, сквозь который видна кожа, простой облегающий кремовый топ, заправленный в юбку. Фотореалистичная e-commerce фэшн-съёмка, модель в полный рост лицом к камере, нейтральное выражение, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди-слева плюс деликатная заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, чёрный цвет с видимой фактурой, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*back*

EN:

```
Back view: black high-waisted A-line mini skirt in dense matte suiting wool with fine pebbled grain, wide straight waistband, smooth back, no darts, pockets or vent, concealed centre-back zip with only a small round gold-tone slider and rectangular TR tag pull at the top edge of the waistband, plain pressed centre-back seam from the zip to the straight hem, plain fitted cream top tucked in. Photorealistic e-commerce fashion photography, full-length female model standing with her back to the camera, neutral expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид сзади: чёрная юбка-трапеция мини с высокой посадкой из плотной матовой костюмной шерсти с мелким зернистым рельефом, широкий прямой пояс, гладкая спинка, без вытачек, карманов и шлицы, потайная молния по центру спинки — видны только маленький круглый золотистый бегунок и прямоугольный язычок TR на верхнем крае пояса, ровный заутюженный центральный шов спинки от молнии до прямого низа, простой облегающий кремовый топ, заправленный в юбку. Фотореалистичная e-commerce фэшн-съёмка, модель в полный рост спиной к камере, нейтральное выражение, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди-слева плюс деликатная заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, чёрный цвет с видимой фактурой, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*three-quarter*

EN:

```
Three-quarter view from the wearer's left: black high-waisted A-line mini skirt in dense matte suiting wool with fine pebbled grain, wide straight waistband, square gold-tone TR plaque at centre front, one shallow diagonal line from under the plaque down to the left hip, narrow triangular panel above it, short straight slit at the hem on the left showing bare skin, plain fitted cream top tucked in. Photorealistic e-commerce fashion photography, full-length female model in three-quarter pose, neutral expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Ракурс три четверти с левой стороны модели: чёрная юбка-трапеция мини с высокой посадкой из плотной матовой костюмной шерсти с мелким зернистым рельефом, широкий прямой пояс, квадратная золотистая пластина TR по центру пояса спереди, одна пологая диагональная линия из-под пластины вниз к левому бедру, узкий треугольный участок над ней, короткий прямой разрез по низу слева, сквозь который видна кожа, простой облегающий кремовый топ, заправленный в юбку. Фотореалистичная e-commerce фэшн-съёмка, модель в полный рост в ракурсе три четверти, нейтральное выражение, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди-слева плюс деликатная заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкий фокус на фактуре ткани и швах, чёрный цвет с видимой фактурой, оптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-TR-plaque*

EN:

```
Macro detail of the waistband at centre front: small thin square open frame of polished yellow-gold-tone metal with interlocked serif letters T and R inside, T higher left, R lower right, black matte suiting wool with fine pebbled grain visible through the frame, plaque mounted flat on the wide black waistband and about as tall as it, the diagonal line from under the plaque down toward the wearer's left hip, clean seams. Photorealistic e-commerce product photography, skirt worn by a model, tight crop, no face, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, hardware centred and sharply focused, true black with visible texture, 85mm macro lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Макродеталь пояса по центру переда: небольшая тонкая квадратная рамка из полированного жёлто-золотистого металла с переплетёнными засечковыми буквами T и R внутри, T выше слева, R ниже справа, сквозь рамку видна чёрная матовая костюмная шерсть с мелким зернистым рельефом, пластина посажена плоско на широкий чёрный пояс и примерно равна ему по высоте, из-под пластины вниз к левому бедру модели уходит диагональная линия, чистые швы. Фотореалистичная предметная e-commerce съёмка, юбка на модели, крупный план, без лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди-слева плюс деликатная заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, фурнитура по центру кадра и в резком фокусе, чёрный цвет с видимой фактурой, макрооптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-slit*

EN:

```
Close-up of the hem near the wearer's left side front: short straight slit forming a narrow V-shaped opening that widens toward the hem, bare skin visible through it and no second fabric layer behind, both edges clean and flat-finished without topstitching, the seam line continuing straight up above the slit, straight hem, dense matte black suiting wool with fine pebbled grain. Photorealistic e-commerce product photography, skirt worn by a model, lower-body crop, no face, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, slit centred and sharply focused, true black with visible texture, 85mm lens look, no props, no text, no logos. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план низа юбки у левого бока переда: короткий прямой разрез, образующий узкий V-образный просвет, расширяющийся к низу, сквозь него видна кожа, второго слоя ткани за ним нет, оба края гладкие, обтачные, без отстрочки, линия шва продолжается ровно вверх над разрезом, прямой низ, плотная матовая чёрная костюмная шерсть с мелким зернистым рельефом. Фотореалистичная предметная e-commerce съёмка, юбка на модели, кадрирование по низу корпуса, без лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди-слева плюс деликатная заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, разрез по центру кадра и в резком фокусе, чёрный цвет с видимой фактурой, оптика 85 мм, без реквизита, без текста, без логотипов. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-back-zip*

EN:

```
Close-up of the centre-back waistband: concealed zip with no teeth or tape visible, a small round gold-tone slider at the top edge of the wide black waistband with a small elongated rectangular polished gold-tone tag pull hanging from it, a tiny engraved TR monogram on the tag, plain pressed centre-back seam running straight down below, dense matte black suiting wool with fine pebbled grain. Photorealistic e-commerce product photography, skirt worn by a model, tight crop, no face, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, hardware centred and sharply focused, true black with visible texture, 85mm macro lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план пояса по центру спинки: потайная молния, зубцы и тесьма не видны, на верхнем крае широкого чёрного пояса маленький круглый золотистый бегунок, с которого свисает небольшой удлинённый прямоугольный полированный золотистый язычок, на язычке мелкая гравировка TR, ниже — ровный заутюженный центральный шов спинки, плотная матовая чёрная костюмная шерсть с мелким зернистым рельефом. Фотореалистичная предметная e-commerce съёмка, юбка на модели, крупный план, без лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди-слева плюс деликатная заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, фурнитура по центру кадра и в резком фокусе, чёрный цвет с видимой фактурой, макрооптика 85 мм, без реквизита, без текста, без логотипов кроме мелкой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

**Негативный промпт (EN)**

```
changed silhouette, pencil skirt, pleated skirt, tiered or ruffled skirt, midi or maxi length, longer or shorter hem, uneven or curved hem, added pleats, gathers, draping or wrinkles, added pockets, belt loops, belt, buttons, snaps, extra buckles or double hardware, oversized plaque, silver or black hardware, brand text or lettering, printed pattern, shiny satin, leather, denim or knit look, smooth felted or brushed wool surface, flat black silhouette without texture, slit at centre front or on the back, second fabric layer visible inside the slit, back vent, front zip, exposed zip teeth, wrap diagonal on the wrong side, extra seams or panels on the front, printed or patterned top, deformed hands, extra fingers, distorted legs or body, cropped garment, tilted frame, props, text, watermark, harsh shadows, coloured or busy background, low resolution, blur, noise, jpeg artifacts
```

**Инструкция для режима image-to-image (EN)**

```
Use the reference photo as the only garment source. Keep the skirt exactly as shown: A-line mini silhouette, wide straight waistband, the single square gold-tone TR plaque at centre front, the diagonal line from under the plaque to the wearer's left hip, the short hem slit on the wearer's left with skin showing through, the concealed back zip with its gold TR tag pull, the matte pebbled black wool and all proportions. Change only: seamless light warm-grey background #E8E4DE, soft diffused daylight-balanced key from front-left plus gentle fill, no harsh shadows, full-length female model, neutral expression, plain fitted cream top, 3:4 vertical crop, upscale to 8K preserving the wool grain. Never redraw, resize or move the hardware.
```

**Что по фото определить нельзя (уточнить у дизайнера)**

- Точная длина: на всех кадрах кроп по низу юбки, ног модели не видно; по пропорциям это мини, уровень бедра указан ориентировочно.
- Ширина пояса — по пропорциям около 4–5 см, по фото точно не измерить.
- Пластина TR в кадре выглядит как плоская декоративная накладка без шпенька и ремешка; каталог называет её «пряжкой» — функциональна ли она, по фото не определить.
- Диагональная линия спереди: по фото не определить, это свободный край верхнего (запашного) полотна или шов, и какой слой верхний; сквозь разрез внизу видна кожа, поэтому сплошного нижнего слоя под передом, доходящего до низа, нет.
- Длина разреза и его точное расстояние от левого бокового шва: по кадру 01 ориентировочно 1/5–1/4 длины юбки, в нескольких сантиметрах от бока; кадр 01 обрезан справа, второй край разреза в него не попал.
- Каталог пишет «разрез спереди» — по фото разрез расположен у левого бокового края переда, а не по центру переда.
- Точки крепления букв T и R к рамке пластины (сверху/снизу) при разрешении кадра 03 не различимы — буквы лишь почти касаются рамки.
- Наличие подкладки, способ обработки низа и внутренних швов — не видны.
- Длина потайной молнии ниже пояса и наличие крючка/пуговицы на поясе над молнией — не видны.
- Шлица на спинке на кадре 02 не видна; принято, что её нет.
- Вытачки спереди и сзади не видны; принято, что их нет.
- Бежево-телесная область над поясом на кадре 03 — скорее всего кожа модели (или телесный топ), того же тона, что кожа в разрезе на кадре 04; кремовый облегающий топ в промптах — стилистическое допущение, не часть изделия.
- Исходные фото маленькие (330×440 и 172×230 px): мелкие детали (строчка, зубцы молнии, зерно ткани) оценены по увеличенным и осветлённым копиям, точная структура переплетения ткани не определяется.

### Жакет TR Noir (TR-JK-101)
Референсы: `public/images/brand/TR-JK-101/`.

**Как изделие выглядит на референсах**

- **Силуэт.** Приталенный короткий жакет силуэта «песочные часы»: жёсткое острое плечо с подплечником (линия плеча выведена вверх и чуть наружу), узкий лиф, талия резко подчёркнута узким поясом из основной ткани, от пояса вниз расходится расклешённая баска со складками. Спереди полочки ниже пояса не сходятся, а свободно расходятся.
- **Горловина.** Глубокий V-вырез до самой линии талии, без лацканов, без отворотов и видимого подборта: края выреза ровные, плоские, идут прямыми линиями от плеч к пряжке. У шеи края выреза переходят в небольшой воротник с острыми концами: спереди (фото 01) концы стоят у шеи, сзади (фото 02, 04) у воротника виден перегиб — он выглядит как короткий отложной воротник с острыми уголками по бокам. Конструкция воротника (стойка или отложной) по фото не определена.
- **Рукава / бретели.** Длинные узкие втачные рукава прямого кроя, до запястья; манжет, пуговиц, шлиц на рукавах не видно. Окат рукава чёткий, плечо острое с подплечником.
- **Длина.** Короткая длина: баска заканчивается примерно на уровне верха бедра (чуть ниже линии бёдер, выше середины бедра). Спереди края баски расходятся от пояса вниз, открывая центр переда.
- **Спинка.** Открытая спина. Верхняя часть спинки образована двумя полотнищами, которые по диагонали перекрещиваются по центру спины под воротником. Ниже точки перекрещивания — большой вырез ромбовидной формы («замочная скважина») с прямыми скошенными краями: самая широкая часть на уровне лопаток, к талии сужается до пояса. Спина открыта от лопаток до пояса. По талии проходит тот же узкий пояс из основной ткани, по центру спины на нём маленькая гладкая прямоугольная золотистая рамка (без букв). Баска сзади с глубокими складками по бёдрам, виден центральный шов спинки.
- **Застёжки.** Единственная видимая застёжка — узкий пояс из основной ткани по линии талии с небольшой прямоугольной пряжкой из золотистого металла по центру переда: золотая рамка, тёмная (чёрная) вставка, золотые буквы «TR». Выше пряжки полочки раскрыты (глубокий V), ниже пряжки — расходятся. Пуговиц, молний, крючков, кнопок на фото нет. Сзади на поясе — маленькая гладкая золотистая рамка-шлёвка по центру спины.
- **Детали.** Складки на баске по линии бёдер: спереди — по 2–3 складки с каждой стороны, веером от пояса к низу; сзади — глубокие складки по бёдрам (тип складок — односторонние, встречные или бантовые — по фото не определяется). Перекрёстная диагональная кокетка спинки над открытой спиной. Острые плечи. Фурнитура только двух видов: пряжка TR спереди и гладкая золотистая рамка сзади. Карманов, клапанов, декоративных строчек, подкладки на фото не видно.
- **Ткань.** Плотная матовая костюмная ткань без блеска (по составу — шерсть с шёлком), гладкая поверхность, хорошо держит форму: острые плечи, жёсткие чистые складки баски, ровные края выреза и кокетки. Ткань не тянется и не драпируется мягко, читается как структурированная.
- **Цвет.** Глубокий чёрный (#0E0E0E), однотонный, без рисунка и блеска. Фурнитура — золотистый металл, пряжка с тёмной вставкой.

**Что обязано остаться без изменений**

- Глубокий V-вырез до линии талии без лацканов и отворотов; края выреза ровные и переходят у шеи в небольшой воротник с острыми концами (сзади с перегибом).
- Острое, жёсткое плечо с подплечником; длинные узкие рукава без манжет, пуговиц и шлиц.
- Узкий пояс из основной ткани по талии и одна маленькая прямоугольная золотая пряжка с буквами TR по центру переда — единственная застёжка; никаких пуговиц, молний, крючков.
- Полочки ниже пояса расходятся; спереди центр переда открыт сверху и снизу от пряжки.
- Баска со складками по бёдрам (спереди по 2–3 складки веером от пояса с каждой стороны, сзади глубокие складки), длина строго до верха бедра — не удлинять и не укорачивать.
- Открытая спина: два диагонально перекрещенных полотнища кокетки под воротником и большой ромбовидный вырез от лопаток до пояса с прямыми краями.
- Сзади на поясе по центру спины — маленькая гладкая золотистая рамка без букв; центральный шов спинки на баске.
- Плотная матовая костюмная ткань без блеска, глубокий чёрный с читаемой фактурой; не атлас, не кожа, не трикотаж.
- Пропорции: приталенный короткий жакет, не прямой блейзер; без карманов, клапанов и декоративных строчек.
- Фурнитура только золотистая и маленькая; никаких других логотипов, надписей и бирок.

**Лучшие референсы**

- front: TR-JK-101/01.jpg
- back: TR-JK-101/02.jpg
- detail TR buckle and front pleats: TR-JK-101/03.jpg
- detail crossed back panels and open-back cutout: TR-JK-101/04.jpg
- three-quarter: no dedicated reference; derive from 01.jpg (front) with 02.jpg for the back/side

**Промпты**

*front*

EN:

```
Front view: black fitted jacket in matte structured wool-silk suiting, sharp padded pointed shoulders, long slim sleeves, deep plunging lapel-less V-neckline whose clean edges rise into a small pointed collar at the neck, nipped waist with a narrow self-fabric belt closed at centre front by one small rectangular gold TR buckle (the only fastening), fronts parting below it over a pleated peplum (two or three pleats fanning from the belt on each hip) ending at upper thigh; model standing straight, black trousers. Photorealistic e-commerce fashion photo, full-length female model, neutral calm expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, not a flat silhouette, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид спереди: чёрный приталенный жакет из плотной матовой костюмной ткани (шерсть с шёлком), острое жёсткое плечо с подплечником, длинные узкие рукава, глубокий V-вырез до талии без лацканов, ровные края выреза переходят у шеи в небольшой воротник с острыми концами; талия подчёркнута узким поясом из основной ткани, застёгнутым по центру переда одной маленькой прямоугольной золотой пряжкой TR (единственная застёжка), ниже пояса полочки расходятся над баской со складками (по две-три складки веером от пояса на каждом бедре), длина до верха бедра; модель стоит прямо, чёрные брюки. Фотореалистичная каталожная фэшн-съёмка для интернет-магазина, модель в полный рост с нейтральным спокойным выражением лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной рисующий свет спереди-слева плюс мягкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкость на фактуре ткани и швах, глубокий чёрный с читаемой фактурой, а не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*back*

EN:

```
Back view: black fitted matte wool-silk jacket, sharp padded shoulders, long slim sleeves, small pointed collar folded over at the back of the neck, two upper-back panels crossing diagonally at centre back, below the crossing a kite-shaped open-back cutout baring the skin, widest at the shoulder blades and narrowing to the narrow self-fabric waist belt with a small plain gold rectangular slide at centre back, deep-pleated peplum to upper thigh with a centre-back seam; model standing straight, black trousers. Photorealistic e-commerce fashion photo, full-length female model, neutral calm expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, not a flat silhouette, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид сзади: чёрный приталенный жакет из матовой шерстяной ткани с шёлком, острые плечи с подплечниками, длинные узкие рукава, небольшой воротник с острыми концами, сзади у шеи с перегибом, два полотнища верхней части спинки перекрещиваются по диагонали по центру спины, ниже точки перекрещивания — большой ромбовидный вырез, открывающий спину: самый широкий на уровне лопаток, сужается к узкому поясу из основной ткани с маленькой гладкой золотистой прямоугольной рамкой по центру спины; баска с глубокими складками по бёдрам до верха бедра, центральный шов спинки; модель стоит прямо, чёрные брюки. Фотореалистичная каталожная фэшн-съёмка для интернет-магазина, модель в полный рост с нейтральным спокойным выражением лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной рисующий свет спереди-слева плюс мягкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкость на фактуре ткани и швах, глубокий чёрный с читаемой фактурой, а не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*three-quarter*

EN:

```
Three-quarter front view, model turned slightly to her left so the sharp padded shoulder, slim long sleeve, deep lapel-less V-neckline with small pointed collar and the side of the pleated peplum all read clearly: black fitted matte wool-silk jacket, nipped waist with narrow self-fabric belt and small rectangular gold TR buckle at centre front, fronts parting below the belt, peplum ending at upper thigh, black trousers. Photorealistic e-commerce fashion photo, full-length female model, neutral calm expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, not a flat silhouette, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Вид в три четверти спереди, модель слегка развёрнута влево, чтобы читались острое плечо с подплечником, узкий длинный рукав, глубокий V-вырез без лацканов с небольшим воротником с острыми концами и бок баски со складками: чёрный приталенный жакет из матовой шерстяной ткани с шёлком, талия подчёркнута узким поясом из основной ткани с маленькой прямоугольной золотой пряжкой TR по центру переда, полочки расходятся ниже пояса, баска до верха бедра, чёрные брюки. Фотореалистичная каталожная фэшн-съёмка для интернет-магазина, модель в полный рост с нейтральным спокойным выражением лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной рисующий свет спереди-слева плюс мягкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и полностью в кадре, резкость на фактуре ткани и швах, глубокий чёрный с читаемой фактурой, а не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-TR-buckle*

EN:

```
Close-up detail of the front waist: narrow black self-fabric belt with a small rectangular gold-tone metal TR buckle (gold frame, dark inset, gold TR letters) at centre front, the jacket's only fastening; the two clean front edges of the deep V meet at the buckle and part again below it, pleats of the peplum fanning from the belt on both hips, matte structured wool-silk suiting. Photorealistic e-commerce fashion photo, ghost-mannequin or tightly cropped model torso, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the detail centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, not a flat silhouette, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план талии спереди: узкий чёрный пояс из основной ткани с маленькой прямоугольной пряжкой из золотистого металла с буквами TR (золотая рамка, тёмная вставка, золотые буквы) по центру переда — единственная застёжка жакета; два ровных края глубокого V-выреза сходятся у пряжки и снова расходятся ниже неё, складки баски веером расходятся от пояса по обоим бёдрам, плотная матовая костюмная ткань из шерсти с шёлком. Фотореалистичная каталожная фэшн-съёмка для интернет-магазина, манекен-невидимка или плотно кадрированный торс модели, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной рисующий свет спереди-слева плюс мягкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и полностью в кадре, резкость на фактуре ткани и швах, глубокий чёрный с читаемой фактурой, а не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

*detail-open-back*

EN:

```
Close-up detail of the upper back from behind: small pointed collar folded over at the back of the neck, two black panels crossing diagonally at the centre back, below the crossing the large kite-shaped open-back cutout with clean straight edges baring the skin from the shoulder blades down to the narrow waist belt with its small plain gold rectangular slide; matte structured wool-silk suiting, sharp padded shoulders. Photorealistic e-commerce fashion photo, model torso from behind with head cropped, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left plus gentle fill, no harsh shadows, 3:4 vertical frame, the detail centred and fully visible, sharp focus on fabric texture and seams, true black with visible texture, not a flat silhouette, 85mm lens look, no props, no text, no logos except the small TR hardware. Ultra-high resolution, 8K, fine fabric detail.
```

RU:

```
Крупный план верхней части спины сзади: небольшой воротник с острыми концами, сзади у шеи с перегибом, два чёрных полотнища перекрещиваются по диагонали по центру спины, ниже точки перекрещивания — большой ромбовидный вырез с ровными прямыми краями, открывающий спину от лопаток до узкого пояса с маленькой гладкой золотистой прямоугольной рамкой; плотная матовая костюмная ткань из шерсти с шёлком, острые плечи с подплечниками. Фотореалистичная каталожная фэшн-съёмка для интернет-магазина, торс модели со спины, голова за кадром, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной рисующий свет спереди-слева плюс мягкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, деталь по центру и полностью в кадре, резкость на фактуре ткани и швах, глубокий чёрный с читаемой фактурой, а не плоский силуэт, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR. Сверхвысокое разрешение, 8K, тонкая детализация ткани.
```

**Негативный промпт (EN)**

```
lapels, notched lapel, shawl lapel, buttons, button row, double-breasted, front zip, visible zipper, hooks, pockets, pocket flaps, welt pockets, closed back, covered back, smaller or rounded back cutout, missing crossed back panels, shirt or top worn under the jacket, bra, changed neckline (round, square, high, shallow V, halter), added collar height, short sleeves, sleeveless, rolled or puffed sleeves, cuffs with buttons, sleeve vents, lengthened hem, cropped hem, straight blazer silhouette, missing peplum, flat unpleated peplum, extra pleats, ruffles, belt removed, wide belt, oversized buckle, round buckle, two buckles at the front, wrong letters on the buckle, extra hardware, chains, studs, any brand text or logo other than the small TR buckle, text, watermark, labels, glossy satin sheen, patent, leather jacket, denim, velvet, knit texture, visible pattern, grey, navy or brown instead of black, crushed black with no texture, flat black silhouette, harsh shadows, coloured or patterned background, outdoor scene, props, furniture, jewellery, hat, sunglasses, deformed hands, extra fingers, distorted face, asymmetric shoulders, warped seams, blurry, low resolution, noise, oversaturation, cartoon, illustration, sketch
```

**Инструкция для режима image-to-image (EN)**

```
Use the supplied photo as the strict reference for the garment and keep the jacket exactly as it is: silhouette and proportions, sharp padded shoulders, slim long sleeves, deep lapel-less V-neckline with the small pointed collar, the narrow waist belt and the small gold TR buckle at centre front, the crossed upper-back panels and the kite-shaped open-back cutout, the plain gold slide at centre back, pleat placement and peplum length, matte black wool-silk texture and seam lines. Change only the photo: replace the background with a seamless light warm-grey studio backdrop (#E8E4DE), relight with a soft diffused daylight-balanced key from front-left plus gentle fill, remove harsh shadows, swap in a full-length female model with a neutral calm expression in the same pose, keep plain black trousers, and upscale to ultra-high resolution 8K with fine fabric detail. Do not add buttons, zips, lapels, pockets or text.
```

**Что по фото определить нельзя (уточнить у дизайнера)**

- Файлы выглядят как фотографии образца на модели, а не как эскизы; разрешение низкое (мелкие кропы), поэтому переплетение ткани, подкладка и мелкие строчки не читаются.
- Каталог говорит «без лацканов» — лацканов действительно нет, но на фото есть небольшой воротник с острыми концами (виден на 01, 02, 04); в каталожном тексте он не упомянут. Конструкция воротника не определена: спереди (01) концы стоят у шеи, сзади (02, 04) виден перегиб, как у короткого отложного воротника; идёт ли стойка по всей длине краёв выреза или только у шеи — тоже не видно.
- Не видно, пришит ли пояс к жакету или съёмный, и есть ли скрытая застёжка (крючок/кнопка) под пряжкой: единственная видимая застёжка — пряжка TR.
- Сзади на поясе по центру спины — маленькая гладкая золотистая рамка без букв; неясно, это шлёвка-ползунок или вторая пряжка.
- Длина баски сзади и по бокам на полной фигуре не видна (кадры обрезаны по бёдрам); спереди длина оценена как «до верха бедра».
- Низ рукава: манжеты, шлицы, пуговицы на рукавах — не видны ни на одном фото.
- Карманы не видны; предположительно их нет, но подтвердить нельзя.
- Тип складок баски по кропам не определяется: спереди видны по 2–3 складки на каждом бедре, расходящиеся веером от пояса; сзади — глубокие складки по бёдрам. Односторонние, встречные или бантовые — не подтверждено, поэтому в промптах складки указаны нейтрально.
- Цвет и вид подкладки (купро по каталогу) на фото не виден.
- Чёрные кожаные брюки на модели не являются частью изделия; буквы на пряжке читаются как «TR», но из-за размера кропа точное начертание логотипа не гарантировано.

### Платье TR Halter (TR-DR-101)
Референсы: `public/images/brand/TR-DR-101/`.

**Как изделие выглядит на референсах**

- **Силуэт.** Приталенный футляр (sheath): плотно по корпусу, подчёркнутая талия, узкая прямая юбка по бёдрам; ткань держит форму, силуэт структурный, без растяжения и без расклешения в видимой части (до середины бедра).
- **Горловина.** Высокий халтер: узкая передняя панель в форме вытянутого перевёрнутого треугольника поднимается от груди, сужается к короткой прямой полоске и уходит под мягкое бандо, обёрнутое вокруг шеи; бандо ложится поверх верха панели мягкой горизонтальной складкой и читается как мягко обёрнутая/сложенная полоса ткани с мягкими складками, а не жёсткая стойка. Явной сборки у стыка панели с бандо нет. Лиф закрывает грудь целиком до подмышки; открыты ключицы, верх груди, плечи и бока корпуса под руками — проймы халтера широкие.
- **Рукава / бретели.** Без рукавов и без бретелей; руки и плечи полностью открыты, лиф держится только на шейном бандо халтера.
- **Длина.** На кропах подол не виден — все кадры обрезаны на уровне середины/верха бедра. По каталогу — мини (по фото не подтверждено). Шарф уходит ниже границы кадра, его конец не виден.
- **Спинка.** Полностью открытая спина: от шейного бандо до прямого горизонтального верхнего края задней панели чуть ниже лопаток (на уровне линии бюстгальтера). Никаких перемычек, бретелей и завязок по спине. Длинный шарф из той же ткани выходит из-под бандо сзади справа (с правой стороны шеи модели) под золотистой монограммой «TR» и спадает по спине вдоль правого бока мягкими вертикальными складками.
- **Застёжки.** Потайная молния по центру спинки: начинается от верхнего края задней панели; линия шва/молнии идёт вниз по центру спинки до нижней границы кадра 02 (середина бедра) — где именно заканчивается молния, не видно; тесьма не видна, читается как чистая линия шва. Язычок — небольшой золотистый прямоугольный с гравировкой «TR» на маленьком слайдере. На бандо у шеи сзади справа — золотистая металлическая монограмма «TR» (клипса/слайдер в точке, где шарф выходит из-под бандо). Других застёжек, пуговиц, пряжек не видно.
- **Детали.** Рельефные (принцесс) швы с обеих сторон: от точки схода передней панели у шеи через вершины груди вниз к талии. Шарф — длинный, широкий, той же ткани, лежит мягкими продольными складками. Без разрезов, складок на юбке, пояса, карманов, баски, декоративных строчек, видимых на фото.
- **Ткань.** Матовый плотный шёлковый креп: гладкая поверхность без блеска, лёгкая мелкозернистая фактура, ткань структурная и держит форму корпуса, не облегает как трикотаж; шарф той же ткани драпируется тяжёлыми мягкими складками.
- **Цвет.** Айвори — тёплый молочно-белый (#F8F5EE), однотонный, одинаковый на платье и шарфе; фурнитура — золотистый (жёлтое золото) металл.

**Что обязано остаться без изменений**

- Высокий халтер: узкая передняя панель-треугольник, уходящая под мягкое обёрнутое бандо вокруг шеи; никакого V-образного, квадратного или круглого выреза
- Полностью открытые плечи и руки, широкие проймы халтера — без рукавов и без бретелей; грудь закрыта лифом целиком
- Полностью открытая спина до прямого горизонтального края чуть ниже лопаток, без перемычек и бретелей по спине
- Длинный шарф из той же ткани, выходящий из-под бандо сзади справа и спадающий по спине вдоль правого бока модели (один шарф, одна сторона)
- Фурнитура только золотистая и только две маленькие детали с «TR»: монограмма-клипса на бандо в точке крепления шарфа и язычок молнии; других логотипов нет
- Потайная молния по центру спинки без видимой тесьмы с маленьким золотистым прямоугольным язычком «TR»
- Рельефные (принцесс) швы от точки у шеи через грудь к талии с обеих сторон
- Приталенный силуэт-футляр с узкой прямой юбкой, длина мини по каталогу (выше колена)
- Матовый плотный шёлковый креп без блеска, цвет айвори #F8F5EE на платье и шарфе
- Никаких добавленных элементов: поясов, пуговиц, карманов, разрезов, складок, кружева, принтов, другой фурнитуры

**Лучшие референсы**

- TR-DR-101/01.jpg — front (halter neckline, front panel tucking under the wrapped neckband, princess seams, scarf tail on the model's right)
- TR-DR-101/02.jpg — back (open back edge, centre-back invisible zip with gold TR pull, TR clasp at the neckband, scarf fall along the right side)
- TR-DR-101/03.jpg — details (neckband, gold TR monogram clasp at the scarf attachment, top of zip pull)

**Промпты**

*front*

EN:

```
Ivory #F8F5EE matte silk-crepe mini sheath dress, front view: high halter, narrow inverted-triangle front panel rising from the bust under a soft wrapped neckband, bare shoulders and arms, wide halter armholes, princess seams from the neck point over the bust to the waist, fitted structured bodice, slim straight above-knee skirt; a long matching scarf attached at the back right of the neckband hangs down the back, its tail visible behind the model's right arm. Photorealistic e-commerce fashion photography, full-length female model, neutral expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, ivory not blown out, 85mm lens look, no props, no text, no logos except the small TR hardware, 8K resolution.
```

RU:

```
Платье-футляр мини из матового шёлкового крепа цвета айвори #F8F5EE, вид спереди: высокий халтер, узкая передняя панель в форме перевёрнутого треугольника поднимается от груди и уходит под мягкое обёрнутое вокруг шеи бандо, открытые плечи и руки, широкие проймы халтера, рельефные швы от точки у шеи через грудь к талии, приталенный структурный лиф, узкая прямая юбка выше колена; длинный шарф из той же ткани, закреплённый на бандо сзади справа, спадает по спине, его хвост виден за правой рукой модели. Фотореалистичная fashion-съёмка для интернет-магазина, модель-девушка в полный рост, нейтральное выражение лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди слева плюс лёгкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, айвори без пересвета, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR, разрешение 8K.
```

*back*

EN:

```
Ivory #F8F5EE matte silk-crepe mini sheath dress, back view: soft halter neckband, open bare back to a straight horizontal edge below the shoulder blades, no other straps; invisible centre-back zip, a clean seam line down from that edge, small gold rectangular TR pull on top; gold TR monogram clasp at the right of the neckband holds a long matching scarf falling down the model's right side in soft vertical folds; fitted waist, slim straight above-knee skirt. Photorealistic e-commerce fashion photography, full-length female model, neutral expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, ivory not blown out, 85mm lens look, no props, no text, no logos except the small TR hardware, 8K resolution.
```

RU:

```
Платье-футляр мини из матового шёлкового крепа цвета айвори #F8F5EE, вид сзади: мягкое бандо-халтер, полностью открытая спина до прямого горизонтального края ниже лопаток, никаких других бретелей; потайная молния по центру спинки — чистая линия шва, идущая вниз от этого края, сверху маленький золотистый прямоугольный язычок TR; золотистая монограмма-клипса TR справа на бандо держит длинный шарф из той же ткани, спадающий вдоль правого бока модели мягкими вертикальными складками; приталенная талия, узкая прямая юбка выше колена. Фотореалистичная fashion-съёмка для интернет-магазина, модель-девушка в полный рост, нейтральное выражение лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди слева плюс лёгкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, айвори без пересвета, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR, разрешение 8K.
```

*three-quarter*

EN:

```
Ivory #F8F5EE matte silk-crepe mini sheath dress, three-quarter view, model's right shoulder nearer the camera: high halter, narrow inverted-triangle front panel under a soft wrapped neckband, bare shoulders and arms, princess seams over the bust, fitted structured bodice, slim straight above-knee skirt, open back edge below the shoulder blades visible at the side; a long matching scarf falls from the back right of the neckband down her right side and back in soft vertical folds. Photorealistic e-commerce fashion photography, full-length female model, neutral expression, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, garment centred and fully visible, sharp focus on fabric texture and seams, ivory not blown out, 85mm lens look, no props, no text, no logos except the small TR hardware, 8K resolution.
```

RU:

```
Платье-футляр мини из матового шёлкового крепа цвета айвори #F8F5EE, ракурс три четверти, правое плечо модели ближе к камере: высокий халтер, узкая передняя панель-треугольник уходит под мягкое обёрнутое бандо, открытые плечи и руки, рельефные швы на груди, приталенный структурный лиф, узкая прямая юбка выше колена, сбоку виден край открытой спины ниже лопаток; длинный шарф из той же ткани спадает с бандо сзади справа вдоль её правого бока и спины мягкими вертикальными складками. Фотореалистичная fashion-съёмка для интернет-магазина, модель-девушка в полный рост, нейтральное выражение лица, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди слева плюс лёгкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, изделие по центру и видно целиком, резкий фокус на фактуре ткани и швах, айвори без пересвета, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR, разрешение 8K.
```

*detail-neckband-TR-clasp*

EN:

```
Close-up detail of the back of the neck on a female model: ivory #F8F5EE matte silk-crepe halter band wrapped softly around the neck, bare upper back and shoulder blades below it; on the right side of the band a small gold metal TR monogram clasp where the long matching scarf is attached, the scarf falling from it in soft vertical folds down the back. Photorealistic e-commerce product photography, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, macro sharpness on the metal engraving and crepe texture, ivory not blown out, 85mm lens look, no props, no text, no logos except the small TR hardware, 8K resolution.
```

RU:

```
Крупный план задней части шеи на модели: бандо-халтер из матового шёлкового крепа айвори #F8F5EE мягко обёрнуто вокруг шеи, ниже — открытая верхняя часть спины и лопатки; на правой стороне бандо — маленькая золотистая металлическая монограмма-клипса TR, в которой закреплён длинный шарф из той же ткани, спадающий от неё по спине мягкими вертикальными складками. Фотореалистичная предметная съёмка для интернет-магазина, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди слева плюс лёгкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, макро-резкость на гравировке металла и фактуре крепа, айвори без пересвета, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR, разрешение 8K.
```

*detail-zip-TR-pull*

EN:

```
Close-up detail of the centre back on a female model: ivory #F8F5EE matte silk-crepe dress, straight horizontal top edge of the back panel below the shoulder blades with bare skin above, invisible centre-back zip reading as a clean seam line with no visible tape, topped by a small gold rectangular pull engraved TR; the matching scarf hangs in soft vertical folds at the right edge of the frame. Photorealistic e-commerce product photography, seamless light warm-grey studio background #E8E4DE, soft diffused daylight-balanced key light from front-left with gentle fill, no harsh shadows, 3:4 vertical frame, macro sharpness on the zip pull and crepe texture, ivory not blown out, 85mm lens look, no props, no text, no logos except the small TR hardware, 8K resolution.
```

RU:

```
Крупный план центра спинки на модели: платье из матового шёлкового крепа айвори #F8F5EE, прямой горизонтальный верхний край задней панели ниже лопаток, выше — открытая кожа; потайная молния по центру спинки читается как чистая линия шва без видимой тесьмы, сверху — маленький золотистый прямоугольный язычок с гравировкой TR; шарф из той же ткани свисает мягкими вертикальными складками у правого края кадра. Фотореалистичная предметная съёмка для интернет-магазина, бесшовный светлый тёпло-серый студийный фон #E8E4DE, мягкий рассеянный дневной ключевой свет спереди слева плюс лёгкая заполняющая подсветка, без жёстких теней, вертикальный кадр 3:4, макро-резкость на язычке молнии и фактуре крепа, айвори без пересвета, оптика 85 мм, без реквизита, без текста, без логотипов, кроме маленькой фурнитуры TR, разрешение 8K.
```

**Негативный промпт (EN)**

```
altered neckline, V-neck, sweetheart, square or round neckline, shoulder straps, spaghetti straps, added sleeves, covered shoulders, closed back, back straps or ties, changed length, midi, maxi, floor-length, A-line or flared skirt, slit, pleats, ruffles, peplum, belt, pockets, extra buttons, visible zipper tape, snaps, lace, embroidery, prints, sequins, satin gloss or shiny fabric, sheer fabric, stretchy jersey look, colour shift to pure white, cream-yellow, beige or grey, missing scarf, scarf on the left side, two scarves, scarf tied in a bow, silver hardware, large logo, brand text, watermark, text, deformed hands, extra fingers, extra limbs, distorted face, cropped garment, cluttered background, props, harsh shadows, flat silhouette, low resolution, blur, noise, cartoon, illustration, painting, 3D render look
```

**Инструкция для режима image-to-image (EN)**

```
Keep the dress exactly as in the reference photo: ivory #F8F5EE matte silk crepe, high halter with narrow inverted-triangle front panel under a soft wrapped neckband, bare shoulders and arms, princess seams, fitted sheath body, slim mini skirt, open back to a straight edge below the shoulder blades, centre-back invisible zip with small gold TR pull, long matching scarf fixed at the back right of the neckband by a gold TR clasp and falling down the right side of the back. Change only: seamless light warm-grey background #E8E4DE, soft diffused daylight-balanced key from front-left with gentle fill, full-length 3:4 frame, upscale to 8K, fine fabric detail; model may change, garment must stay fully visible. Add nothing, remove nothing.
```

**Что по фото определить нельзя (уточнить у дизайнера)**

- Длина подола не видна ни на одном кропе — все кадры обрезаны на уровне середины бедра; «мини» взято из описания в каталоге (prisma/seed-brand.ts) и по фото не подтверждено.
- Форма юбки ниже середины бедра (строго прямая или с лёгким расширением к подолу) по кропам не определяется; в видимой части юбка узкая, по бёдрам.
- Не видно, где заканчивается шарф (уходит за нижнюю границу кадра) и какова его ширина в развёрнутом виде.
- Нельзя определить, является ли бандо на шее частью шарфа (шарф обёрнут вокруг шеи) или отдельным пришитым воротником. Каталог называет шарф съёмным, по фото это не проверить — поэтому слово «съёмный/detachable» из промптов убрано; видна только золотистая монограмма TR в точке, где шарф выходит из-под бандо справа сзади.
- Способ застёгивания бандо на шее (крючок, пуговица, завязка) не виден: на кропе 03 бандо выглядит сплошным.
- Нижняя точка молнии не видна: линия по центру спинки идёт от верхнего края задней панели до нижней границы кадра 02 (середина бедра); где заканчивается молния и переходит ли она в обычный шов, по фото не определить.
- Наличие разреза на юбке (сзади или сбоку), подкладки и горизонтального шва по талии по кропам определить нельзя.
- Каталог упоминает монограмму TR только на молнии; на фото монограмма TR есть и на язычке молнии (кроп 02), и в виде отдельной золотистой клипсы на бандо (кропы 02 и 03) — в генерациях нужно сохранять обе.
- Язычок молнии на фото крупнее типичного язычка потайной молнии (прямоугольная золотистая пластина с гравировкой TR на маленьком слайдере); тесьма при этом не видна, так что «потайная» каталогу не противоречит.
- На правом краю кропа 01 виден фрагмент соседней фотографии из сетки кадров (рука и край платья) — к изделию не относится; на генерациях его быть не должно.
- Точный оттенок: на фото тёплый айвори, согласуется с #F8F5EE, но по веб-рендеру JPEG тон не верифицировать; шарф на кропе 01 в тени читается чуть теплее платья — это освещение, не другой цвет.
