import { expect, type Page, test } from "@playwright/test";

async function send(page: Page, text: string) {
  await expect(page.getByTestId("assistant-state")).toHaveText("idle");
  const input = page.getByTestId("assistant-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test.describe("Form fill in mock mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperties(globalThis, {
        SpeechRecognition: { value: undefined, configurable: true },
        webkitSpeechRecognition: { value: undefined, configurable: true },
      });
    });
    await page.goto("/practice");
    await page.getByTestId("assistant-toggle").click();
    await expect(page.getByTestId("assistant-panel")).toBeVisible();
  });

  test("fills a draft, never submits, and leaves a field the visitor typed alone", async ({
    page,
  }) => {
    const transcript = page.getByTestId("assistant-transcript");
    const subject = page.locator('select[name="subject"]');
    const search = page.locator('input[name="q"]');

    await send(page, "fill the practice filters with physics easy");
    await expect(transcript.getByText(/I filled subject, difficulty/)).toBeVisible();
    await expect(subject).toHaveValue("physics");
    await expect(page.locator('select[name="difficulty"]')).toHaveValue("easy");
    await expect(page).toHaveURL(/\/practice$/); // a draft: nothing was submitted

    await search.fill("motion");
    await send(page, "fill the practice filters search waves");
    await expect(transcript.getByText(/left q alone because you already typed/)).toBeVisible();
    await expect(search).toHaveValue("motion");

    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/subject=physics/);
    await expect(page).toHaveURL(/difficulty=easy/);
  });
});
