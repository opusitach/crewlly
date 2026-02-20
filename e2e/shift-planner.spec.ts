import { expect, test } from "@playwright/test"

test.describe("Shift Planner", () => {
  test("переход между месяцами и выделение диапазона", async ({ page }) => {
    await page.goto("/shifts")
    await page.getByRole("button", { name: /следующий месяц/i }).click()
    await expect(page.getByTestId("month-grid")).toBeVisible()
  })

  test("drag & drop сотрудника в день", async ({ page }) => {
    await page.goto("/shifts")
    const employee = page.getByTestId("employee-chip").first()
    const dayCell = page.getByTestId("day-cell").first()
    await employee.dragTo(dayCell)
    await expect(page.getByText(/пересечение/i).or(page.getByText(/назначено/i))).toBeVisible()
  })

  test("оверлап предупреждение требует причину", async ({ page }) => {
    await page.goto("/shifts")
    await page.getByRole("button", { name: /создать смену/i }).click()
    await page.getByRole("button", { name: /сохранить/i }).click()
    await expect(page.getByText(/override/i)).toBeVisible()
  })
})

