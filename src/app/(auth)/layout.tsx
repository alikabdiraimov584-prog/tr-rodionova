import Link from "next/link";
import { Logo, Monogram } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-taupe p-12 text-ivory md:flex">
        <Logo className="text-3xl text-ivory" />
        <div>
          <Monogram className="text-[9rem] leading-none text-ivory/70" />
          <p className="serif mt-6 max-w-sm text-3xl leading-tight">A woman who chooses more</p>
        </div>
        <div className="text-[0.62rem] uppercase tracking-[0.3em] text-ivory/70">Premium womenswear</div>
      </div>
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="mb-10 md:hidden"><Logo /></Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
