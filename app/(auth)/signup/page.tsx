import { AuthForm } from "@/components/AuthForm";
import { authenticate, sendMagicLink } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AuthForm
      title="Create your account"
      subtitle="Enter your email and password to begin. Already have an account? This logs you in."
      primaryLabel="Continue"
      primaryAction={authenticate}
      magicAction={sendMagicLink}
      error={sp.error}
      footer={<>For guidance and reflection. Not a substitute for professional advice.</>}
    />
  );
}
