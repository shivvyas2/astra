import { AuthForm } from "@/components/AuthForm";
import { authenticate, sendMagicLink } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AuthForm
      title="Welcome to Astra"
      subtitle="Enter your email and password. New here? We'll create your account automatically."
      primaryLabel="Continue"
      primaryAction={authenticate}
      magicAction={sendMagicLink}
      error={sp.error}
      notice={sp.sent ? "Check your email for a magic link." : undefined}
      footer={<>For guidance and reflection. Not a substitute for professional advice.</>}
    />
  );
}
