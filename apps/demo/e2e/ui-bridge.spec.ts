import { expect, type Page, test } from "@playwright/test";

async function send(page: Page, text: string) {
  await expect(page.getByTestId("assistant-state")).toHaveText("idle");
  const input = page.getByTestId("assistant-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

const textSize = (page: Page) => page.locator("html").getAttribute("data-text-size");

test.describe("UI actions in mock mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperties(globalThis, {
        SpeechRecognition: { value: undefined, configurable: true },
        webkitSpeechRecognition: { value: undefined, configurable: true },
      });
    });
    await page.goto("/");
    await page.getByTestId("assistant-toggle").click();
    await expect(page.getByTestId("assistant-panel")).toBeVisible();
  });

  test("runs a read action without asking, then approves and declines a write action", async ({
    page,
  }) => {
    const transcript = page.getByTestId("assistant-transcript");

    await send(page, "make the text larger");
    await expect(transcript.getByText("Done.")).toBeVisible();
    expect(await textSize(page)).toBe("large");
    await expect(page.getByTestId("confirm-dialog")).toBeHidden();

    // Decline: nothing changes and the assistant says so.
    await send(page, "reset my preferences");
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await expect(page.getByTestId("confirm-dialog")).toContainText(
      "Reset your display preferences",
    );
    await page.getByTestId("confirm-decline").click();
    await expect(transcript.getByText("Okay, I did not change anything.")).toBeVisible();
    expect(await textSize(page)).toBe("large");

    // Approve: the page changes.
    await send(page, "reset my settings");
    await page.getByTestId("confirm-approve").click();
    await expect(transcript.getByText("Done.")).toHaveCount(2);
    expect(await textSize(page)).toBe("normal");
  });

  test("a reload clears a pending approval and the action is not run", async ({ page }) => {
    await send(page, "make the text larger");
    await expect.poll(() => textSize(page)).toBe("large");
    await send(page, "reset my preferences");
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    expect(await textSize(page)).toBeNull();
  });
});
