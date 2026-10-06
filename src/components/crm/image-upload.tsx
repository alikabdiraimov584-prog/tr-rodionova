"use client";

import { useActionState, useRef, useState } from "react";
import { uploadProductImagesAction } from "@/app/actions/crm-upload";

const MAX_FILE = 12 * 1024 * 1024;
const MAX_TOTAL = 60 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;

/**
 * Загрузка фото в карточку вещи одной кнопкой: «Загрузить фото» открывает выбор файлов (на телефоне — галерею
 * или камеру), выбранные кадры сразу уходят на сервер. Размер проверяется ещё в браузере, чтобы не ждать ответа
 * сервера ради «файл слишком большой».
 */
export function ImageUpload({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(uploadProductImagesAction, undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = `files-${productId}`;
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input
        id={id}
        name="files"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        disabled={pending}
        className="peer sr-only"
        onChange={(e) => {
          const input = e.currentTarget;
          const files = Array.from(input.files ?? []);
          if (files.length === 0) return;
          const tooBig = files.filter((f) => f.size > MAX_FILE).map((f) => f.name);
          const total = files.reduce((s, f) => s + f.size, 0);
          const error = tooBig.length ? `Больше 12 МБ: ${tooBig.join(", ")} — уменьшите или загрузите по одному` : total > MAX_TOTAL ? `Всего ${mb(total)}: за раз не больше 60 МБ, загрузите частями` : null;
          setProblem(error);
          if (error) input.value = "";
          else form.current?.requestSubmit();
        }}
      />
      <label htmlFor={id} aria-disabled={pending} className={`btn-primary btn-sm cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${pending ? "pointer-events-none opacity-60" : ""}`}>
        {pending ? "Загружаем…" : "Загрузить фото"}
      </label>
      <span className="text-xs text-muted">JPG, PNG, WEBP или AVIF до 12 МБ, можно несколько сразу</span>
      {problem && <span className="text-xs text-danger" role="alert">{problem}</span>}
      {!problem && state?.error && <span className="text-xs text-danger" role="alert">{state.error}</span>}
      {!problem && state?.message && <span className="text-xs text-success" role="status">{state.message}</span>}
    </form>
  );
}
