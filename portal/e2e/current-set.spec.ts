import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { admin, createAuthProfile } from "../scripts/cli-common";

// SPEC-ui-ux Fase 2: the portal shows one current revision per number, the fixed link opens it,
// an older revision carries a warning, and "Make current" lets the admin choose explicitly.
// Digits only, so the upload test can read the number back from a file name.
const number = `CS-${10000 + randomBytes(2).readUInt16BE() % 90000}`;
const fixture = {
  projectId: "", segmentId: "", documents: {} as Record<string, string>, users: [] as string[],
  admin: { email: `cs-admin-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(24).toString("base64url") },
  member: { email: `cs-member-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(24).toString("base64url") },
};

async function publish(revision: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([400, 300]).drawText(`${number} Rev ${revision}`, { x: 40, y: 150, size: 24, font });
  const bytes = Buffer.from(await pdf.save());
  const id = randomUUID();
  const path = `projects/${fixture.projectId}/architecture/${id}.pdf`;
  await admin.from("documents").insert({ id, project_id: fixture.projectId, segment_id: fixture.segmentId,
    title: "Current set plan", doc_number: number, doc_type: "plan", revision, status: "issued_for_construction",
    file_path: path, file_size: bytes.length, upload_status: "pending" }).throwOnError();
  const { error } = await admin.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
  if (error) throw error;
  await admin.from("documents").update({ upload_status: "ready" }).eq("id", id).throwOnError();
  fixture.documents[revision] = id;
}

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

test.describe.serial("current set and revisions", () => {
  test.beforeAll(async () => {
    const { data: project } = await admin.from("projects").select("id,organization_id").eq("slug", "maylan-plaza").single();
    const { data: segment } = await admin.from("segments").select("id").eq("slug", "architecture").single();
    fixture.projectId = project!.id;
    fixture.segmentId = segment!.id;
    fixture.users.push(await createAuthProfile({ ...fixture.admin, fullName: "Current set admin", role: "org_admin", organizationId: project!.organization_id }));
    const memberId = await createAuthProfile({ ...fixture.member, fullName: "Current set member", role: "member", organizationId: project!.organization_id });
    fixture.users.push(memberId);
    await admin.from("user_project_access").insert({ user_id: memberId, project_id: project!.id, segment_id: segment!.id, can_download: false }).throwOnError();
    await publish("A");
    await publish("B");
  });

  test.afterAll(async () => {
    for (const id of Object.values(fixture.documents)) {
      const { data } = await admin.from("documents").select("file_path").eq("id", id).maybeSingle();
      if (data) await admin.storage.from("documents").remove([data.file_path]);
    }
    await admin.from("documents").update({ superseded_by: null }).in("id", Object.values(fixture.documents));
    await admin.from("documents").delete().in("id", Object.values(fixture.documents));
    for (const id of fixture.users) {
      await admin.from("user_project_access").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id, true);
    }
  });

  test("the portal lists the current revision and the fixed link opens it", async ({ page }) => {
    await signIn(page, fixture.member);
    await page.goto(`/projects/maylan-plaza?q=${number}`);
    const rows = page.locator("tbody tr", { hasText: number });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Rev B");
    await expect(rows.first().getByRole("link", { name: /1 earlier/ })).toBeVisible();

    await page.getByRole("link", { name: "All revisions" }).click();
    await expect(page.locator("tbody tr", { hasText: number })).toHaveCount(2);
    await expect(page.locator("tbody tr.is-superseded", { hasText: number })).toContainText("Rev A");

    await page.goto(`/projects/maylan-plaza/documents/${number}`);
    await expect(page).toHaveURL(new RegExp(`open=${fixture.documents.B}`));
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByRole("combobox", { name: "Revision" })).toHaveValue(fixture.documents.B);
    await expect(viewer.getByText("This revision was superseded")).toHaveCount(0);

    await page.goto(`/projects/maylan-plaza/documents/${number}?rev=a`);
    await expect(viewer.getByText(/This revision was superseded/)).toBeVisible();
    await viewer.getByRole("button", { name: "Open Rev B" }).click();
    await expect(viewer.getByText(/This revision was superseded/)).toHaveCount(0);
    await expect(viewer.getByRole("combobox", { name: "Revision" })).toHaveValue(fixture.documents.B);
  });

  test("a document link the member cannot see is not found", async ({ page }) => {
    await signIn(page, fixture.member);
    // The [slug] loading boundary streams the page, so the not-found UI arrives with a 200.
    await page.goto(`/projects/maylan-plaza/documents/NO-SUCH-${number}`);
    await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
    await page.goto(`/projects/maylan-plaza/documents/${number}`);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("the admin makes an earlier revision current", async ({ page }) => {
    await signIn(page, fixture.admin);
    await page.goto("/admin/projects/maylan-plaza/documents");
    const drawing = page.locator("tbody tr", { hasText: number }).first();
    await expect(drawing).toContainText("Rev B");
    // The history row follows its drawing row.
    const history = drawing.locator("xpath=following-sibling::tr[1]");
    await history.getByText("1 earlier revision").click();
    await history.getByRole("button", { name: "Make current" }).click();
    await page.getByRole("dialog", { name: "Make current" }).getByRole("button", { name: "Make current" }).click();
    await expect(page.locator("tbody tr", { hasText: number }).first()).toContainText("Rev A");

    const { data } = await admin.from("documents").select("id,is_current").in("id", Object.values(fixture.documents));
    expect(data?.find((row) => row.is_current)?.id).toBe(fixture.documents.A);
    await page.goto(`/projects/maylan-plaza?q=${number}`);
    await expect(page.locator("tbody tr", { hasText: number }).first()).toContainText("Rev A");
  });

  test("the upload review says what publishing each file will do", async ({ page }) => {
    await signIn(page, fixture.admin);
    await page.goto("/admin/projects/maylan-plaza/documents/new");
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);
    const buffer = Buffer.from(await pdf.save());
    await page.locator('input[type="file"]').setInputFiles([
      { name: `${number} Plan Rev C.pdf`, mimeType: "application/pdf", buffer },
      { name: `${number} Plan Rev B.pdf`, mimeType: "application/pdf", buffer },
    ]);
    const newer = page.getByRole("region", { name: `${number} Plan Rev C.pdf` });
    const clash = page.getByRole("region", { name: `${number} Plan Rev B.pdf` });
    // Rev A is current after the previous test.
    await expect(newer.getByText("New revision · Rev A becomes superseded")).toBeVisible();
    await expect(clash.getByText("Conflict: Rev B already exists")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish 1 file" })).toBeEnabled();
    await clash.getByRole("button", { name: "Use Rev D" }).click();
    await expect(clash.getByText("New revision · Rev C becomes superseded")).toBeVisible();
    await page.getByRole("button", { name: "Publish 2 files" }).click();
    await expect(page.getByText("2 files published.")).toBeVisible();

    const { data } = await admin.from("documents").select("id,revision,is_current").eq("project_id", fixture.projectId).eq("doc_number", number);
    for (const row of data ?? []) fixture.documents[row.revision] = row.id;
    expect(data?.find((row) => row.is_current)?.revision).toBe("D");
    expect(data?.map((row) => row.revision).sort()).toEqual(["A", "B", "C", "D"]);
  });
});
