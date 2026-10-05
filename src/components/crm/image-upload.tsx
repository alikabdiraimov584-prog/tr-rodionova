"use client";

import { useActionState, useState } from "react";
import { uploadProductImagesAction } from "@/app/actions/crm-upload";

const MAX_FILE = 12 * 1024 * 1024;
const MAX_TOTAL = 60 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;

/** Загрузка фото в карточку вещи. Размер проверяется ещё в браузере, чтобы не ждать ответа сервера ради «файл слишком большой». */
export function ImageUpload({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(uploadProductImagesAction, undefined);
  const [picked, setPicked] = useState<{ count: number; total: number; tooBig: string[] }>({ count: 0, total: 0, tooBig: [] });
  const blocked = picked.tooBig.length > 0 || picked.total > MAX_TOTAL;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input
        id="files"
        name="files"
        type="file"
        aria-label="Файлы фото"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="text-xs"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          setPicked({ count: files.length, total: files.reduce((s, f) => s + f.size, 0), tooBig: files.filter((f) => f.size > MAX_FILE).map((f) => f.name) });
        }}
      />
      <button className="btn-outline btn-sm" disabled={pending || blocked}>{pending ? "Загружаем…" : "Загрузить фото"}</button>
      {picked.count > 0 && !blocked && <span className="text-xs text-muted">{picked.count} файл(ов), {mb(picked.total)}</span>}
      {picked.tooBig.length > 0 && <span className="text-xs text-danger">Больше 12 МБ: {picked.tooBig.join(", ")} — уменьшите или загрузите по одному</span>}
      {picked.tooBig.length === 0 && picked.total > MAX_TOTAL && <span className="text-xs text-danger">Всего {mb(picked.total)}: за раз не больше 60 МБ, загрузите частями</span>}
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="text-xs text-success">{state.message}</span>}
    </form>
  );
}
