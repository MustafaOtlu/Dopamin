import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

export async function expectAccessible(page: Page, name: string) {
  const result = await new AxeBuilder({ page }).analyze();
  await test.info().attach(`accessibility-${name}`, {
    body: JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
    contentType: "application/json",
  });
  expect(
    result.violations,
    `${name}: ${result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`).join("; ")}`,
  ).toEqual([]);
}
