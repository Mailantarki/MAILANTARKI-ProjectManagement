"use server";

import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";

export async function changeInitialPassword(form: FormData) {
  const input = z.object({ password: z.string().min(12).max(128), confirm: z.string() })
    .refine((value) => value.password === value.confirm, "Passwords do not match")
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!input.success) throw new Error("Use matching passwords of 12 to 128 characters.");
  const client = await getUserClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Please sign in again.");
  const { data: profile } = await client.from("profiles").select("suspended_at,must_change_password")
    .eq("id", user.id).maybeSingle();
  if (!profile || profile.suspended_at || !profile.must_change_password) throw new Error("Password change unavailable.");
  const { error: updateError } = await client.auth.updateUser({ password: input.data.password });
  if (updateError) throw new Error("Could not change password. Use a different password or sign in again.");
  // Auth's password-change trigger clears the requirement, never client metadata.
  const { data: updated } = await client.from("profiles").select("must_change_password,suspended_at")
    .eq("id", user.id).maybeSingle();
  if (!updated || updated.must_change_password || updated.suspended_at) throw new Error("Please sign in again.");
}
