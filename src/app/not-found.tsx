import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-10">Такой страницы нет</h1>
      <p className="mt-2 max-w-md text-sm text-muted">Возможно, вещь продана или ссылка устарела. Посмотрите каталог или напишите нам: care@tr-rodionova.ru</p>
      <div className="mt-6 flex gap-3"><Link href="/catalog" className="btn-primary">Каталог</Link><Link href="/" className="btn-outline">На главную</Link></div>
    </div>
  );
}
