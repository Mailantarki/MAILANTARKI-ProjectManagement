import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, createAuthProfile } from "../scripts/cli-common";

const suffix = randomBytes(6).toString("hex");
const fixture = {
  superId: "", memberId: "", organizationId: "", projectId: "", baseOrgId: "",
  coverPath: "", logoPath: "",
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
    if (fixture.coverPath) await admin.storage.from("project-covers").remove([fixture.coverPath]);
    if (fixture.logoPath) await admin.storage.from("project-covers").remove([fixture.logoPath]);
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
    await orgRow.getByLabel("Logo file").setInputFiles({ name: "logo.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await orgRow.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => {
      const { data } = await admin.from("organizations").select("logo_url").eq("id", fixture.organizationId).single();
      fixture.logoPath = data?.logo_url ?? "";
      return fixture.logoPath;
    }).toMatch(/^organizations\//);
    await page.reload();
    await expect(orgRow.getByRole("img", { name: "Organization logo preview" })).toBeVisible();
    const { data: logo } = await admin.storage.from("project-covers").download(fixture.logoPath);
    expect(logo?.size).toBeGreaterThan(0);
    await expect(page.locator(".back-link")).toHaveAttribute("href", "/admin");
    await orgRow.getByRole("button", { name: "Archive" }).click();
    await expect(orgRow.getByRole("button", { name: "Restore" })).toBeVisible();
    await orgRow.getByRole("button", { name: "Restore" }).click();
    await expect(orgRow.getByRole("button", { name: "Archive" })).toBeVisible();

    await page.goto("/admin/projects");
    await page.screenshot({ path: "/tmp/mailantarki-unified-admin.png", fullPage: true });
    await expect(page.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/admin");
    const newProject = page.getByRole("heading", { name: "New project" }).locator("..");
    await newProject.getByLabel("Organization").selectOption({ label: "MAILANTARKI.COM" });
    await newProject.getByLabel("Name").fill(fixture.projectName);
    await newProject.getByLabel("Slug").fill(fixture.projectSlug);
    await newProject.locator("summary").click();
    await newProject.locator('input[name="coverImage"]').setInputFiles({
      name: "cover.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    });
    await expect(newProject.getByRole("img", { name: "Project cover preview" })).toBeVisible();
    await newProject.getByRole("button", { name: "Create project" }).click();
    const projectRow = page.locator(".admin-record", { hasText: fixture.projectName });
    await expect(projectRow).toBeVisible();
    const { data: project } = await admin.from("projects").select("id,cover_image_url").eq("slug", fixture.projectSlug).single();
    fixture.projectId = project!.id;
    fixture.coverPath = project!.cover_image_url!;
    expect(fixture.coverPath).toMatch(/^projects\/.+\/[a-f0-9-]+\.png$/);
    const { data: storedCover, error: coverError } = await admin.storage.from("project-covers").download(fixture.coverPath);
    expect(coverError).toBeNull();
    expect(storedCover?.size).toBeGreaterThan(0);

    const firstCoverPath = fixture.coverPath;
    await projectRow.locator("summary").click();
    const replacement = Buffer.concat([
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      Buffer.alloc(2 * 1024 * 1024),
    ]);
    await projectRow.locator('input[type="file"]').setInputFiles({
      name: "replacement.png", mimeType: "image/png", buffer: replacement,
    });
    await expect(projectRow.getByText("Cover saved. It will remain after reloading.")).toBeVisible();
    await projectRow.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => {
      const { data } = await admin.from("projects").select("cover_image_url").eq("id", fixture.projectId).single();
      return data?.cover_image_url;
    }).not.toBe(firstCoverPath);
    const { data: updatedProject } = await admin.from("projects").select("cover_image_url").eq("id", fixture.projectId).single();
    fixture.coverPath = updatedProject!.cover_image_url!;
    await page.reload();
    await page.locator(".admin-record", { hasText: fixture.projectName }).locator("summary").click();
    await expect(page.locator(".admin-record", { hasText: fixture.projectName })
      .getByRole("img", { name: "Project cover preview" })).toBeVisible();

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "New user", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Create user", exact: true });
    await create.getByLabel("Email", { exact: true }).fill(fixture.memberEmail);
    await create.getByLabel("Full name").fill(`Member ${suffix}`);
    await create.locator('select[name="organizationId"]').selectOption({ label: "MAILANTARKI.COM" });
    await create.getByRole("button", { name: "Create user" }).click();
    const secret = page.getByRole("dialog", { name: "Temporary password", exact: true });
    await expect(secret).toBeVisible();
    const temporaryPassword = (await secret.locator("code").textContent())!.trim();
    expect(temporaryPassword.length).toBeGreaterThan(20);
    await secret.getByRole("button", { name: "Done", exact: true }).click();
    await expect(secret.locator("code")).toHaveText("");
    await create.getByRole("button", { name: "Close", exact: true }).click();
    const { data: profiles } = await admin.from("profiles").select("id").eq("full_name", `Member ${suffix}`);
    fixture.memberId = profiles![0].id;
    await page.goto(`/admin/users?q=${suffix}`);
    const memberRow = page.locator(".users-table tbody tr", { hasText: fixture.memberEmail });
    await memberRow.getByRole("button", { name: "Manage", exact: true }).click();
    const memberPanel = page.getByRole("dialog", { name: `Member ${suffix}`, exact: true });
    await memberPanel.getByLabel("Project", { exact: true }).selectOption({ label: fixture.projectName });
    await memberPanel.getByLabel("Discipline").selectOption({ label: "Architecture" });
    await memberPanel.getByRole("button", { name: "Assign access" }).click();
    await expect(memberPanel.locator(".user-grant")).toContainText("Architecture");
    await memberPanel.getByRole("button", { name: "Close", exact: true }).click();
    await page.screenshot({ path: "/tmp/mailantarki-users-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(memberRow.getByRole("button", { name: "Manage" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/mailantarki-users-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });

    const memberContext = await browser.newContext();
    try {
      const member = await memberContext.newPage();
      await member.goto("/login");
      await member.getByLabel("Email").fill(fixture.memberEmail);
      await member.getByLabel("Password").fill(temporaryPassword);
      await member.getByRole("button", { name: "Sign in" }).click();
      await expect(member).toHaveURL(/\/change-password$/);
      const newPassword = randomBytes(24).toString("base64url");
      await member.getByLabel("New password", { exact: true }).fill(newPassword);
      await member.getByLabel("Confirm password", { exact: true }).fill(newPassword);
      const coverLoaded = member.waitForResponse((response) =>
        response.url().includes("/storage/v1/object/sign/project-covers/") && response.status() === 200);
      await member.getByRole("button", { name: "Save password", exact: true }).click();
      await expect(member.getByRole("link", { name: new RegExp(fixture.projectName) })).toBeVisible();
      await expect(member.getByRole("link", { name: new RegExp(fixture.projectName) }).locator(".project-cover")).toBeVisible();
      expect((await coverLoaded).headers()["content-type"]).toBe("image/png");
      expect((await member.request.get("/admin/logs/export")).status()).toBe(404);
      await memberRow.getByRole("button", { name: "Manage", exact: true }).click();
      await memberPanel.getByRole("button", { name: "Suspend user", exact: true }).click();
      const suspension = page.getByRole("dialog", { name: "Suspend user", exact: true });
      await suspension.getByRole("button", { name: "Cancel" }).click();
      await expect(memberPanel.getByRole("button", { name: "Suspend user", exact: true })).toBeVisible();
      await memberPanel.getByRole("button", { name: "Suspend user", exact: true }).click();
      await suspension.getByRole("button", { name: "Confirm" }).click();
      await expect(memberPanel.getByRole("button", { name: "Reactivate user", exact: true })).toBeVisible();
      await member.reload();
      await expect(member).toHaveURL(/\/$/);
      const deniedLogin = await member.request.post("/api/auth/login", {
        headers: { Origin: new URL(member.url()).origin }, data: { email: fixture.memberEmail, password: newPassword },
      });
      expect(deniedLogin.status()).toBe(401);
      await memberPanel.getByRole("button", { name: "Reactivate user", exact: true }).click();
      await page.getByRole("dialog", { name: "Reactivate user", exact: true }).getByRole("button", { name: "Confirm" }).click();
      await expect(memberPanel.getByRole("button", { name: "Suspend user", exact: true })).toBeVisible();
      await memberPanel.getByRole("button", { name: "Close", exact: true }).click();
      await member.goto("/login");
      await member.getByLabel("Email").fill(fixture.memberEmail);
      await member.getByLabel("Password", { exact: true }).fill(newPassword);
      await member.getByRole("button", { name: "Sign in" }).click();
      await expect(member).toHaveURL(/\/projects$/);
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
      await page.goto(`/admin/logs?userId=${fixture.memberId}`);
      await expect(page.getByRole("cell", { name: "user suspended", exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: "password changed", exact: true })).toBeVisible();
    } finally { await memberContext.close(); }
  });
});
