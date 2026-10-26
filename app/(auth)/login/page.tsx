import { AuthForm } from "@/components/AuthForm";
import { getI18n } from "@/lib/i18n/server";
import { authErrorMessage } from "@/lib/i18n/errors";
import { authenticate, sendMagicLink, sendPhoneCode } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; method?: string }>;
}) {
  const sp = await searchParams;
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <AuthForm
      title={t.auth.loginTitle}
      subtitle={t.auth.loginSubtitle}
      primaryLabel={t.auth.continue}
      primaryAction={authenticate}
      magicAction={sendMagicLink}
      phoneAction={sendPhoneCode}
      from="login"
      method={sp.method === "phone" ? "phone" : "email"}
      error={sp.error ? authErrorMessage(i18n, sp.error) : undefined}
      notice={sp.sent ? t.auth.magicSent : undefined}
      footer={t.common.disclaimer}
    />
  );
}
