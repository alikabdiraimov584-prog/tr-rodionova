import Link from "next/link";
import { BrandLockup } from "@/components/brand-marks";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <Link href="/" aria-label="T.Rodionova — на главную" className="mb-6 block py-2 md:mb-10"><BrandLockup className="h-auto w-[230px] md:w-[280px]" /></Link>
      <div className="w-full max-w-sm border border-line bg-white p-5 sm:p-6 md:p-8">{children}</div>
    </main>
  );
}
