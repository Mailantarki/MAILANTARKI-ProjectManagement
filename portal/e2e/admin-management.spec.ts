import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, createAuthProfile } from "../scripts/cli-common";

const suffix = randomBytes(6).toString("hex");
const fixture = {
  superId: "", memberId: "", organizationId: "", projectId: "", baseOrgId: "",
  superEmail: `admin-management-${suffix}@example.test`,
  memberEmail: `management-member-${suffix}@example.test`,
  superPassword: randomBytes(24).toString("base64url"),
  projectName: `E2E project ${suffix}`, projectSlug: `e2e-project-${suffix}`,
  organizationName: `E2E organization ${suffix}`,
};

test.describe.serial("admin organizations, projects and users", () => {
  test.beforeAll(async () => {
    const { data: org, error } = await admin.from("organizations").select("id").eq("name", "MAILANTARKI.COM").single();
    if (error || !org) throw error ?? new Error("Base organization missing");
    fixture.baseOrgId = org.id;
    fixture.superId = await createAuthProfile({ email: fixture.superEmail, password: fixture.superPassword,
      fullName: "E2E management admin", role: "super_admin", organizationId: null });
  });

  test.afterAll(async () => {
    if (fixture.memberId) {
      await admin.from("user_project_access").delete().eq("user_id", fixture.memberId);
      await admin.auth.admin.deleteUser(fixture.memberId, true);
    }
    if (fixture.projectId) await admin.from("projects").delete().eq("id", fixture.projectId);
    if (fixture.organizationId) await admin.from("organizations").delete().eq("id", fixture.organizationId);
    if (fixture.superId) {
      await admin.from("profiles").update({ role: "member", organization_id: fixture.baseOrgId }).eq("id", fixture.superId);
      await admin.auth.admin.deleteUser(fixture.superId, true);
    }
  });

  test("creates and restores organization/project, assigns member in UI", async ({ page, browser }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.superEmail);
    await page.getByLabel("Password").fill(fixture.superPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto("/admin/organizations");
    await page.getByRole("heading", { name: "New organization" }).locator("..").getByLabel("Name").fill(fixture.organizationName);
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByText(fixture.organizationName).first()).toBeVisible();
    const { data: org } = await admin.from("organizations").select("id").eq("name", fixture.organizationName).single();
    fixture.organizationId = org!.id;
    page.on("dialog", (prompt) => prompt.accept());
    const orgRow = page.locator(".admin-record", { hasText: fixture.organizationName });
    await orgRow.getByRole("button", { name: "Archive" }).click();
    await expect(orgRow.getByRole("button", { name: "Restore" })).toBeVisible();
    await orgRow.getByRole("button", { name: "Restore" }).click();
    await expect(orgRow.getByRole("button", { name: "Archive" })).toBeVisible();

    await page.goto("/admin/projects");
    const newProject = page.getByRole("heading", { name: "New project" }).locator("..");
    await newProject.getByLabel("Organization").selectOption({ label: "MAILANTARKI.COM" });
    await newProject.getByLabel("Name").fill(fixture.projectName);
    await newProject.getByLabel("Slug").fill(fixture.projectSlug);
    await newProject.getByRole("button", { name: "Create project" }).click();
    const projectRow = page.locator(".admin-record", { hasText: fixture.projectName });
    await expect(projectRow).toBeVisible();
    const { data: project } = await admin.from("projects").select("id").eq("slug", fixture.projectSlug).single();
    fixture.projectId = project!.id;

    await page.goto("/admin/users");
    const create = page.getByRole("heading", { name: "Create user" }).locator("..");
    await create.getByLabel("Email", { exact: true }).fill(fixture.memberEmail);
    await create.getByLabel("Full name").fill(`Member ${suffix}`);
    await create.locator('select[name="organizationId"]').selectOption({ label: "MAILANTARKI.COM" });
    await create.getByRole("button", { name: "Create user" }).click();
    const temporaryPassword = (await create.locator(".one-time-secret code").textContent())!.trim();
    expect(temporaryPassword.length).toBeGreaterThan(20);
    const { data: profiles } = await admin.from("profiles").select("id").eq("full_name", `Member ${suffix}`);
    fixture.memberId = profiles![0].id;
    const memberRow = page.locator(".admin-record", { hasText: fixture.memberEmail });
    await memberRow.getByLabel("Project").selectOption({ label: fixture.projectName });
    await memberRow.getByLabel("Discipline").selectOption({ label: "Architecture" });
    await memberRow.getByRole("button", { name: "Assign access" }).click();
    await expect(memberRow).toContainText("Architecture");

    const memberContext = await browser.newContext();
    try {
      const member = await memberContext.newPage();
      await member.goto("/login");
      await member.getByLabel("Email").fill(fixture.memberEmail);
      await member.getByLabel("Password").fill(temporaryPassword);
      await member.getByRole("button", { name: "Sign in" }).click();
      await expect(member.getByRole("link", { name: new RegExp(fixture.projectName) })).toBeVisible();
      expect((await member.request.get("/admin/logs/export")).status()).toBe(404);
      await page.goto("/admin/projects");
      await page.locator(".admin-record", { hasText: fixture.projectName }).getByRole("button", { name: "Archive" }).click();
      await member.reload();
      await expect(member.getByRole("link", { name: new RegExp(fixture.projectName) })).toHaveCount(0);
      await page.locator(".admin-record", { hasText: fixture.projectName }).getByRole("button", { name: "Restore" }).click();
      await expect(page.locator(".admin-record", { hasText: fixture.projectName }).getByRole("button", { name: "Archive" })).toBeVisible();
      await member.reload();
      await expect(member.getByRole("link", { name: new RegExp(fixture.projectName) })).toBeVisible();
      await page.goto("/admin/logs");
      await expect(page.getByRole("heading", { name: "Access logs" })).toBeVisible();
      const csv = await page.request.get("/admin/logs/export?action=login");
      expect(csv.status()).toBe(200);
      expect(csv.headers()["content-type"]).toContain("text/csv");
      expect(await csv.text()).toContain('"login"');
    } finally { await memberContext.close(); }
  });
});
