import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { applyLogFilters, parseLogFilters } from "@/lib/admin/log-filters";
import { csvRow } from "@/lib/admin/log-csv";

export async function GET(request: Request) {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) return new Response(null, { status: 404 });
  const filters = parseLogFilters(Object.fromEntries(new URL(request.url).searchParams));
  const user = await getUserClient();
  const encoder = new TextEncoder();
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvRow(["Time", "User ID", "Code ID", "Project", "Action", "Document", "Number", "IP"])));
        while (true) {
          const { data, error } = await applyLogFilters(user.from("access_logs")
            .select("created_at,user_id,access_code_id,project_name,action,document_title,doc_number,ip"), filters)
            .order("created_at", { ascending: false }).range(offset, offset + 499);
          if (error) throw error;
          for (const row of data ?? []) controller.enqueue(encoder.encode(csvRow([
            row.created_at, row.user_id, row.access_code_id, row.project_name, row.action,
            row.document_title, row.doc_number, row.ip,
          ])));
          if (!data || data.length < 500) break;
          offset += data.length;
        }
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="access-logs.csv"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
