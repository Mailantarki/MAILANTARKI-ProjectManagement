import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { admin, createAuthProfile } from "../scripts/cli-common";

const fixture = {
  userId: "", documentId: "", retryDocumentId: "", projectId: "",
  email: `upload-${randomBytes(8).toString("hex")}@example.test`,
  password: randomBytes(24).toString("base64url"),
  number: `UPLOAD-${randomBytes(6).toString("hex").toUpperCase()}`,
  retryNumber: `RETRY-${randomBytes(6).toString("hex").toUpperCase()}`,
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
    for (const documentId of [fixture.documentId, fixture.retryDocumentId].filter(Boolean)) {
      const { data: document } = await admin.from("documents").select("file_path")
        .eq("id", documentId).single();
      if (document) await admin.storage.from("documents").remove([document.file_path]);
      await admin.from("documents").delete().eq("id", documentId);
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
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage documents" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Upload PDFs" })).toBeVisible();
    await expect(page.getByRole("cell", { name: fixture.number }).first()).toBeVisible();
    await page.goto("/admin/projects/maylan-plaza/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(fixture.number) });
    await row.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit document" });
    await editDialog.getByLabel("Title").fill(`${fixture.number} featured plan`);
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("cell", { name: `${fixture.number} featured plan` })).toBeVisible();
    await page.getByRole("row", { name: new RegExp(fixture.number) })
      .getByRole("button", { name: "Feature" }).click();
    await expect(page.getByRole("row", { name: new RegExp(fixture.number) })
      .getByTitle("Remove featured status")).toBeVisible();
    await page.goto("/projects/maylan-plaza");
    await expect(page.getByRole("row", { name: new RegExp(fixture.number) }).locator(".featured-star")).toBeVisible();
    await page.goto("/admin/projects/maylan-plaza/documents");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("row", { name: new RegExp(fixture.number) }).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("heading", { name: "Archived (1)" })).toBeVisible();
    await page.goto("/projects/maylan-plaza");
    await expect(page.getByRole("cell", { name: fixture.number })).toHaveCount(0);
    await page.goto("/admin/projects/maylan-plaza/documents");
    await page.getByRole("row", { name: new RegExp(fixture.number) }).getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("heading", { name: "Archived (0)" })).toBeVisible();
    await page.goto("/projects/maylan-plaza");
    await expect(page.getByRole("cell", { name: fixture.number }).first()).toBeVisible();
  });

  test("failed Storage upload can be retried without pending metadata", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto("/admin/projects/maylan-plaza/documents/new");
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);
    const bytes = Buffer.from(await pdf.save());
    await page.locator('input[type="file"]').setInputFiles({
      name: `${fixture.retryNumber}.pdf`, mimeType: "application/pdf", buffer: bytes,
    });
    let interrupted = false;
    await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
      if (!interrupted) { interrupted = true; await route.abort(); }
      else await route.continue();
    });
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Failed");
    expect(interrupted).toBe(true);
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Complete");
    const { data, error } = await admin.from("documents").select("id,upload_status")
      .eq("project_id", fixture.projectId).eq("doc_number", fixture.retryNumber);
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data![0].upload_status).toBe("ready");
    fixture.retryDocumentId = data![0].id;
  });
});
