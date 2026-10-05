import { listConversations } from "@/lib/data/chat";
import { AppShell } from "@/components/AppShell";
import { AiConsentGate } from "@/components/consent/AiConsentGate";
import { CONSENT_VERSION } from "@/lib/billing/consent";
import { webConsentAccepted } from "@/lib/billing/webConsent";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // AI consent comes before intake and the first reading (App Store 5.1.2).
  if (!(await webConsentAccepted())) return <AiConsentGate version={CONSENT_VERSION} />;
  const conversations = await listConversations();
  return <AppShell conversations={conversations as never}>{children}</AppShell>;
}
