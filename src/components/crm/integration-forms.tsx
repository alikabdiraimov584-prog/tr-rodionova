"use client";

import { useActionState } from "react";
import { saveIntegrationAction, testIntegrationAction } from "@/app/actions/crm-integrations";
import type { ActionState } from "@/lib/action-result";

type Field = { key: string; label: string; secret?: boolean; hint?: string; placeholder?: string };

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return <p className={`text-sm ${s.error ? "text-danger" : "text-success"}`}>{s.error ?? s.message}</p>;
}

export function IntegrationForm({ integrationKey, fields, filled, enabled, hasTest }: { integrationKey: string; fields: Field[]; filled: Record<string, string | true>; enabled: boolean; hasTest: boolean }) {
  const [saveState, save, saving] = useActionState(saveIntegrationAction, undefined);
  const [testState, test, testing] = useActionState(testIntegrationAction, undefined);
  return (
    <div className="space-y-3">
      <form action={save} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="key" value={integrationKey} />
        {fields.map((f) => (
          <label key={f.key} className={f.key === "verification" || fields.length === 1 ? "sm:col-span-2" : ""}>
            <span className="label">{f.label}</span>
            <input
              name={f.key}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              defaultValue={f.secret ? "" : ((filled[f.key] as string | undefined) ?? "")}
              placeholder={f.secret && filled[f.key] ? "•••••• сохранён, введите новый чтобы заменить" : f.placeholder}
              className="input py-2 font-mono text-xs"
            />
            {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
            {f.secret && filled[f.key] && <label className="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name={`clear_${f.key}`} className="accent-black" /> удалить сохранённое значение</label>}
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={enabled} className="accent-black" /> Включена</label>
          <button className="btn-primary btn-sm" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
          <Msg s={saveState} />
        </div>
      </form>
      {hasTest && (
        <form action={test} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="key" value={integrationKey} />
          <button className="btn-outline btn-sm" disabled={testing}>{testing ? "Проверяем…" : "Проверить подключение"}</button>
          <Msg s={testState} />
        </form>
      )}
    </div>
  );
}
