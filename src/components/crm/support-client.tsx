"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { linkCustomerAction, markReadAction, replyAction, saveTemplateAction, simulateInboundAction } from "@/app/actions/support";
import { CHANNEL } from "@/lib/labels";
import type { ActionState } from "@/lib/action-result";

type Template = { id: string; title: string; shortcut: string | null; text: string };

export function Composer({ conversationId, templates, ctx, hint }: { conversationId: string; templates: Template[]; ctx: { name?: string | null; tier?: string | null; points?: number | null; order?: number | null }; hint?: string }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await replyAction(prev, fd);
    if (r?.ok && !r.error) setText("");
    return r;
  }, undefined);

  const render = (t: string) =>
    t
      .replace(/\{имя\}/g, ctx.name ?? "")
      .replace(/\{уровень\}/g, ctx.tier ?? "")
      .replace(/\{баллы\}/g, ctx.points != null ? ctx.points.toLocaleString("ru-RU") : "")
      .replace(/\{заказ\}/g, ctx.order ? `№${ctx.order}` : "")
      .replace(/ {2,}/g, " ");

  const onChange = (v: string) => {
    const m = v.match(/^(\/\S+)\s$/);
    const t = m && templates.find((x) => x.shortcut === m[1]);
    setText(t ? render(t.text) : v);
  };

  const submit = (mode: "send" | "close" | "note") => {
    if (modeRef.current) modeRef.current.value = mode;
    formRef.current?.requestSubmit();
  };

  return (
    <form ref={formRef} action={action} className={`border-t p-3 ${note ? "border-champagne bg-champagne/15" : "border-line bg-white"}`}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <input ref={modeRef} type="hidden" name="mode" defaultValue="send" />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setNote(false)} className={`badge ${!note ? "border-ink bg-ink text-ivory" : "border-line"}`}>Ответ клиенту</button>
        <button type="button" onClick={() => setNote(true)} className={`badge ${note ? "border-champagne-dark bg-champagne text-ink" : "border-line"}`}>Заметка для команды</button>
        <select
          aria-label="Шаблон ответа"
          className="min-h-9 border border-line bg-white px-2 py-1 text-xs sm:ml-auto"
          value=""
          onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            if (t) setText((prev) => (prev ? prev + "\n" : "") + render(t.text));
          }}
        >
          <option value="">Шаблоны…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.title}{t.shortcut ? ` · ${t.shortcut}` : ""}</option>)}
        </select>
      </div>
      <textarea
        name="text"
        rows={3}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit(note ? "note" : "send");
          }
        }}
        placeholder={note ? "Видно только сотрудникам" : "Ответ… (/команда — шаблон, Ctrl+Enter — отправить)"}
        className="input resize-y"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {note ? (
          <button type="button" disabled={pending || !text.trim()} onClick={() => submit("note")} className="btn-outline btn-sm">Сохранить заметку</button>
        ) : (
          <>
            <button type="button" disabled={pending || !text.trim()} onClick={() => submit("send")} className="btn-primary btn-sm">Отправить</button>
            <button type="button" disabled={pending || !text.trim()} onClick={() => submit("close")} className="btn-outline btn-sm">Отправить и закрыть</button>
          </>
        )}
        {hint && <span className="text-xs text-muted">{hint}</span>}
        {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

export function MarkRead({ id, unread }: { id: string; unread: number }) {
  useEffect(() => {
    if (unread > 0) void markReadAction(id);
  }, [id, unread]);
  return null;
}

export function ScrollToBottom({ dep }: { dep: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [dep]);
  return <div ref={ref} />;
}

export function LinkCustomerForm({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(linkCustomerAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex gap-2">
        <input name="query" placeholder="Email или телефон" className="input py-2" />
        <button className="btn-outline btn-sm" disabled={pending}>Связать</button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function SimulateForm() {
  const [state, action, pending] = useActionState(simulateInboundAction, undefined);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-[140px_1fr_1fr_2fr_auto]">
      <select aria-label="Канал" name="channel" className="input py-2" defaultValue="TELEGRAM">
        {Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <input name="name" placeholder="Имя" className="input py-2" />
      <input name="handle" placeholder="Телефон, email или @ник" className="input py-2" />
      <input name="text" placeholder="Например: где мой заказ №12? нужен возврат" className="input py-2" />
      <button className="btn-outline btn-sm" disabled={pending}>Получить</button>
      {(state?.error || state?.message) && <p className={`text-xs md:col-span-5 ${state.error ? "text-danger" : "text-success"}`}>{state.error ?? state.message}</p>}
    </form>
  );
}

export function TemplateForm({ t }: { t?: Template }) {
  const [state, action, pending] = useActionState(saveTemplateAction, undefined);
  return (
    <form action={action} className="space-y-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
        <input name="title" defaultValue={t?.title} placeholder="Название" className="input py-2" />
        <input name="shortcut" defaultValue={t?.shortcut ?? ""} placeholder="/команда" className="input py-2" />
      </div>
      <textarea name="text" defaultValue={t?.text} rows={3} placeholder="Текст. Переменные: {имя} {уровень} {баллы} {заказ}" className="input" />
      <button className="btn-outline btn-sm" disabled={pending}>{t ? "Сохранить" : "Добавить шаблон"}</button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
