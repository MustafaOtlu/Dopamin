import { createCanvas } from "@napi-rs/canvas";

export function scannedAcademicPdf(week = 1) {
  const canvas = createCanvas(1224, 1584),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#171717";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(`Algoritmalar - Hafta ${week}`, 100, 150);
  ctx.font = "32px sans-serif";
  const lines = [
    "Algoritma, bir problemi sonlu adımlarla çözer.",
    "Önce girdi okunur, sonra veri işlenir.",
    "Son adımda çıktı gösterilir.",
    "An algorithm is a finite sequence of steps.",
    "Read the input, process the data, show the output.",
  ];
  lines.forEach((line, i) => ctx.fillText(line, 100, 240 + i * 65));
  const jpeg = canvas.toBuffer("image/jpeg");
  const stream = "q 612 0 0 792 0 0 cm /Scan Do Q";
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1224 /Height 1584 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
  ];
  const pieces = [Buffer.from("%PDF-1.4\n")];
  let offset = pieces[0].length,
    xref = "0000000000 65535 f \n";
  objects.forEach((object, i) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
    const piece = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      object,
      Buffer.from("\nendobj\n"),
    ]);
    pieces.push(piece);
    offset += piece.length;
  });
  pieces.push(
    Buffer.from(
      `xref\n0 6\n${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
    ),
  );
  return new Uint8Array(Buffer.concat(pieces));
}

export function academicPdf(
  lines: string[] = [
    "Algorithms - Week 1",
    "An algorithm is a finite sequence of steps to solve a problem.",
    "Input is read first. Then process the data and show the output.",
  ],
) {
  const stream = `BT /F1 16 Tf 50 750 Td ${lines.map((line, i) => `${i ? "0 -30 Td " : ""}(${line.replace(/[()\\]/g, (s) => `\\${s}`)}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let data = "%PDF-1.4\n",
    xref = "0000000000 65535 f \n";
  objects.forEach((object, i) => {
    xref += `${String(Buffer.byteLength(data)).padStart(10, "0")} 00000 n \n`;
    data += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const offset = Buffer.byteLength(data);
  data += `xref\n0 6\n${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(data));
}
