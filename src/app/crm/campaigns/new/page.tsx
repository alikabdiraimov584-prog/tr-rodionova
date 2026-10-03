import type { Metadata } from "next";
import { requireSection } from "@/lib/auth";
import { campaignOptions } from "@/lib/campaign-options";
import { PageTitle } from "@/components/ui";
import { CampaignForm } from "@/components/crm/campaign-form";

export const metadata: Metadata = { title: "Новая рассылка" };

export default async function NewCampaign() {
  await requireSection("campaigns");
  return (
    <div>
      <PageTitle title="Новая рассылка" />
      <CampaignForm opts={await campaignOptions()} />
    </div>
  );
}
