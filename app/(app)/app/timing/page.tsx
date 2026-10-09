import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadTiming } from "@/lib/timing/load";
import { KeyDates } from "@/components/KeyDates";

export const dynamic = "force-dynamic";

export default async function KeyDatesPage() {
  const timing = await loadTiming(await createServerSupabase());
  if (!timing) redirect("/app/intake");
  return <KeyDates timing={timing} />;
}
