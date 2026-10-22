"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPerson, deletePerson, parsePersonInput, updatePerson } from "@/lib/profiles/store";

async function signedIn() {
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return { db, user };
}

/**
 * Back to the form with the message in the query string, which the page
 * shows in the reader's language (errors.ts): `write:<reason>` for a store
 * failure, or the parser's English for a field.
 */
function back(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createPersonAction(formData: FormData) {
  const { db, user } = await signedIn();
  const parsed = parsePersonInput(formData);
  if (!parsed.ok) back("/app/profiles/new", parsed.error);
  const result = await createPerson(db, user.id, parsed.value);
  if (!result.ok) back("/app/profiles/new", `write:${result.reason}`);
  revalidatePath("/app/profiles");
  redirect(`/app/profiles/${result.person.id}`);
}

export async function updatePersonAction(id: string, formData: FormData) {
  const { db, user } = await signedIn();
  const parsed = parsePersonInput(formData);
  if (!parsed.ok) back(`/app/profiles/${id}`, parsed.error);
  const result = await updatePerson(db, user.id, id, parsed.value);
  if (!result.ok) back(`/app/profiles/${id}`, `write:${result.reason}`);
  revalidatePath("/app/profiles");
  revalidatePath(`/app/profiles/${id}`);
  redirect(`/app/profiles/${id}?saved=1`);
}

export async function deletePersonAction(id: string) {
  const { db, user } = await signedIn();
  const result = await deletePerson(db, user.id, id);
  if (!result.ok && result.reason !== "not_found") back(`/app/profiles/${id}`, `write:${result.reason}`);
  revalidatePath("/app/profiles");
  redirect("/app/profiles");
}
