import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { CosmicLanding } from "@/components/marketing/CosmicLanding";

export default async function Landing() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/app");
  return <CosmicLanding />;
}
