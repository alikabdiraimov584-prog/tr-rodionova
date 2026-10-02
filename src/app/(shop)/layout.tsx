import { ShopHeader, ShopFooter } from "@/components/shop/header";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <ShopHeader />
      <main className="flex-1">{children}</main>
      <ShopFooter />
    </>
  );
}
