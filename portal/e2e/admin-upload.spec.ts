import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { admin, createAuthProfile } from "../scripts/cli-common";

const fixture = {
  userId: "", documentId: "", projectId: "",
  email: `upload-${randomBytes(8).toString("hex")}@example.test`,
  password: randomBytes(24).toString("base64url"),
  number: `UPLOAD-${randomBytes(6).toString("hex").toUpperCase()}`,
};

test.describe.serial("admin upload transition", () => {
  test.beforeAll(async () => {
    const { data: project, error } = await admin.from("projects").select("id,organization_id")
      .eq("slug", "maylan-plaza").single();
    if (error || !project) throw error ?? new Error("Project missing");
    fixture.projectId = project.id;
    fixture.userId = await createAuthProfile({ email: fixture.email, password: fixture.password,
      fullName: "Upload test admin", role: "org_admin", organizationId: project.organization_id });
  });

  test.afterAll(async () => {
    if (fixture.documentId) {
      const { data: document } = await admin.from("documents").select("file_path")
        .eq("id", fixture.documentId).single();
      if (document) await admin.storage.from("documents").remove([document.file_path]);
      await admin.from("documents").delete().eq("id", fixture.documentId);
    }
    if (fixture.userId) {
      const { error } = await admin.auth.admin.deleteUser(fixture.userId, true);
      if (error) throw error;
    }
  });

  test("prepare, upload and finalize make a private PDF visible", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await page.goto("/admin/projects/maylan-plaza/documents/new");
    await expect(page.getByRole("heading", { name: "Upload documents" })).toBeVisible();
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);
    const bytes = Buffer.from(await pdf.save());
    await page.locator('input[type="file"]').setInputFiles({
      name: `${fixture.number}.pdf`, mimeType: "application/pdf", buffer: bytes,
    });
    await expect(page.getByRole("cell", { name: `${fixture.number}.pdf` })).toBeVisible();
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Complete");

    const { data: document, error } = await admin.from("documents").select("id,upload_status,file_size")
      .eq("project_id", fixture.projectId).eq("doc_number", fixture.number).single();
    if (error || !document) throw error ?? new Error("Uploaded document missing");
    fixture.documentId = document.id;
    expect(document.upload_status).toBe("ready");
    expect(document.file_size).toBe(bytes.length);
    await page.goto("/projects/maylan-plaza");
    await expect(page.getByRole("cell", { name: fixture.number }).first()).toBeVisible();
  });
});
