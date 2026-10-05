"use client";

import { useState } from "react";

export function CopyLink({ value, label = "Ссылка для копирования" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex gap-2">
      <input readOnly value={value} aria-label={label} className="input text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-outline btn-sm whitespace-nowrap"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* буфер обмена недоступен — пользователь скопирует вручную */
          }
        }}
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
