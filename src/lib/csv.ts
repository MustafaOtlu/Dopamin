/** Quote every cell and neutralize spreadsheet formulas in user-authored text. */
export function csvText(rows: (string | number | null | undefined)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value ?? "");
            if (typeof value === "string" && /^[\s\uFEFF]*[=+@-]/u.test(cell)) cell = "'" + cell;
            return `"${cell.replaceAll('"', '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
