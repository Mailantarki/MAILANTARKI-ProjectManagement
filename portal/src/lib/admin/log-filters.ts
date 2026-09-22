import { z } from "zod";

const schema = z.object({
  userId: z.uuid().optional(),
  codeId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  documentId: z.uuid().optional(),
  action: z.enum(["login", "code_redeem", "view", "download"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export type LogFilters = z.infer<typeof schema>;

export function parseLogFilters(search: Record<string, string | string[] | undefined>): LogFilters {
  const values = Object.fromEntries(Object.entries(search).map(([key, value]) =>
    [key, typeof value === "string" ? value || undefined : undefined]));
  const result = schema.safeParse(values);
  if (result.success) return result.data;
  const valid: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = values[key];
    if (typeof value !== "string") continue;
    if (z.object({ [key]: schema.shape[key as keyof typeof schema.shape] }).safeParse({ [key]: value }).success) valid[key] = value;
  }
  return schema.parse(valid);
}

type Filterable = {
  eq(column: string, value: string): Filterable;
  gte(column: string, value: string): Filterable;
  lt(column: string, value: string): Filterable;
};

export function applyLogFilters<T>(query: T, filters: LogFilters): T {
  let filtered = query as unknown as Filterable;
  if (filters.userId) filtered = filtered.eq("user_id", filters.userId);
  if (filters.codeId) filtered = filtered.eq("access_code_id", filters.codeId);
  if (filters.projectId) filtered = filtered.eq("project_id", filters.projectId);
  if (filters.documentId) filtered = filtered.eq("document_id", filters.documentId);
  if (filters.action) filtered = filtered.eq("action", filters.action);
  if (filters.from) filtered = filtered.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) filtered = filtered.lt("created_at", new Date(Date.parse(`${filters.to}T00:00:00.000Z`) + 86400000).toISOString());
  return filtered as T;
}
