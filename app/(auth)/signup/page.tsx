import { AuthForm } from "@/components/AuthForm";
import { getI18n } from "@/lib/i18n/server";
import { authErrorMessage } from "@/lib/i18n/errors";
import { authenticate, sendMagicLink } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <AuthForm
      title={t.auth.signupTitle}
      subtitle={t.auth.signupSubtitle}
      primaryLabel={t.auth.continue}
      primaryAction={authenticate}
      magicAction={sendMagicLink}
      error={sp.error ? authErrorMessage(i18n, sp.error) : undefined}
      footer={t.common.disclaimer}
    />
  );
}
