"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { previewAudienceAction, saveCampaignAction, sendTestAction } from "@/app/actions/crm-campaigns";
import type { Segment } from "@/lib/campaigns";
import { CHANNEL } from "@/lib/labels";
import { SEGMENTS } from "@/lib/rfm";

type Opts = { tiers: { code: string; name: string }[]; sources: string[]; tags: string[]; products: { id: string; name: string }[]; categories: { id: string; name: string }[]; presets: { key: string; name: string; hint: string; segment: Segment }[] };
type C = { id?: string; name?: string; channel?: string; subject?: string | null; text?: string; segment?: Segment; scheduledAt?: string | null; trackingLinkId?: string | null };

const CHANNELS = ["EMAIL", "TELEGRAM", "WHATSAPP", "SMS", "WEBSITE"] as const;
const LIMITS: Record<string, string> = {
  EMAIL: "Письмо через Postmark, с ссылкой отписки.",
  TELEGRAM: "Только тем, кто писал боту (есть chat id).",
  WHATSAPP: "Инициировать диалог можно только утверждённым шаблоном Meta. Через Wazzup — обычное сообщение.",
  SMS: "До 300 символов, оплата за сегмент. Имя отправителя регистрируется у оператора.",
  WEBSITE: "Сообщение в чат личного кабинета. Работает всегда, согласие на рекламу не требуется для сервисных.",
};

export function CampaignForm({ c, opts }: { c?: C; opts: Opts }) {
  const [state, action, pending] = useActionState(saveCampaignAction, undefined);
  const [test, testAction, testPending] = useActionState(sendTestAction, undefined);
  const [channel, setChannel] = useState(c?.channel ?? "EMAIL");
  const [seg, setSeg] = useState<Segment>(c?.segment ?? {});
  const [text, setText] = useState(c?.text ?? "");
  const [subject, setSubject] = useState(c?.subject ?? "");
  const [preview, setPreview] = useState<{ total: number; noAddress: number; sample: string[] } | null>(null);
  const [quoting, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => start(async () => setPreview(await previewAudienceAction(seg, channel as "EMAIL"))), 300);
    return () => clearTimeout(t);
  }, [seg, channel]);

  const toggle = (k: keyof Segment, v: string) =>
    setSeg((s) => {
      const arr = new Set((s[k] as string[] | undefined) ?? []);
      if (arr.has(v)) arr.delete(v);
      else arr.add(v);
      return { ...s, [k]: [...arr] };
    });
  const num = (k: keyof Segment) => (e: React.ChangeEvent<HTMLInputElement>) => setSeg((s) => ({ ...s, [k]: Number(e.target.value) || undefined }));
  const bool = (k: keyof Segment) => (e: React.ChangeEvent<HTMLInputElement>) => setSeg((s) => ({ ...s, [k]: e.target.checked || undefined }));
  const submit = (mode: "draft" | "schedule" | "send") => {
    if (mode === "send" && !window.confirm(`Отправить сейчас ${preview?.total ?? 0} получателям через ${CHANNEL[channel as "EMAIL"].label}?`)) return;
    if (modeRef.current) modeRef.current.value = mode;
    formRef.current?.requestSubmit();
  };
  const insert = (v: string) => setText((t) => t + v);

  return (
    <form ref={formRef} action={action} className="grid gap-6 xl:grid-cols-[1fr_380px] [&>*]:min-w-0">
      {c?.id && <input type="hidden" name="id" value={c.id} />}
      {c?.trackingLinkId && <input type="hidden" name="trackingLinkId" value={c.trackingLinkId} />}
      <input ref={modeRef} type="hidden" name="mode" defaultValue="draft" />
      {/* сегмент передаём и полями, и как есть */}
      {(seg.tiers ?? []).map((v) => <input key={v} type="hidden" name="tiers" value={v} />)}
      {(seg.rfm ?? []).map((v) => <input key={v} type="hidden" name="rfm" value={v} />)}
      {(seg.sources ?? []).map((v) => <input key={v} type="hidden" name="sources" value={v} />)}
      {(seg.sizes ?? []).map((v) => <input key={v} type="hidden" name="sizes" value={v} />)}

      <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <div className="eyebrow">Сообщение</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Название рассылки</span><input name="name" defaultValue={c?.name} required className="input py-2" placeholder="Закрытый показ AW26" /></label>
            <label><span className="label">Канал</span>
              <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className="input py-2">
                {CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL[ch].label}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted">{LIMITS[channel]}</p>
          {channel === "EMAIL" && <label><span className="label">Тема письма</span><input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="input py-2" /></label>}
          <label>
            <span className="label">Текст · {text.length} симв.</span>
            <textarea name="text" rows={7} value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="{имя}, в четверг открываем предзаказ коллекции для Privé…" />
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {["{имя}", "{уровень}", "{баллы}", "{ссылка}"].map((v) => <button key={v} type="button" onClick={() => insert(v)} className="badge border-line hover:bg-ivory">{v}</button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex gap-2 text-sm"><input type="checkbox" name="withLink" defaultChecked={!!c?.trackingLinkId || !c} className="accent-black" /> Создать трекинговую ссылку для {"{ссылка}"} (клики, заказы, выручка)</label>
            <label><span className="label">Куда ведёт ссылка</span><input name="linkTarget" defaultValue="/catalog" className="input py-2" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button type="button" formAction={testAction} onClick={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("channel", channel); fd.set("text", text); fd.set("subject", subject); (testAction as unknown as (f: FormData) => void)(fd); }} className="btn-outline btn-sm" disabled={testPending}>Тест себе</button>
            {test?.error && <span className="text-xs text-danger">{test.error}</span>}
            {test?.message && <span className="text-xs text-success">{test.message}</span>}
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3"><div className="eyebrow">Аудитория</div>
            <select className="ml-auto min-w-0 max-w-full border border-line bg-white px-2 py-1 text-xs" value="" onChange={(e) => { const p = opts.presets.find((x) => x.key === e.target.value); if (p) setSeg(p.segment); }}>
              <option value="">Готовые сегменты…</option>
              {opts.presets.map((p) => <option key={p.key} value={p.key}>{p.name} — {p.hint}</option>)}
            </select>
          </div>
          <div>
            <span className="label">Уровень Circle</span>
            <div className="flex flex-wrap gap-2">{opts.tiers.map((t) => <label key={t.code} className={`badge cursor-pointer ${seg.tiers?.includes(t.code) ? "border-ink bg-ink text-ivory" : "border-line"}`}><input type="checkbox" className="hidden" checked={!!seg.tiers?.includes(t.code)} onChange={() => toggle("tiers", t.code)} />{t.name}</label>)}</div>
          </div>
          <div>
            <span className="label">RFM-сегмент</span>
            <div className="flex flex-wrap gap-2">{Object.values(SEGMENTS).map((s) => <label key={s.code} className={`badge cursor-pointer ${seg.rfm?.includes(s.code) ? "border-ink bg-ink text-ivory" : "border-line"}`}><input type="checkbox" className="hidden" checked={!!seg.rfm?.includes(s.code)} onChange={() => toggle("rfm", s.code)} />{s.label}</label>)}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label><span className="label">Теги через запятую</span><input name="tags" defaultValue={(seg.tags ?? []).join(", ")} onBlur={(e) => setSeg((s) => ({ ...s, tags: e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) }))} className="input py-2" /></label>
            <label><span className="label">Источник</span>
              <select onChange={(e) => setSeg((s) => ({ ...s, sources: e.target.value ? [e.target.value] : [] }))} value={seg.sources?.[0] ?? ""} className="input py-2"><option value="">Любой</option>{opts.sources.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label><span className="label">Размер</span>
              <select onChange={(e) => setSeg((s) => ({ ...s, sizes: e.target.value ? [e.target.value] : [] }))} value={seg.sizes?.[0] ?? ""} className="input py-2"><option value="">Любой</option>{["XS", "S", "M", "L", "XL"].map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label><span className="label">Покупок от, ₽</span><input name="minLifetime" type="number" defaultValue={seg.minLifetime ?? ""} onChange={num("minLifetime")} className="input py-2" /></label>
            <label><span className="label">Покупок до, ₽</span><input name="maxLifetime" type="number" defaultValue={seg.maxLifetime ?? ""} onChange={num("maxLifetime")} className="input py-2" /></label>
            <label><span className="label">Баллов на счету от</span><input name="hasPoints" type="number" defaultValue={seg.hasPoints ?? ""} onChange={num("hasPoints")} className="input py-2" /></label>
            <label><span className="label">Последний заказ ≥ дней назад</span><input name="lastOrderMinDays" type="number" defaultValue={seg.lastOrderMinDays ?? ""} onChange={num("lastOrderMinDays")} className="input py-2" /></label>
            <label><span className="label">Последний заказ ≤ дней назад</span><input name="lastOrderMaxDays" type="number" defaultValue={seg.lastOrderMaxDays ?? ""} onChange={num("lastOrderMaxDays")} className="input py-2" /></label>
            <label><span className="label">Регистрация за N дней</span><input name="registeredDays" type="number" defaultValue={seg.registeredDays ?? ""} onChange={num("registeredDays")} className="input py-2" /></label>
            <label><span className="label">Баллы сгорают в N дней</span><input name="pointsExpiringDays" type="number" defaultValue={seg.pointsExpiringDays ?? ""} onChange={num("pointsExpiringDays")} className="input py-2" /></label>
            <label><span className="label">Месяц рождения</span>
              <select name="birthdayMonth" value={seg.birthdayMonth ?? ""} onChange={(e) => setSeg((s) => ({ ...s, birthdayMonth: Number(e.target.value) || undefined }))} className="input py-2"><option value="">Любой</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2026, i, 1).toLocaleDateString("ru-RU", { month: "long" })}</option>)}</select>
            </label>
            <label><span className="label">Покупали товар</span>
              <select name="productBought" value={seg.productBought ?? ""} onChange={(e) => setSeg((s) => ({ ...s, productBought: e.target.value || undefined }))} className="input py-2"><option value="">—</option>{opts.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label><span className="label">Покупали категорию</span>
              <select name="categoryBought" value={seg.categoryBought ?? ""} onChange={(e) => setSeg((s) => ({ ...s, categoryBought: e.target.value || undefined }))} className="input py-2"><option value="">—</option>{opts.categories.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label><span className="label">Смотрели товар (30 дн.)</span>
              <select name="viewedProductId" value={seg.viewedProductId ?? ""} onChange={(e) => setSeg((s) => ({ ...s, viewedProductId: e.target.value || undefined }))} className="input py-2"><option value="">—</option>{opts.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex gap-2"><input type="checkbox" name="waitlist" checked={!!seg.waitlist} onChange={bool("waitlist")} className="accent-black" /> Ждут поступления</label>
            <label className="flex gap-2"><input type="checkbox" name="wishlist" checked={!!seg.wishlist} onChange={bool("wishlist")} className="accent-black" /> Есть избранное</label>
            <label className="flex gap-2"><input type="checkbox" name="cartAbandoned" checked={!!seg.cartAbandoned} onChange={bool("cartAbandoned")} className="accent-black" /> Брошенная корзина</label>
            <label className="flex gap-2"><input type="checkbox" name="transactional" checked={seg.marketing === false} onChange={(e) => setSeg((s) => ({ ...s, marketing: e.target.checked ? false : undefined }))} className="accent-black" /> Сервисное сообщение (без фильтра по согласию)</label>
          </div>
        </div>
      </div>

      <aside className="card h-fit space-y-4 p-5 xl:sticky xl:top-8">
        <div className="eyebrow">Получатели</div>
        <div className={`serif text-4xl ${quoting ? "opacity-50" : ""}`}>{preview?.total ?? "…"}</div>
        {preview && preview.noAddress > 0 && <p className="text-xs text-warning">{preview.noAddress} без адреса в этом канале — будут пропущены</p>}
        <ul className="space-y-1 text-xs text-muted">{preview?.sample.map((s) => <li key={s}>{s}</li>)}{preview && preview.total > preview.sample.length && <li>… и ещё {preview.total - preview.sample.length}</li>}</ul>
        <div className="border-t border-line pt-4">
          <label><span className="label">Запланировать на</span><input name="scheduledAt" type="datetime-local" defaultValue={c?.scheduledAt ?? ""} className="input py-2" /></label>
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="grid gap-2">
          <button type="button" onClick={() => submit("send")} className="btn-primary" disabled={pending || !preview?.total}>{pending ? "Отправляем…" : "Отправить сейчас"}</button>
          <button type="button" onClick={() => submit("schedule")} className="btn-outline" disabled={pending}>Запланировать</button>
          <button type="button" onClick={() => submit("draft")} className="btn-ghost btn-sm" disabled={pending}>Сохранить черновик</button>
        </div>
        <p className="text-[0.7rem] text-muted">Рекламные рассылки уходят только клиенткам с согласием (38-ФЗ). Ответ «СТОП» или ссылка в письме отписывает автоматически.</p>
      </aside>
    </form>
  );
}
