import { expect, type Page, test } from "@playwright/test";

async function send(page: Page, text: string) {
  await expect(page.getByTestId("assistant-state")).toHaveText("idle");
  const input = page.getByTestId("assistant-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test.describe("Vidya in mock mode", () => {
  test("navigates, confirms a bookmark and shows its audit history to the admin", async ({
    page,
    browser,
    baseURL,
  }) => {
    const browserErrors: string[] = [];
    const auditRequests: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || /hydration/i.test(message.text())) {
        browserErrors.push(message.text());
      }
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/speeq/audit/")) {
        auditRequests.push(request.url());
      }
    });

    // Chromium can expose a constructor even on a host without speech recognition.
    await page.addInitScript(() => {
      Object.defineProperties(globalThis, {
        SpeechRecognition: { value: undefined, configurable: true },
        webkitSpeechRecognition: { value: undefined, configurable: true },
      });
    });

    await page.goto("/");
    const toggle = page.getByTestId("assistant-toggle");
    const panel = page.getByTestId("assistant-panel");
    const transcript = page.getByTestId("assistant-transcript");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("assistant-mock-badge")).toBeVisible();
    await expect(page.getByTestId("assistant-mic")).toBeDisabled();
    await expect(
      panel.getByText("Voice input isn't supported in this browser. Type instead."),
    ).toBeVisible();

    await send(page, "take me to pricing");
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(transcript.getByText("Opening Pricing.")).toBeVisible();

    await page.goto("/admin/conversations");
    await expect(page.getByTestId("audit-denied")).toBeVisible();
    await expect(page.getByTestId("audit-session-row")).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "Sign in as admin" }).click();
    await page.getByRole("button", { name: "Continue as Asha" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await toggle.click();
    // The student owns a separate session from the initial anonymous visit.
    await send(page, "open question 12");
    await expect(page).toHaveURL(/\/questions\/12$/);
    await expect(page.getByRole("heading", { name: "Question 12", exact: true })).toBeVisible();
    await expect(panel).toBeVisible();

    await send(page, "bookmark this question");
    const dialog = page.getByRole("dialog", { name: "Confirm action" });
    await expect(dialog).toContainText("Bookmark question 12");
    const decline = dialog.getByTestId("confirm-decline");
    await expect(decline).toBeFocused();
    await decline.click();
    await expect(dialog).toBeHidden();
    await expect(transcript.getByText("The bookmark was not saved.")).toBeVisible();

    await send(page, "bookmark this question");
    await expect(dialog).toContainText("Bookmark question 12");
    await dialog.getByTestId("confirm-approve").click();
    await expect(dialog).toBeHidden();
    await expect(transcript.getByText("Bookmarked question 12.")).toBeVisible();

    await page.goto("/admin/conversations");
    await expect(page.getByTestId("audit-denied")).toBeVisible();
    await expect(page.getByTestId("audit-session-row")).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    expect(auditRequests).toEqual([]);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Password").fill("e2e-admin");
    await page.getByRole("button", { name: "Sign in as admin" }).click();
    await nav.getByRole("link", { name: "Admin", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/conversations$/);
    const newest = page.getByTestId("audit-session-row").first();
    await expect(newest).toContainText("student-1");
    await newest.click();
    const timeline = page.getByTestId("audit-timeline");
    await expect(timeline).toContainText("navigate");
    await expect(timeline).toContainText("Confirmation requested");
    await expect(timeline).toContainText("Confirmation declined");
    await expect(timeline).toContainText("Confirmation approved");
    expect(browserErrors).toEqual([]);

    const noJs = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
      const question = await noJs.newPage();
      await question.goto("/questions/12");
      await expect(
        question.getByRole("heading", { name: "Question 12", exact: true }),
      ).toBeVisible();
      await expect(question.getByTestId("assistant-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    } finally {
      await noJs.close();
    }
  });
});
