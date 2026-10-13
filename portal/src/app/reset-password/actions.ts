"use server";

import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";

export async function resetPassword(form: FormData) {
  const input = z.object({ password: z.string().min(12).max(128), confirm: z.string() })
    .refine((value) => value.password === value.confirm, "Passwords do not match")
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!input.success) throw new Error("Use matching passwords of 12 to 128 characters.");
  const client = await getUserClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Your reset link has expired. Request a new one.");
  const { data: profile } = await client.from("profiles").select("suspended_at").eq("id", user.id).maybeSingle();
  if (!profile || profile.suspended_at) throw new Error("This account cannot sign in. Contact your administrator.");
  const { error: updateError } = await client.auth.updateUser({ password: input.data.password });
  if (updateError) throw new Error("Could not save the password. Use a different password or request a new link.");
}
