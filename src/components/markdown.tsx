import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Минимальный рендер Markdown для статей журнала, SEO-текстов каталога и юридических документов:
 * заголовки, абзацы, маркированные и нумерованные списки, жирный, ссылки [текст](/адрес).
 */
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/;

function bold(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`} className="font-medium">{part.slice(2, -2)}</strong> : part,
  );
}

function inline(text: string): ReactNode[] {
  // ссылки: внутренние (/journal/…) — переходом внутри сайта, внешние — в новой вкладке; остальной текст — с жирным
  return text.split(/(\[[^\]]+\]\([^)\s]+\))/g).flatMap((part, i) => {
    const m = part.match(LINK);
    if (!m || m[0] !== part) return bold(part, `t${i}`);
    const [, label, href] = m;
    const cls = "underline underline-offset-4 hover:opacity-60";
    if (href.startsWith("/") && !href.startsWith("//")) return [<Link key={`l${i}`} href={href} className={cls}>{bold(label, `l${i}`)}</Link>];
    if (/^https?:\/\//.test(href)) return [<a key={`l${i}`} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{bold(label, `l${i}`)}</a>];
    if (/^mailto:/.test(href)) return [<a key={`l${i}`} href={href} className={cls}>{bold(label, `l${i}`)}</a>];
    return bold(label, `t${i}`);
  });
}

const BULLET = /^- /;
const NUMBERED = /^\d+\.\s/;

const ANCHORS: [RegExp, string][] = [
  [/программы лояльности/i, "loyalty"],
  [/^\d+\.\s*Согласие на обработку/i, "consent"],
  [/^\d+\.\s*Согласие на получение рекламных/i, "marketing"],
];

function anchor(title: string) {
  for (const [re, id] of ANCHORS) if (re.test(title)) return id;
  const m = title.match(/^(\d+)\./);
  if (m) return `section-${m[1]}`;
  return "h-" + title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r/g, "").split(/\n{2,}/);
  const out: ReactNode[] = [];
  const toc: { id: string; title: string }[] = [];
  blocks.forEach((block, i) => {
    const b = block.trim();
    if (!b) return;
    if (b.startsWith("# ")) {
      out.push(<h1 key={i}>{b.slice(2)}</h1>);
    } else if (b.startsWith("## ")) {
      const title = b.slice(3);
      const id = anchor(title);
      if (id) toc.push({ id, title });
      out.push(<h2 key={i} id={id} className="mt-12 scroll-mt-32">{title}</h2>);
    } else if (b.startsWith("### ")) {
      out.push(<h3 key={i} className="mt-8">{b.slice(4)}</h3>);
    } else {
      // абзац, за которым могут идти пункты списка: «- » — маркированный, «1. » — нумерованный
      const lines = b.split("\n").map((l) => l.trim());
      const head = lines.filter((l) => !BULLET.test(l) && !NUMBERED.test(l));
      const bullets = lines.filter((l) => BULLET.test(l));
      const numbered = lines.filter((l) => NUMBERED.test(l));
      if (head.length) out.push(<p key={i} className="my-3">{inline(head.join(" "))}</p>);
      if (bullets.length) out.push(<ul key={`${i}-l`} className="my-3 list-disc space-y-1.5 pl-6">{bullets.map((l, j) => <li key={j}>{inline(l.replace(BULLET, ""))}</li>)}</ul>);
      if (numbered.length) out.push(<ol key={`${i}-o`} className="my-3 list-decimal space-y-1.5 pl-6">{numbered.map((l, j) => <li key={j}>{inline(l.replace(NUMBERED, ""))}</li>)}</ol>);
    }
  });
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_260px]">
      <article className="min-w-0 text-[0.95rem] leading-relaxed text-ink/85">{out}</article>
      <nav className="hidden text-xs lg:block">
        <div className="sticky top-32 space-y-2">
          <div className="eyebrow mb-3">Содержание</div>
          {toc.map((t) => <a key={t.id} href={`#${t.id}`} className="block text-muted hover:text-ink">{t.title}</a>)}
        </div>
      </nav>
    </div>
  );
}
