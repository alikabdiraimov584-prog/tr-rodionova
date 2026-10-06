"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { uploadProductImagesAction, type UploadResult } from "@/app/actions/crm-upload";

const MAX_FILE = 30 * 1024 * 1024;
/** Одна отправка — не больше 60 МБ (сервер принимает до 64 МБ за раз): большая подборка уходит частями. */
const MAX_PART = 60 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const PHOTO = /\.(jpe?g|png|webp|avif)$/i;
const HEIC = /\.(heic|heif)$/i;
const isPhoto = (f: File) => TYPES.has(f.type) || PHOTO.test(f.name);
const names = (fs: File[]) => fs.map((f) => f.name).join(", ");

function parts(files: File[]) {
  const out: File[][] = [];
  let cur: File[] = [];
  let size = 0;
  for (const f of files) {
    if (cur.length > 0 && size + f.size > MAX_PART) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += f.size;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
const isLink = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("text/uri-list") && !(e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]"));

type Status = { tone: "ok" | "warn" | "error"; text: string };

/**
 * Фото в карточку вещи: перетащить мышкой в любое место страницы (из папки «Загрузки», с рабочего стола или прямо
 * из списка загрузок браузера) или выбрать кнопкой. Файлы проверяются ещё в браузере, большая подборка уходит
 * на сервер частями, новые кадры встают в конец галереи.
 */
export function ImageUpload({ productId, productName }: { productId: string; productName: string }) {
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const id = `files-${productId}`;

  const upload = (list: File[]) => {
    if (list.length === 0) return;
    // две загрузки сразу перепутали бы порядок кадров в галерее
    if (pending) {
      setStatus({ tone: "warn", text: "Подождите: ещё загружаются предыдущие фото" });
      return;
    }
    const heic = list.filter((f) => HEIC.test(f.name) || /^image\/hei[cf]/.test(f.type));
    const photos = list.filter((f) => !heic.includes(f) && isPhoto(f));
    const other = list.filter((f) => !heic.includes(f) && !photos.includes(f));
    const big = photos.filter((f) => f.size > MAX_FILE);
    const ready = photos.filter((f) => f.size <= MAX_FILE);
    const skipped = [
      heic.length > 0 ? `формат HEIC с iPhone, сохраните как JPG: ${names(heic)}` : "",
      big.length > 0 ? `больше 30 МБ: ${names(big)}` : "",
      other.length > 0 ? `не фото JPG, PNG, WEBP или AVIF: ${names(other)}` : "",
    ].filter(Boolean).join("; ");
    if (ready.length === 0) {
      setStatus({ tone: "error", text: `Не загружено — ${skipped}` });
      return;
    }
    setStatus(null);
    const queue = parts(ready);
    // первая подпись — до перехода: обновления внутри него до первого await показываются только в конце
    setProgress(queue.length > 1 ? `часть 1 из ${queue.length}` : null);
    startTransition(async () => {
      let done = 0;
      for (const [i, part] of queue.entries()) {
        if (i > 0) setProgress(`часть ${i + 1} из ${queue.length}`);
        const fd = new FormData();
        fd.set("productId", productId);
        for (const f of part) fd.append("files", f);
        let r: UploadResult;
        try {
          r = await uploadProductImagesAction(fd);
        } catch {
          r = { error: "Нет связи с сервером: проверьте интернет и повторите" };
        }
        done += r.added ?? 0;
        if (r.error) {
          setProgress(null);
          setStatus({ tone: "error", text: done > 0 ? `${r.error}. Уже загружено: ${done}` : r.error });
          return;
        }
      }
      setProgress(null);
      setStatus({ tone: skipped ? "warn" : "ok", text: `Загружено фото: ${done}, они в конце галереи${skipped ? `. Пропущено — ${skipped}` : ""}` });
    });
  };

  const onDropFiles = useEffectEvent(upload);
  const onDropLink = useEffectEvent((e: DragEvent) => {
    const html = e.dataTransfer?.getData("text/html") ?? "";
    const url = e.dataTransfer?.getData("text/uri-list") ?? "";
    if (html.includes("<img") || /\.(jpe?g|png|webp|avif|heic)(\?|$)/i.test(url)) {
      setStatus({ tone: "error", text: "Это картинка с сайта, а не файл: сохраните её на компьютер и перетащите файл из «Загрузок»" });
    }
  });

  // страница товара целиком принимает файлы: браузер не открывает фото вместо загрузки
  useEffect(() => {
    let timer: number | undefined;
    const dragover = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setOver(true);
        // dragover идёт непрерывно, пока файл над окном: тишина значит «увели за окно» или Esc
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setOver(false), 250);
      } else if (isLink(e)) {
        e.preventDefault();
      }
    };
    const drop = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault();
        window.clearTimeout(timer);
        setOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) onDropFiles(files);
        else onDropLink(e);
      } else if (isLink(e)) {
        e.preventDefault();
        onDropLink(e);
      }
    };
    window.addEventListener("dragenter", dragover);
    window.addEventListener("dragover", dragover);
    window.addEventListener("drop", drop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("dragenter", dragover);
      window.removeEventListener("dragover", dragover);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div className={`rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${over ? "border-ink bg-sand" : "border-line"}`}>
      <p className="text-sm">Перетащите фото сюда — из папки «Загрузки» или прямо из списка загрузок браузера</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          disabled={pending}
          className="peer sr-only"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            // тот же файл можно выбрать ещё раз
            e.currentTarget.value = "";
            upload(files);
          }}
        />
        <label htmlFor={id} aria-disabled={pending} className={`btn-primary btn-sm cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${pending ? "pointer-events-none opacity-60" : ""}`}>
          {pending ? `Загружаем${progress ? `: ${progress}` : "…"}` : "Загрузить фото"}
        </label>
        <span className="text-xs text-muted">JPG, PNG, WEBP или AVIF до 30 МБ, можно несколько сразу</span>
      </div>
      {status && (
        <p role={status.tone === "error" ? "alert" : "status"} className={`mt-3 text-xs ${status.tone === "error" ? "text-danger" : status.tone === "warn" ? "text-warning" : "text-success"}`}>
          {status.text}
        </p>
      )}
      {over &&
        createPortal(
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-6">
            <div className="rounded-xl border-2 border-dashed border-white/80 bg-ink/90 px-10 py-12 text-center text-white shadow-2xl">
              <div className="text-lg font-semibold">Отпустите, чтобы загрузить</div>
              <div className="mt-1 text-sm opacity-90">фото добавятся в «{productName}»</div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
