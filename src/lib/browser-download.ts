"use client";

import { isNativeApp, saveToEduignite } from "@/lib/native-download";

export function downloadBlob(blob: Blob, filename: string) {
  // On the native mobile app the browser download (link.click) does nothing,
  // so write the file into the device Documents/eduignite folder instead.
  if (isNativeApp()) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = String(reader.result || "").split(",")[1] || "";
      void saveToEduignite({
        fileName: filename,
        base64,
        mimeType: blob.type || "application/octet-stream",
      });
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

// Save a generated jsPDF document. On the native app doc.save() is a no-op, so
// route the PDF into the device eduignite folder.
function savePdfNativeAware(doc: any, filename: string) {
  if (isNativeApp()) {
    try {
      const base64 = doc.output("datauristring").split(",")[1] || "";
      void saveToEduignite({ fileName: filename, base64, mimeType: "application/pdf" });
      return;
    } catch {
      /* fall through to browser save */
    }
  }
  doc.save(filename);
}

function pdfFilename(filename: string) {
  return filename.replace(/\.html?$/i, ".pdf") || "document.pdf";
}

function ensurePrintableHtml(html: string) {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}.pdf-page{width:794px;min-height:1123px;margin:0 auto;background:#fff}</style></head><body><main class="pdf-page">${html}</main></body></html>`;
}

function waitForFrameLoad(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve) => {
    const done = () => window.setTimeout(resolve, 250);
    frame.addEventListener("load", done, { once: true });
    window.setTimeout(done, 800);
  });
}

function stripHtmlToLines(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function escapePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildBasicPdfBlob(lines: string[]) {
  const pageLineLimit = 54;
  const pages = lines.length
    ? Array.from({ length: Math.ceil(lines.length / pageLineLimit) }, (_, index) => lines.slice(index * pageLineLimit, (index + 1) * pageLineLimit))
    : [["Official document export"]];
  const fontObjectId = 3 + pages.length * 2;
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = [
      "BT",
      "/F1 9 Tf",
      "40 800 Td",
      ...pageLines.flatMap((line) => [`(${escapePdfText(line).slice(0, 160)}) Tj`, "0 -13 Td"]),
      "ET",
    ].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export async function downloadHtmlDocument(html: string, filename: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "794px";
  frame.style.height = "1123px";
  frame.style.opacity = "0";
  frame.setAttribute("aria-hidden", "true");

  try {
    document.body.appendChild(frame);
    frame.srcdoc = ensurePrintableHtml(html);
    await waitForFrameLoad(frame);

    const target = frame.contentDocument?.body;
    if (!target) throw new Error("Could not prepare document for PDF export.");

    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    await doc.html(target, {
      x: 0,
      y: 0,
      width: 595,
      windowWidth: 794,
      html2canvas: {
        scale: 0.74,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
      },
      callback: (pdf) => {
        savePdfNativeAware(pdf, pdfFilename(filename));
      },
    } as any);
  } catch (error) {
    console.error("PDF HTML rendering failed; exporting a text-safe PDF fallback.", error);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const lines = stripHtmlToLines(html);
      let y = 48;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Official Document Export", 40, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      y += 24;
      for (const line of lines) {
        const wrapped = doc.splitTextToSize(line, 515);
        for (const item of wrapped) {
          if (y > 790) {
            doc.addPage();
            y = 48;
          }
          doc.text(item, 40, y);
          y += 13;
        }
      }
      savePdfNativeAware(doc, pdfFilename(filename));
    } catch (fallbackError) {
      console.error("PDF fallback failed; exporting a basic PDF fallback.", fallbackError);
      downloadBlob(buildBasicPdfBlob(stripHtmlToLines(html)), pdfFilename(filename));
    }
  } finally {
    frame.remove();
  }
}

export function escapeHtml(value: string | number | null | undefined) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
