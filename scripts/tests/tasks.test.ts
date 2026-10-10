// Задачи CRM: создание и назначение, перенос между колонками с перенумерацией позиций, чеклист, комментарии
// и системная история, сводка (просрочено / сегодня / на неделе / без срока), утренняя сводка в Telegram
// (подставной api.telegram.org) и её отсутствие без Telegram, разбор срока из datetime-local по Москве.
// Запуск: DATABASE_URL=… AUTH_SECRET=… node --conditions=react-server --import tsx scripts/tests/tasks.test.ts
import { db } from "@/lib/db";
import { saveIntegration } from "@/lib/integrations/store";
import {
  addChecklistItem,
  addComment,
  cardData,
  compareInColumn,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moscowClock,
  moveTask,
  parseChecklist,
  parseLocalDateTime,
  remindOverdueTasks,
  removeChecklistItem,
  taskSummary,
  toLocalInputValue,
  toggleChecklistItem,
  updateTask,
} from "@/lib/tasks";

const PREFIX = "[tasks-test]";
const DAY = 86_400_000;
let fails = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fails++;
};

// Telegram подменён: запоминаем тексты, остальные адреса — настоящий fetch
const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.telegram.org")) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
  sent.push(body.text ?? "");
  return Response.json({ ok: true, result: {} });
}) as typeof fetch;

async function staffOrCreate(role: "ADMIN" | "MANAGER", firstName: string, notId?: string) {
  const found = await db.user.findFirst({ where: { role, isActive: true, ...(notId ? { id: { not: notId } } : {}) } });
  if (found) return found;
  return db.user.create({ data: { email: `${PREFIX.slice(1, -1)}-${role.toLowerCase()}-${Date.now()}@example.com`, passwordHash: "!", firstName, role } });
}

const checklistOf = async (id: string) => parseChecklist((await db.crmTask.findUniqueOrThrow({ where: { id } })).checklist);

async function main() {
  const admin = await staffOrCreate("ADMIN", "Админ");
  const manager = await staffOrCreate("MANAGER", "Мария", admin.id);
  const customer = await db.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true, firstName: true } });
  await db.crmTask.deleteMany({ where: { title: { startsWith: PREFIX } } });

  const now = new Date();
  const clock = moscowClock(now);
  // срок «сегодня, но позже»: через полчаса, но не позже конца московских суток
  const todayDue = new Date(Math.max(now.getTime() + 1000, Math.min(now.getTime() + 30 * 60_000, clock.end.getTime() - 1000)));
  const s0 = await taskSummary(now);

  // 1. создание и назначение
  const t1 = await createTask({ title: `${PREFIX} Позвонить Марии`, assigneeId: manager.id, customerId: customer?.id, priority: "HIGH", kind: "CALL", dueAt: new Date(now.getTime() - 2 * 3_600_000) }, admin.id);
  check("создана: этап OPEN, ответственный и клиентка на месте", t1.status === "OPEN" && t1.assigneeId === manager.id && t1.assignee?.firstName === manager.firstName && (!customer || t1.customer?.id === customer.id));
  check("создана: тип, приоритет, автор", t1.kind === "CALL" && t1.priority === "HIGH" && t1.createdById === admin.id);
  const t2 = await createTask({ title: `${PREFIX} Без срока` }, admin.id);
  const t3 = await createTask({ title: `${PREFIX} Сегодня позже`, dueAt: todayDue }, admin.id);
  check("новые карточки встают в конец колонки", t2.position === t1.position + 1 && t3.position === t2.position + 1, `${t1.position} ${t2.position} ${t3.position}`);
  check("без ответственного — assigneeId null", t2.assigneeId === null);

  // 2. список и порядок в колонке
  const open = await listTasks({ statuses: ["OPEN"], q: PREFIX });
  check("listTasks: поиск по названию находит три задачи", open.length === 3, String(open.length));
  const sorted = [...open].sort(compareInColumn("OPEN"));
  check("порядок: просроченная первая, без срока — последняя", sorted[0]?.id === t1.id && sorted.at(-1)?.id === t2.id);
  check("фильтр по типу", (await listTasks({ kind: "CALL", q: PREFIX })).length === 1);
  check("фильтр «мои» показывает мои и неназначенные", (await listTasks({ mineOf: manager.id, q: PREFIX })).length === 3 && (await listTasks({ assigneeId: manager.id, q: PREFIX })).length === 1);

  // 3. перенос между колонками с position
  const m2 = await moveTask(t2.id, "IN_PROGRESS", 0, admin.id);
  check("move: этап IN_PROGRESS, позиция 0", m2.status === "IN_PROGRESS" && m2.position === 0);
  await moveTask(t3.id, "IN_PROGRESS", 0, admin.id);
  const col = await db.crmTask.findMany({ where: { status: "IN_PROGRESS", title: { startsWith: PREFIX } }, orderBy: { position: "asc" } });
  check("move: вставка в начало сдвигает соседей", col[0]?.id === t3.id && col[1]?.id === t2.id && col[1].position === col[0].position + 1, col.map((c) => `${c.title}:${c.position}`).join(", "));
  const h2 = await getTask(t2.id);
  check("move: системная запись «Этап: Новая → В работе»", !!h2?.comments.some((c) => c.isSystem && /Этап: Новая → В работе/.test(c.text)));
  const done = await moveTask(t2.id, "DONE", 0, admin.id);
  check("DONE: completedAt заполнен", done.status === "DONE" && done.completedAt instanceof Date);
  const back = await moveTask(t2.id, "OPEN", 100_000, admin.id);
  const othersOpen = await db.crmTask.count({ where: { status: "OPEN", id: { not: t2.id } } });
  check("возврат: completedAt сброшен, позиция — конец колонки", back.completedAt === null && back.position === othersOpen, `${back.position} vs ${othersOpen}`);
  check("move в тот же этап не пишет историю", (await getTask(t2.id))!.comments.filter((c) => c.isSystem).length === 3);

  // 4. правка полей и системная история
  await updateTask(t1.id, { assigneeId: admin.id, priority: "URGENT", dueAt: new Date(now.getTime() + 3 * DAY) }, manager.id);
  const before = (await getTask(t1.id))!.comments.filter((c) => c.isSystem);
  const sys = before.map((c) => c.text).join("\n");
  check("история: ответственный", new RegExp(`Ответственный: ${manager.firstName}.*→ ${admin.firstName}`).test(sys), sys);
  check("история: приоритет", /Приоритет: Высокий → Срочно/.test(sys));
  check("история: срок", /Срок: .* → .*/.test(sys));
  await updateTask(t1.id, { priority: "URGENT", title: `${PREFIX} Позвонить Марии (повторно)` }, manager.id);
  const after = (await getTask(t1.id))!;
  check("правка без смены этапа/срока/ответственного/приоритета не пишет историю", after.comments.filter((c) => c.isSystem).length === before.length && after.title.endsWith("(повторно)"));
  const toReview = await updateTask(t1.id, { status: "REVIEW" }, manager.id);
  check("этап через updateTask: позиция — конец новой колонки", toReview.status === "REVIEW" && toReview.position === (await db.crmTask.count({ where: { status: "REVIEW", id: { not: t1.id } } })));

  // 5. чеклист
  await addChecklistItem(t1.id, "Набрать номер");
  await addChecklistItem(t1.id, "Записать итог");
  let cl = await checklistOf(t1.id);
  check("чеклист: два пункта, не отмечены", cl.length === 2 && cl.every((i) => !i.done));
  await toggleChecklistItem(t1.id, cl[0].id);
  cl = await checklistOf(t1.id);
  check("чеклист: отметка переключается", cl[0].done && !cl[1].done);
  const card = cardData((await listTasks({ statuses: ["REVIEW"], q: PREFIX }))[0], now);
  check("карточка: прогресс 1/2", card.checklist?.done === 1 && card.checklist?.total === 2, JSON.stringify(card.checklist));
  await removeChecklistItem(t1.id, cl[1].id);
  check("чеклист: удаление пункта", (await checklistOf(t1.id)).length === 1);
  let err = "";
  await addChecklistItem(t1.id, "   ").catch((e) => (err = String(e)));
  check("пустой пункт отклонён", /Введите/.test(err), err);

  // 6. комментарии
  await addComment(t1.id, "Перезвонить после 15:00", manager.id);
  const full = (await getTask(t1.id))!;
  check("комментарий сохранён с автором", full.comments.some((c) => !c.isSystem && c.text === "Перезвонить после 15:00" && c.author?.id === manager.id));
  check("счётчик карточки считает только комментарии команды", cardData(full, now).comments === 1);
  err = "";
  await addComment(t1.id, "", manager.id).catch((e) => (err = String(e)));
  check("пустой комментарий отклонён", /Введите/.test(err));

  // 7. сводка: дельты к состоянию до теста
  const t4 = await createTask({ title: `${PREFIX} Просрочена`, dueAt: new Date(now.getTime() - 400 * DAY) }, admin.id);
  const s = await taskSummary(now);
  check("summary: просрочено +1", s.overdue === s0.overdue + 1, `${s0.overdue} → ${s.overdue}`);
  check("summary: сегодня +1", s.today === s0.today + 1, `${s0.today} → ${s.today}`);
  check("summary: на неделе +1 (срок через 3 дня)", s.week === s0.week + 1, `${s0.week} → ${s.week}`);
  check("summary: без срока +1", s.noDue === s0.noDue + 1, `${s0.noDue} → ${s.noDue}`);
  check("summary: на проверке +1", s.review === s0.review + 1);
  const none = s.byAssignee.find((a) => a.id === "none");
  const mine = s.byAssignee.find((a) => a.id === admin.id);
  check("нагрузка: неназначенные учтены с просрочкой", !!none && none.open >= 3 && none.overdue >= 1, JSON.stringify(none));
  check("нагрузка: у администратора есть открытая задача", !!mine && mine.open >= 1, JSON.stringify(mine));
  check("по типам: звонок учтён", s.byKind.some((k) => k.kind === "CALL" && k.count >= 1));
  const c4 = cardData(t4, now);
  check("карточка: просроченная подписана красным", c4.due?.tone === "danger" && /просрочена/.test(c4.due.label), c4.due?.label);
  check("карточка: сегодняшняя подписана «сегодня»", cardData((await getTask(t3.id))!, now).due?.label.startsWith("сегодня") === true);

  // 8. утренняя сводка в Telegram
  const at9 = new Date(clock.start.getTime() + 9 * 3_600_000 + 30 * 60_000);
  const at12 = new Date(clock.start.getTime() + 12 * 3_600_000);
  check("не в 9 утра по Москве сводка не уходит", (await remindOverdueTasks(at12)).sent === false);
  await saveIntegration("telegram_alerts", {}, ["botToken", "chatId"], false);
  await db.crmTask.updateMany({ where: { remindedAt: { not: null } }, data: { remindedAt: null } });
  const noTg = await remindOverdueTasks(at9);
  check("без Telegram: {sent:false} с причиной", noTg.sent === false && /Telegram/.test(noTg.reason ?? ""), JSON.stringify(noTg));
  await saveIntegration("telegram_alerts", { botToken: "123:test-token", chatId: "42" }, [], true);
  sent.length = 0;
  const r = await remindOverdueTasks(at9);
  check("сводка отправлена одним сообщением", r.sent === true && sent.length === 1, JSON.stringify(r));
  check("в сводке — просроченная задача и заголовок «Просрочено»", /Просрочено \(\d+\)/.test(sent[0] ?? "") && (sent[0] ?? "").includes(`${PREFIX} Просрочена`), (sent[0] ?? "").slice(0, 300));
  check("remindedAt проставлен", (await db.crmTask.findUniqueOrThrow({ where: { id: t4.id } })).remindedAt !== null);
  const again = await remindOverdueTasks(at9);
  check("повтор в тот же день не уходит", again.sent === false && sent.length === 1, JSON.stringify(again));
  const state = await db.setting.findUnique({ where: { key: "alertState" } });
  check("ключ tasks-digest-дата записан", JSON.stringify(state?.value ?? {}).includes(`tasks-digest-${clock.dateKey}`));

  // 9. срок из datetime-local — по Москве, не по TZ сервера
  const parsed = parseLocalDateTime("2026-10-10T14:00");
  check("datetime-local 14:00 → 11:00Z", parsed?.toISOString() === "2026-10-10T11:00:00.000Z", parsed?.toISOString());
  check("обратно в поле — та же строка", toLocalInputValue(parsed) === "2026-10-10T14:00", toLocalInputValue(parsed));
  check("кривая строка → null", parseLocalDateTime("вчера") === null && parseLocalDateTime("") === null);

  // 10. удаление — вместе с историей
  await deleteTask(t1.id);
  check("удаление: задачи и комментариев нет", (await db.crmTask.findUnique({ where: { id: t1.id } })) === null && (await db.crmTaskComment.count({ where: { taskId: t1.id } })) === 0);

  // уборка
  await db.crmTask.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await saveIntegration("telegram_alerts", {}, ["botToken", "chatId"], false);
  console.log(fails ? `\nПровалено: ${fails}` : "\nВсе проверки прошли");
}

main()
  .catch((e) => {
    console.error(e);
    fails++;
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(fails ? 1 : 0);
  });
