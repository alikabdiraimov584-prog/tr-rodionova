import type { ReactNode } from "react";

/** Минимальный рендер Markdown для юридических документов: заголовки, абзацы, списки, жирный. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-medium">{part.slice(2, -2)}</strong> : part,
  );
}

const ANCHORS: [RegExp, string][] = [
  [/программы лояльности/i, "loyalty"],
  [/^\d+\.\s*Согласие на обработку/i, "consent"],
  [/^\d+\.\s*Согласие на получение рекламных/i, "marketing"],
];

function anchor(title: string) {
  for (const [re, id] of ANCHORS) if (re.test(title)) return id;
  const m = title.match(/^(\d+)\./);
  return m ? `section-${m[1]}` : undefined;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r/g, "").split(/\n{2,}/);
  const out: ReactNode[] = [];
  const toc: { id: string; title: string }[] = [];
  blocks.forEach((block, i) => {
    const b = block.trim();
    if (!b) return;
    if (b.startsWith("# ")) {
      out.push(<h1 key={i} className="text-4xl leading-tight md:text-5xl">{b.slice(2)}</h1>);
    } else if (b.startsWith("## ")) {
      const title = b.slice(3);
      const id = anchor(title);
      if (id) toc.push({ id, title });
      out.push(<h2 key={i} id={id} className="mt-12 scroll-mt-32 text-2xl">{title}</h2>);
    } else if (b.startsWith("### ")) {
      out.push(<h3 key={i} className="mt-8 text-xl">{b.slice(4)}</h3>);
    } else if (b.split("\n").every((l) => l.trim().startsWith("- "))) {
      out.push(
        <ul key={i} className="my-3 list-disc space-y-1.5 pl-6">
          {b.split("\n").map((l, j) => <li key={j}>{inline(l.trim().slice(2))}</li>)}
        </ul>,
      );
    } else {
      const lines = b.split("\n");
      const head = lines.filter((l) => !l.trim().startsWith("- "));
      const items = lines.filter((l) => l.trim().startsWith("- "));
      out.push(<p key={i} className="my-3">{inline(head.join(" "))}</p>);
      if (items.length) out.push(<ul key={`${i}-l`} className="my-3 list-disc space-y-1.5 pl-6">{items.map((l, j) => <li key={j}>{inline(l.trim().slice(2))}</li>)}</ul>);
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
