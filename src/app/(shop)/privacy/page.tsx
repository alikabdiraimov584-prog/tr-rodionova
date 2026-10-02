import type { Metadata } from "next";
import { legalDoc } from "@/lib/legal";
import { Markdown } from "@/components/markdown";

export const metadata: Metadata = { title: "Политика обработки персональных данных" };

export default async function PrivacyPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
      <Markdown source={await legalDoc("privacy")} />
    </div>
  );
}
