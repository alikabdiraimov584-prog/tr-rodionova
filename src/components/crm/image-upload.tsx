"use client";

import { useActionState } from "react";
import { uploadProductImagesAction } from "@/app/actions/crm-upload";

export function ImageUpload({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(uploadProductImagesAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input id="files" name="files" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="text-xs" />
      <button className="btn-outline btn-sm" disabled={pending}>{pending ? "Загружаем…" : "Загрузить фото"}</button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.message && <span className="text-xs text-success">{state.message}</span>}
    </form>
  );
}
