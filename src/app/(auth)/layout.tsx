import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="mb-6 md:mb-10"><Logo className="inline-block py-2" /></div>
      <div className="w-full max-w-sm border border-line bg-white p-5 sm:p-6 md:p-8">{children}</div>
    </div>
  );
}
