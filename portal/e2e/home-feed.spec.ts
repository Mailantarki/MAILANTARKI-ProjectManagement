import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { admin, createAuthProfile } from "../scripts/cli-common";

// SPEC-ui-ux Fase 5: Home lists what changed since the last visit, the project marks the changed
// drawings, and "Mark all as seen" clears both.
const number = `HF-${10000 + randomBytes(2).readUInt16BE() % 90000}`;
const fixture = {
  userId: "", projectId: "", otherProjectId: "", segmentId: "", documents: [] as string[],
  email: `hf-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(24).toString("base64url"),
};

async function publish(revision: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 200]);
  const bytes = Buffer.from(await pdf.save());
  const id = randomUUID();
  const path = `projects/${fixture.projectId}/architecture/${id}.pdf`;
  await admin.from("documents").insert({ id, project_id: fixture.projectId, segment_id: fixture.segmentId,
    title: "Feed test plan", doc_number: number, doc_type: "plan", revision, status: "for_review",
    file_path: path, file_size: bytes.length, upload_status: "pending" }).throwOnError();
  const { error } = await admin.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
  if (error) throw error;
  await admin.from("documents").update({ upload_status: "ready" }).eq("id", id).throwOnError();
  fixture.documents.push(id);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

test.describe.serial("updates since the last visit", () => {
  test.beforeAll(async () => {
    const { data: projects } = await admin.from("projects").select("id,slug,organization_id").in("slug", ["maylan-plaza", "daige-residences"]);
    const plaza = projects!.find((p) => p.slug === "maylan-plaza")!;
    fixture.projectId = plaza.id;
    fixture.otherProjectId = projects!.find((p) => p.slug === "daige-residences")!.id;
    const { data: segment } = await admin.from("segments").select("id").eq("slug", "architecture").single();
    fixture.segmentId = segment!.id;
    fixture.userId = await createAuthProfile({ email: fixture.email, password: fixture.password, fullName: "Feed Member",
      role: "member", organizationId: plaza.organization_id });
    await admin.from("user_project_access").insert([
      { user_id: fixture.userId, project_id: fixture.projectId, segment_id: fixture.segmentId, can_download: false },
      { user_id: fixture.userId, project_id: fixture.otherProjectId, segment_id: null, can_download: false },
    ]).throwOnError();
    // The last visit was two days ago; Rev A came before it, Rev B after.
    await publish("A");
    await admin.from("document_events").update({ created_at: new Date(Date.now() - 3 * 86400_000).toISOString() })
      .eq("document_id", fixture.documents[0]).throwOnError();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
    await admin.from("user_project_visits").insert([
      { user_id: fixture.userId, project_id: fixture.projectId, previous_seen_at: null, last_seen_at: twoDaysAgo },
      { user_id: fixture.userId, project_id: fixture.otherProjectId, previous_seen_at: null, last_seen_at: twoDaysAgo },
    ]).throwOnError();
    await publish("B");
  });

  test.afterAll(async () => {
    for (const id of fixture.documents) {
      const { data } = await admin.from("documents").select("file_path").eq("id", id).maybeSingle();
      if (data) await admin.storage.from("documents").remove([data.file_path]);
    }
    await admin.from("documents").update({ superseded_by: null }).in("id", fixture.documents);
    await admin.from("documents").delete().in("id", fixture.documents);
    await admin.from("user_project_access").delete().eq("user_id", fixture.userId);
    await admin.auth.admin.deleteUser(fixture.userId, true);
  });

  test("Home lists the new revision and the project marks it", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Welcome back, Feed" })).toBeVisible();
    await expect(page.getByText(/1 update in 1 project since your last visit/)).toBeVisible();
    const update = page.getByRole("link", { name: new RegExp(`${number}.*New revision · Rev B`) });
    await expect(update).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByLabel("1 new")).toBeVisible();

    await page.goto("/projects/maylan-plaza");
    await expect(page.getByText("1 change since your last visit.")).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: number }).getByText("Updated")).toBeVisible();
    await page.getByRole("link", { name: "Show only these" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.goto("/projects");
    await page.getByRole("button", { name: "Mark all as seen" }).click();
    await expect(page.getByText("You're up to date.", { exact: false })).toBeVisible();
    await expect(update).toHaveCount(0);
  });

  test("recently viewed lists the opened drawing", async ({ page }) => {
    await signIn(page);
    // The view is logged when the viewer asks for the file.
    const opened = page.waitForResponse((r) => r.url().includes("/url?download=0") && r.status() === 200);
    await page.goto(`/projects/maylan-plaza/documents/${number}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await opened;
    await page.goto("/projects");
    await expect(page.getByRole("region", { name: "Recently viewed" }).getByRole("link", { name: new RegExp(number) })).toBeVisible();
  });
});
