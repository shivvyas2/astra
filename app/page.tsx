import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CTA } from "@/components/marketing/CTA";

export default async function Landing() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/app");
  return (
    <>
      <Hero />
      <HowItWorks />
      <CTA />
    </>
  );
}
