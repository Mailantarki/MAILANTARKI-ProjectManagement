import "server-only";
import { getAdminClient } from "../supabase/admin";
import { hashCode } from "./hash";

export async function redeemCode(code: string) {
  const { data, error } = await getAdminClient().rpc("redeem_access_code", { p_hash: hashCode(code) });
  if (error) throw error;
  return data?.[0] ?? null;
}
