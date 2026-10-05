"use client";

import Link from "next/link";

/** Сбой корневого макета: стили сайта недоступны, поэтому оформление встроено. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F3EC", color: "#141210", fontFamily: "Georgia, 'Times New Roman', serif", textAlign: "center", padding: "24px" }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ letterSpacing: "0.3em", fontSize: 14, textTransform: "uppercase" }}>T.Rodionova</div>
          <h1 style={{ fontWeight: 500, fontSize: 28, margin: "40px 0 8px" }}>Что-то пошло не так</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: "#5F5A52", margin: 0 }}>
            Сайт временно не открывается из-за ошибки на нашей стороне. Попробуйте ещё раз через минуту или напишите нам: care@tr-rodionova.ru
            {error.digest && <span style={{ display: "block", marginTop: 8, fontSize: 12, opacity: 0.7 }}>Код ошибки: {error.digest}</span>}
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={reset} style={{ font: "inherit", fontSize: 14, padding: "12px 22px", background: "#141210", color: "#F6F3EC", border: 0, cursor: "pointer" }}>Попробовать снова</button>
            <Link href="/" style={{ font: "inherit", fontSize: 14, padding: "12px 22px", border: "1px solid #141210", color: "#141210", textDecoration: "none" }}>На главную</Link>
          </div>
        </div>
      </body>
    </html>
  );
}
