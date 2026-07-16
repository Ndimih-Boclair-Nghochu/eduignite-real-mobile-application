// Shared, styled fee/subscription receipt used across the bursar, school-admin,
// student and parent fee views. One design, one download/print path, so a
// receipt looks identical wherever it is produced.

export const CURRENCY = "XAF";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] as string));
}

export function money(value: unknown, currency = CURRENCY): string {
  const amount = Number(value || 0);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

export function methodLabel(method: string | undefined): string {
  switch ((method || "").toLowerCase()) {
    case "mtn_momo": return "MTN Mobile Money";
    case "orange_money": return "Orange Money";
    case "mobile_money": return "Mobile Money";
    default: return method || "Mobile Money";
  }
}

export type ReceiptData = {
  receiptNo: string;
  reference?: string;
  studentName?: string;
  feeName?: string;
  amount?: string | number;
  currency?: string;
  method?: string;
  date?: string;
  recordedBy?: string;
  status?: string;
  kind?: string; // "Subscription" | "Fee Payment"
};

/** Normalise a Payment (PaymentDetailSerializer) into ReceiptData. */
export function receiptFromPayment(payment: any, kind?: string): ReceiptData {
  const isPlatform = !payment?.fee_structure;
  return {
    receiptNo: payment?.receipt_number || payment?.reference_number || "PENDING",
    reference: payment?.reference_number || "",
    studentName: payment?.payer_name || "",
    feeName: payment?.fee_structure_detail?.name || (isPlatform ? "Platform Subscription" : "School Fee"),
    amount: payment?.amount,
    currency: payment?.currency || CURRENCY,
    method: methodLabel(payment?.payment_method),
    date: payment?.payment_date || new Date().toISOString().slice(0, 10),
    recordedBy: payment?.bursar_name || "Bursar",
    status: payment?.status || "confirmed",
    kind: kind || (isPlatform ? "Subscription" : "Fee Payment"),
  };
}

/** Normalise a my-fees item into ReceiptData. */
export function receiptFromFeeItem(item: any): ReceiptData {
  return {
    receiptNo: item?.receipt_number || item?.reference_number || "PENDING",
    reference: item?.reference_number || "",
    studentName: item?.student_name || "",
    feeName: item?.name || "School Fee",
    amount: item?.amount_paid || item?.amount,
    currency: item?.currency || CURRENCY,
    method: item?.payment_method || "",
    date: item?.payment_date || new Date().toISOString().slice(0, 10),
    recordedBy: "School Bursar",
    status: item?.status === "paid" ? "confirmed" : (item?.status || ""),
    kind: "Fee Payment",
  };
}

export function buildFeeReceiptHtml(data: ReceiptData, schoolName: string): string {
  const rows: [string, string][] = [
    ["Receipt No.", data.receiptNo],
    ["Reference", data.reference || "—"],
    ["Student", data.studentName || "—"],
    ["Fee Type", data.feeName || "—"],
    ["Amount Paid", money(data.amount, data.currency || CURRENCY)],
    ["Method", data.method || "—"],
    ["Date", data.date || "—"],
    ["Recorded By", data.recordedBy || "—"],
    ["Status", (data.status || "confirmed").toUpperCase()],
  ];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(data.receiptNo)}</title>
<style>
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;}
  body{margin:0;padding:32px;color:#0f2540;background:#eef2f7;}
  .sheet{max-width:640px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,37,64,.14);}
  .head{background:linear-gradient(135deg,#173a5b,#264d73);color:#fff;padding:28px 32px;}
  .head h1{margin:0;font-size:22px;letter-spacing:.5px;}
  .head p{margin:6px 0 0;font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:2px;}
  .badge{display:inline-block;margin-top:14px;background:#ffd25a;color:#173a5b;font-weight:800;font-size:11px;letter-spacing:1px;padding:6px 12px;border-radius:999px;text-transform:uppercase;}
  table{width:100%;border-collapse:collapse;}
  td{padding:13px 32px;font-size:14px;border-bottom:1px solid #eef2f7;}
  td.label{color:#64748b;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:1px;width:42%;}
  td.value{color:#0f2540;font-weight:700;text-align:right;}
  .total td{background:#f8fbff;font-size:18px;color:#173a5b;font-weight:900;}
  .foot{padding:22px 32px;font-size:11px;color:#64748b;text-align:center;line-height:1.6;}
  @media print{body{background:#fff;padding:0;}.sheet{box-shadow:none;border-radius:0;}}
</style></head>
<body><div class="sheet">
  <div class="head">
    <h1>${escapeHtml(schoolName || "EduIgnite School")}</h1>
    <p>Official Payment Receipt</p>
    <div class="badge">${escapeHtml(data.kind || "Fee Payment")}</div>
  </div>
  <table>
    ${rows.map(([label, value], index) => `<tr class="${index === 4 ? "total" : ""}"><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(value)}</td></tr>`).join("")}
  </table>
  <div class="foot">
    This is a computer-generated receipt from the EduIgnite school platform.<br/>
    Keep it as proof of payment. For queries contact your school bursar or administration.
  </div>
</div></body></html>`;
}

export function downloadReceiptHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[^a-z0-9_.-]+/gi, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function printReceiptHtml(html: string) {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
