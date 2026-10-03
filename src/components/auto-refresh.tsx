"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Мягко обновляет серверные данные страницы, пока вкладка активна. */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("textarea:focus:not(:placeholder-shown)")) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
