import { z } from "zod";
const fields = {
  q: z.string().trim().max(120), role: z.enum(["", "super_admin", "org_admin", "member"]),
  status: z.enum(["", "active", "suspended", "pending"]), projectId: z.uuid(), organizationId: z.uuid(),
  page: z.coerce.number().int().min(1).max(100000),
};
export function parseUserFilters(raw: Record<string, string | string[] | undefined>) {
  const parsed: Partial<{ [K in keyof typeof fields]: z.infer<(typeof fields)[K]> }> = {};
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const value = fields[key].safeParse(raw[key]);
    if (value.success) Object.assign(parsed, { [key]: value.data });
  }
  return parsed;
}
export const directorySchema = z.object({
  total: z.number(), page: z.number(), users: z.array(z.object({
    id: z.uuid(), full_name: z.string(), role: z.enum(["super_admin", "org_admin", "member"]),
    organization_id: z.uuid().nullable(), organization_name: z.string().nullable(), email: z.string(),
    suspended_at: z.string().nullable(), must_change_password: z.boolean(),
    last_sign_in_at: z.string().nullable(), project_count: z.number(),
  })),
});
