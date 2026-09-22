import "server-only";
import { createHmac } from "node:crypto";
import { getServerEnv } from "../env";

export function hashCode(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHmac("sha256", getServerEnv().ACCESS_CODE_PEPPER).update(normalized).digest("hex");
}
