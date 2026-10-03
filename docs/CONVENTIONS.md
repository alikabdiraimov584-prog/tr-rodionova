# Соглашения для разработки (для людей и агентов)

- Next.js 16 App Router. `params` и `searchParams` — Promise, типы `PageProps<"/route">` глобальные. Серверные компоненты по умолчанию, `"use client"` только для форм с `useActionState`.
- Данные: `db` из `@/lib/db` (Prisma 7). Деньги — целые копейки, форматирование `formatMoney`, `formatDate`, `toKopecks` из `@/lib/money`.
- Авторизация: `requireUser(next)` для кабинета, `requireSection("<раздел>")` для CRM (разделы в `src/lib/permissions.ts`), `getCurrentUser()` для необязательной.
- Server actions в `src/app/actions/*.ts` с `"use server"`, сигнатура `(prev: ActionState, formData: FormData) => Promise<ActionState>` для форм с ошибками, либо `(formData) => void` для кнопок. Проверка прав внутри каждого action. После изменений — `revalidatePath`. Важные действия — `audit(userId, "entity.action", "Entity", id, payload)` из `@/lib/audit`.
- Баллы начислять только через `addPoints(tx, userId, type, amount, opts)` из `@/lib/loyalty` внутри `db.$transaction`.
- UI: только классы из `src/app/globals.css` и Tailwind-токены: `card`, `btn-primary`, `btn-outline`, `btn-ghost`, `btn-sm`, `input`, `label`, `eyebrow`, `table`, `badge`; компоненты `PageTitle`, `Badge`, `Stat`, `Empty`, `Eyebrow`, `Alert`, `Field` из `@/components/ui`; `SubmitButton`, `ConfirmButton` из `@/components/form`. Цвета: `text-muted`, `text-ink`, `bg-ivory`, `bg-sand`, `border-line`, `text-success`, `text-danger`, `text-warning`. Не вводить новые цвета и шрифты: стиль задаётся глобально.
- Подписи enum'ов — в `src/lib/labels.ts`. Изображения товаров — `<Image unoptimized fill>` из `next/image`.
- Проверка: `npx tsc --noEmit && npm run lint`. Миграции не создавать — схема уже содержит все модели.
