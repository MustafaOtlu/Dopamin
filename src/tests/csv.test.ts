import { expect, it } from "vitest";
import { csvText } from "@/lib/csv";
it("rapordaki kullanıcı metnini formül olarak çalıştırmaz; Türkçe, satır sonu ve sıfır notunu korur", () => {
  expect(
    csvText([
      ["Öğrenci", "Not"],
      ['  =HYPERLINK("url")', 0],
      ["+1+2", null],
      ["@SUM(1)", "-2+3"],
      ['Alıntı "metin";\nyeni satır', undefined],
    ]),
  ).toBe(
    '\uFEFF"Öğrenci";"Not"\r\n"\'  =HYPERLINK(""url"")";"0"\r\n"\'+1+2";""\r\n"\'@SUM(1)";"\'-2+3"\r\n"Alıntı ""metin"";\nyeni satır";""',
  );
});
