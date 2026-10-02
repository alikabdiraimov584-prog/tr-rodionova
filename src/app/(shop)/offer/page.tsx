import type { Metadata } from "next";
import { legalDoc } from "@/lib/legal";
import { Markdown } from "@/components/markdown";

export const metadata: Metadata = { title: "Публичная оферта" };

export default async function OfferPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <Markdown source={await legalDoc("offer")} />
    </div>
  );
}
