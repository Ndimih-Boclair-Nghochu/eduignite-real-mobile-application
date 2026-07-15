"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck, CreditCard, Loader2, Printer, Download, ShieldCheck, Wallet,
  TrendingUp, Layers, Search, UserCheck, AlertTriangle, ReceiptText, Smartphone, Plus,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { feesService } from "@/lib/api/services/fees.service";
import { usersService } from "@/lib/api/services/users.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { generateReceiptPdf } from "@/lib/pdf-branded";

const CURRENCY = "XAF";

// Platform charges are collected only via mobile money — no cash.
const PAYMENT_METHODS = [
  { value: "mtn_momo", label: "MTN Mobile Money" },
  { value: "orange_money", label: "Orange Money" },
];

function money(value: number | string | undefined, currency = CURRENCY) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

function normalizeList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getUserSchoolId(account: any): string {
  const school = account?.school;
  if (typeof school === "string") return school;
  return school?.id || account?.school_id || account?.schoolId || "";
}

function escapeHtml(value: string) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] as string));
}

function buildReceiptHtml(payment: any, schoolName: string, methodLabel: string) {
  const receiptNo = payment.receipt_number || payment.reference_number || "PENDING";
  const rows: [string, string][] = [
    ["Receipt No.", receiptNo],
    ["Reference", payment.reference_number || "—"],
    ["Student", payment.payer_name || "—"],
    ["Fee Type", payment.fee_structure_detail?.name || (payment.fee_structure ? "School Fee" : "Platform Charge")],
    ["Amount Paid", money(payment.amount, payment.currency || CURRENCY)],
    ["Method", methodLabel],
    ["Date", payment.payment_date || new Date().toISOString().slice(0, 10)],
    ["Recorded By", payment.bursar_name || "Bursar"],
    ["Status", (payment.status || "confirmed").toUpperCase()],
  ];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(receiptNo)}</title>
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
    <div class="badge">${escapeHtml(payment.fee_structure ? "Fee Payment" : "Platform Charge")}</div>
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

export function BursarPayments() {
  const { user, platformSettings } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const schoolId = getUserSchoolId(user);
  const schoolName =
    (typeof (user as any)?.school === "object" && (user as any)?.school?.name) || platformSettings?.name || "EduIgnite School";

  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  // Inline creation of a new fee type — it appears in the selector at once.
  const [newFeeTypeOpen, setNewFeeTypeOpen] = useState(false);
  const [newFeeType, setNewFeeType] = useState({ name: "", amount: "" });
  const [selectedFeeId, setSelectedFeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mtn_momo");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<any | null>(null);
  const [momoPhone, setMomoPhone] = useState("");
  const [momoTxn, setMomoTxn] = useState<any | null>(null);
  const [momoStarting, setMomoStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const studentsQuery = useQuery({
    queryKey: ["bursar-students", schoolId],
    queryFn: async () => normalizeList(await usersService.getUsers({ role: "STUDENT", school: schoolId, page_size: 500 } as any)),
    enabled: Boolean(schoolId),
  });

  const feeTypesQuery = useQuery({
    queryKey: ["bursar-fee-types", schoolId],
    queryFn: async () => normalizeList(await feesService.getFeeStructures({ page_size: 200 } as any)),
  });

  const overviewQuery = useQuery({
    queryKey: ["bursar-financial-overview", schoolId],
    queryFn: () => feesService.getFinancialOverview(),
  });

  const createFeeTypeMutation = useMutation({
    mutationFn: async () =>
      feesService.createFeeStructure({
        name: newFeeType.name.trim(),
        amount: Number(newFeeType.amount),
        role: "STUDENT",
      } as any),
    onSuccess: async (created: any) => {
      toast({ title: "Fee type created", description: `"${newFeeType.name.trim()}" is now available for recording.` });
      setNewFeeTypeOpen(false);
      setNewFeeType({ name: "", amount: "" });
      await queryClient.invalidateQueries({ queryKey: ["bursar-fee-types"] });
      if (created?.id) setSelectedFeeId(String(created.id));
    },
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not create fee type", description: getApiErrorMessage(error, "Try again.") }),
  });

  const students = studentsQuery.data || [];
  const feeTypes = feeTypesQuery.data || [];
  const overview = overviewQuery.data;

  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    if (!term) return students.slice(0, 40);
    return students
      .filter((s: any) =>
        s.name?.toLowerCase().includes(term) ||
        s.matricule?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term))
      .slice(0, 40);
  }, [students, studentSearch]);

  const selectedStudent = useMemo(
    () => students.find((s: any) => String(s.id) === String(selectedStudentId)) || null,
    [students, selectedStudentId]
  );
  const platformPaid = Boolean(selectedStudent?.is_license_paid);
  const platformFees = (platformSettings?.fees ?? {}) as Record<string, string | number>;
  const platformFeeAmount = Number(platformFees.STUDENT ?? platformFees.student ?? 0);

  const selectedFee = useMemo(
    () => feeTypes.find((f: any) => String(f.id) === String(selectedFeeId)) || null,
    [feeTypes, selectedFeeId]
  );

  const methodLabel = PAYMENT_METHODS.find((m) => m.value === method)?.label || method;

  const afterPayment = () => {
    queryClient.invalidateQueries({ queryKey: ["bursar-students"] });
    queryClient.invalidateQueries({ queryKey: ["bursar-financial-overview"] });
  };

  const payPlatform = useMutation({
    mutationFn: async () => {
      const value = platformFeeAmount > 0 ? platformFeeAmount : Number(amount);
      if (!value || value <= 0) throw new Error("Enter the platform charge amount.");
      return feesService.createPayment({
        payer: selectedStudentId,
        amount: String(value),
        payment_method: method as any,
        payment_date: paymentDate,
        mark_license_paid: true,
        license_beneficiary: selectedStudentId,
        notes: notes || "Platform charge settled by bursar.",
      } as any);
    },
    onSuccess: (data: any) => {
      afterPayment();
      setReceipt(data);
      toast({ title: "Platform charge paid", description: `${selectedStudent?.name || "The student"}'s account is now active.` });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Payment failed", description: getApiErrorMessage(error, error?.message || "Could not record the platform charge.") }),
  });

  const recordFee = useMutation({
    mutationFn: async () => {
      if (!selectedFeeId) throw new Error("Select a fee type first.");
      if (!amount || Number(amount) <= 0) throw new Error("Enter the amount paid.");
      const created = await feesService.createPayment({
        payer: selectedStudentId,
        fee_structure: selectedFeeId,
        amount: String(amount),
        payment_method: method as any,
        payment_date: paymentDate,
        notes,
      } as any);
      // Confirm immediately so the payment counts and produces a receipt number.
      try {
        const confirmed: any = await feesService.confirmPayment(String((created as any).id));
        return confirmed?.payment || confirmed || created;
      } catch {
        return created;
      }
    },
    onSuccess: (data: any) => {
      afterPayment();
      setReceipt(data);
      setSelectedFeeId("");
      setAmount("");
      setNotes("");
      toast({ title: "Fee recorded", description: "The payment receipt is ready to print or download." });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Could not record fee", description: getApiErrorMessage(error, error?.message || "Please try again.") }),
  });

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // Only the platform fee is collected online via CamPay.
  const startMomo = async () => {
    if (!momoPhone.trim()) {
      toast({ variant: "destructive", title: "Phone required", description: "Enter the mobile money number (e.g. 6XXXXXXXX)." });
      return;
    }
    setMomoStarting(true);
    try {
      const payload: any = { purpose: "platform_charge", phone: momoPhone, student_id: selectedStudentId };
      if (platformFeeAmount <= 0 && amount) payload.amount = amount;
      const txn = await feesService.campayCollect(payload);
      setMomoTxn(txn);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Mobile money failed", description: getApiErrorMessage(error, "Could not start the mobile money request.") });
    } finally {
      setMomoStarting(false);
    }
  };

  // Poll the CamPay transaction status until it resolves.
  useEffect(() => {
    stopPolling();
    if (!momoTxn?.external_reference || momoTxn.status !== "PENDING") return;
    pollRef.current = setInterval(async () => {
      try {
        const updated = await feesService.campayStatus(momoTxn.external_reference);
        if (updated.status === "SUCCESSFUL") {
          stopPolling();
          setMomoTxn(null);
          afterPayment();
          setSelectedFeeId(""); setAmount(""); setNotes("");
          if (updated.payment) setReceipt(updated.payment);
          toast({ title: "Payment confirmed", description: "Mobile money payment received. Receipt is ready." });
        } else if (updated.status === "FAILED") {
          stopPolling();
          setMomoTxn(updated);
          toast({ variant: "destructive", title: "Payment failed", description: updated.reason || "The mobile money payment was not completed." });
        }
      } catch { /* keep polling */ }
    }, 4000);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momoTxn?.external_reference, momoTxn?.status]);

  // Receipts are real branded PDFs — never raw HTML dumps or screen prints.
  const receiptPdfOptions = (print: boolean) => ({
    schoolName,
    title: receipt?.fee_structure ? "OFFICIAL FEE RECEIPT" : "PLATFORM CHARGE RECEIPT",
    lines: [
      ["Receipt No.", receipt?.receipt_number || receipt?.reference_number || "PENDING"],
      ["Reference", receipt?.reference_number || "—"],
      ["Student", receipt?.payer_name || "—"],
      ["Fee Type", receipt?.fee_structure_detail?.name || (receipt?.fee_structure ? "School Fee" : "Platform Charge")],
      ["Amount Paid", money(receipt?.amount, receipt?.currency || CURRENCY)],
      ["Method", methodLabel],
      ["Date", receipt?.payment_date || new Date().toISOString().slice(0, 10)],
      ["Recorded By", receipt?.bursar_name || "Bursar"],
      ["Status", (receipt?.status || "confirmed").toUpperCase()],
    ] as [string, string][],
    reference: receipt?.reference_number,
    fileName: `receipt_${receipt?.receipt_number || receipt?.reference_number || "payment"}`,
    print,
  });

  const printReceipt = () => {
    if (!receipt) return;
    generateReceiptPdf(receiptPdfOptions(true));
  };

  const downloadReceipt = () => {
    if (!receipt) return;
    generateReceiptPdf(receiptPdfOptions(false));
  };

  return (
    <div className="space-y-6">
      {/* Analytics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-secondary" /> Total Expected Revenue
            </div>
            <p className="mt-2 text-2xl font-black text-primary">{money(overview?.total_expected_revenue)}</p>
            <p className="text-[11px] text-muted-foreground">School fees + all fee types</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <Wallet className="h-4 w-4 text-secondary" /> Expected School Fees
            </div>
            <p className="mt-2 text-2xl font-black text-primary">{money(overview?.school_fees?.expected)}</p>
            <p className="text-[11px] text-muted-foreground">{overview?.school_fees?.student_count ?? 0} students allocated</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <Layers className="h-4 w-4 text-secondary" /> Expected Fee Types
            </div>
            <p className="mt-2 text-2xl font-black text-primary">{money(overview?.fee_types_expected_total)}</p>
            <p className="text-[11px] text-muted-foreground">{(overview?.fee_types?.length ?? 0)} fee types</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <BadgeCheck className="h-4 w-4 text-secondary" /> Total Collected
            </div>
            <p className="mt-2 text-2xl font-black text-primary">{money(overview?.total_collected_revenue)}</p>
            <p className="text-[11px] text-muted-foreground">Outstanding: {money(overview?.total_outstanding_revenue)}</p>
          </CardContent>
        </Card>
      </div>

      {overview?.fee_types?.length ? (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-black text-primary">Revenue by Fee Type</CardTitle>
            <CardDescription>Expected vs collected for each fee type added by the bursar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overview.fee_types.map((fee: any) => (
              <div key={fee.id} className="rounded-xl border bg-accent/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-primary text-sm">{fee.name}</p>
                  <Badge variant="outline" className="text-[9px] uppercase">{fee.role}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Expected {money(fee.expected)} • Collected {money(fee.collected)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Student picker */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black text-primary flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-secondary" /> Select Student
            </CardTitle>
            <CardDescription>Choose the student to pay platform charges or record fees for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name or matricule..." className="border-none focus-visible:ring-0" />
            </div>
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {studentsQuery.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary/40" /></div>
              ) : filteredStudents.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No students found.</p>
              ) : filteredStudents.map((student: any) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => { setSelectedStudentId(String(student.id)); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all",
                    String(selectedStudentId) === String(student.id) ? "border-primary bg-primary/5" : "hover:bg-accent/20"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-primary">{student.name}</p>
                    <p className="truncate text-[10px] font-mono text-muted-foreground">{student.matricule}</p>
                  </div>
                  <Badge className={cn("text-[8px] font-black uppercase", student.is_license_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                    {student.is_license_paid ? "Active" : "Platform unpaid"}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payment panel */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black text-primary flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-secondary" /> Record Payment
            </CardTitle>
            <CardDescription>
              {selectedStudent ? `Recording for ${selectedStudent.name}` : "Select a student to begin."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedStudent ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No student selected yet.</p>
            ) : (
              <>
                {/* Platform charge */}
                <div className={cn("rounded-2xl border p-4", platformPaid ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-black text-primary">
                        <ShieldCheck className="h-4 w-4" /> Platform Charge
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {platformPaid
                          ? "Paid — this student's account is active."
                          : "Unpaid — pay the platform charge to activate this account and unlock fee recording."}
                      </p>
                    </div>
                    {platformPaid ? (
                      <Badge className="bg-green-600 text-[9px] font-black uppercase">Active</Badge>
                    ) : null}
                  </div>
                  {!platformPaid ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount</Label>
                          <Input
                            type="number"
                            value={platformFeeAmount > 0 ? String(platformFeeAmount) : amount}
                            onChange={(e) => setAmount(e.target.value)}
                            disabled={platformFeeAmount > 0}
                            className="h-10 w-40 rounded-xl bg-white"
                            placeholder="Platform fee"
                          />
                        </div>
                        <Button onClick={() => payPlatform.mutate()} disabled={payPlatform.isPending} variant="outline" className="h-10 gap-2 rounded-xl font-black bg-white">
                          {payPlatform.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Record Cash &amp; Activate
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-end gap-3 border-t border-amber-200 pt-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mobile Money Number</Label>
                          <Input value={momoPhone} onChange={(e) => setMomoPhone(e.target.value)} className="h-10 w-44 rounded-xl bg-white" placeholder="6XXXXXXXX" />
                        </div>
                        <Button onClick={() => startMomo()} disabled={momoStarting} className="h-10 gap-2 rounded-xl font-black">
                          {momoStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                          Pay by Mobile Money
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Fee type cards */}
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fee Type</Label>
                  {!platformPaid ? (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-4 w-4" /> Pay the platform charge before recording any other fee.
                    </div>
                  ) : feeTypes.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No fee types yet. Add them in the Fee Types tab.</p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {feeTypes.map((fee: any) => (
                        <button
                          key={fee.id}
                          type="button"
                          onClick={() => { setSelectedFeeId(String(fee.id)); setAmount(String(fee.amount || "")); }}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-all",
                            String(selectedFeeId) === String(fee.id) ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/20"
                          )}
                        >
                          <p className="truncate text-xs font-black text-primary">{fee.name}</p>
                          <p className="mt-1 text-[11px] font-bold text-secondary">{money(fee.amount, fee.currency || CURRENCY)}</p>
                          <p className="truncate text-[9px] uppercase text-muted-foreground">{fee.role}</p>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setNewFeeTypeOpen(true)}
                        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 p-3 text-primary transition-all hover:bg-primary/5"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="mt-1 text-[10px] font-black uppercase">New fee type</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Payment form */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount Paid</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!platformPaid} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment Date</Label>
                    <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notes (optional)</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 rounded-xl" placeholder="e.g. First instalment" />
                  </div>
                </div>

                <Button
                  onClick={() => recordFee.mutate()}
                  disabled={!platformPaid || !selectedFeeId || recordFee.isPending}
                  className="h-12 w-full gap-2 rounded-xl font-black"
                >
                  {recordFee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                  Record Fee &amp; Generate Receipt
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Only the platform fee is collected online. All other fees are recorded here as offline payments.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) setReceipt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-secondary" /> Payment Receipt</DialogTitle>
            <DialogDescription>The payment was recorded successfully.</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="rounded-2xl border bg-accent/10 p-4 text-sm">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-black text-primary">{schoolName}</span>
                <Badge className="bg-primary text-[9px] uppercase">{receipt.fee_structure ? "Fee" : "Platform"}</Badge>
              </div>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between"><dt className="text-muted-foreground">Receipt No.</dt><dd className="font-mono font-bold text-primary">{receipt.receipt_number || receipt.reference_number}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Student</dt><dd className="font-bold text-primary">{receipt.payer_name || selectedStudent?.name}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Fee</dt><dd className="font-bold text-primary">{receipt.fee_structure_detail?.name || (receipt.fee_structure ? "School Fee" : "Platform Charge")}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd className="font-black text-primary">{money(receipt.amount, receipt.currency || CURRENCY)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Method</dt><dd className="font-bold text-primary">{methodLabel}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Date</dt><dd className="font-bold text-primary">{receipt.payment_date}</dd></div>
              </dl>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={downloadReceipt} className="gap-2"><Download className="h-4 w-4" /> Download</Button>
            <Button onClick={printReceipt} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile money status dialog */}
      <Dialog open={!!momoTxn} onOpenChange={(open) => { if (!open) { setMomoTxn(null); stopPolling(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-secondary" /> Mobile Money Payment</DialogTitle>
            <DialogDescription>
              {momoTxn?.status === "FAILED"
                ? "The payment was not completed."
                : "Ask the student to confirm the payment on their phone."}
            </DialogDescription>
          </DialogHeader>
          {momoTxn?.status === "FAILED" ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" /> {momoTxn?.reason || "Payment failed or cancelled."}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-xl border bg-accent/10 p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-bold text-primary">Waiting for confirmation…</span>
              </div>
              {momoTxn?.ussd_code ? (
                <p className="text-muted-foreground">
                  If no prompt appears, dial <span className="font-mono font-black text-primary">{momoTxn.ussd_code}</span> on the phone to approve.
                </p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">Amount: {money(momoTxn?.amount, momoTxn?.currency || CURRENCY)} • Ref {momoTxn?.external_reference}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMomoTxn(null); stopPolling(); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New fee type — created by the bursar, immediately selectable */}
      <Dialog open={newFeeTypeOpen} onOpenChange={setNewFeeTypeOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-black text-primary">New Fee Type</DialogTitle>
            <DialogDescription className="text-xs">
              Added fee types appear instantly in the recording list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</Label>
              <Input
                value={newFeeType.name}
                onChange={(e) => setNewFeeType((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Exam Fees 2026"
                className="h-11 rounded-xl bg-accent/30 border-none"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount ({CURRENCY})</Label>
              <Input
                type="number"
                value={newFeeType.amount}
                onChange={(e) => setNewFeeType((p) => ({ ...p, amount: e.target.value }))}
                placeholder="15000"
                className="h-11 rounded-xl bg-accent/30 border-none"
              />
            </div>
            <Button
              className="h-12 w-full rounded-2xl font-black uppercase text-xs"
              disabled={!newFeeType.name.trim() || !Number(newFeeType.amount) || createFeeTypeMutation.isPending}
              onClick={() => createFeeTypeMutation.mutate()}
            >
              {createFeeTypeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Fee Type"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
