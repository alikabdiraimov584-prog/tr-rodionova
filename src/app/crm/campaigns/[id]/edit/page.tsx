import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { campaignOptions } from "@/lib/campaign-options";
import { PageTitle } from "@/components/ui";
import { CampaignForm } from "@/components/crm/campaign-form";
import type { Segment } from "@/lib/campaigns";

export default async function EditCampaign({ params }: PageProps<"/crm/campaigns/[id]/edit">) {
  await requireSection("campaigns");
  const { id } = await params;
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) notFound();
  if (c.status === "SENT" || c.status === "SENDING") redirect(`/crm/campaigns/${id}`);
  return (
    <div>
      <PageTitle title={c.name} eyebrow="Редактирование" />
      <CampaignForm
        opts={await campaignOptions()}
        c={{ id: c.id, name: c.name, channel: c.channel, subject: c.subject, text: c.text, segment: c.segment as Segment, trackingLinkId: c.trackingLinkId, scheduledAt: c.scheduledAt ? new Date(c.scheduledAt.getTime() - c.scheduledAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : null }}
      />
    </div>
  );
}
