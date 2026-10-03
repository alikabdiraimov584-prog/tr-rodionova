import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="mb-10"><Logo /></div>
      <div className="w-full max-w-sm border border-line bg-white p-6 md:p-8">{children}</div>
    </div>
  );
}
