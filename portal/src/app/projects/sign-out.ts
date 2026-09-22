"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserClient } from "../../lib/supabase/server";

export async function signOut() {
  const client = await getUserClient();
  await client.auth.signOut();
  (await cookies()).delete("visitor_session");
  redirect("/");
}
