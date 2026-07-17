"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { Search, Smartphone, Loader2, CheckCircle2, ShieldCheck, Wallet, Users, Download, Printer } from "lucide-react";
import { usersService } from "@/lib/api/services/users.service";
import { feesService } from "@/lib/api/services/fees.service";
import { usePlatformFees } from "@/lib/hooks/usePlatform";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { buildFeeReceiptHtml, downloadReceiptHtml, printReceiptHtml, receiptFromPayment, money } from "./fee-receipt";
import { resolveStudentSubscriptionFee, studentSubscriptionBlocks } from "./subscription-access";

/**
 * Subscription tab — the ONLY place the platform subscription charge is paid.
 * The amount is set by EduIgnite (never entered here), collected through MTN or
 * Orange Money, and credited to the platform. Nothing is "recorded" — the
 * payment is real; a receipt is produced for every successful subscription and a
 * student's account is activated automatically. Works one student at a time or
 * in bulk.
 */

const ALL = "all";
const OPERATORS = [
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "orange_money", label: "Orange Money" },
];

const normalizeList = (payload: any): any[] =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
const classOf = (s: any) => s.student_class || s.class_name || s.school_class_name || s.className || "";
const subSchoolOf = (s: any) => s.sub_school_name || s.subSchoolName || s.section || "General";

export function Subscription() {
  const { user, platformSettings } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const schoolId = (typeof (user as any)?.school === "object" ? (user as any)?.school?.id : (user as any)?.school) || (user as any)?.school_id || "";
  const schoolName = (typeof (user as any)?.school === "object" && (user as any)?.school?.name) || platformSettings?.name || "EduIgnite School";

  // The authoritative subscription amount is the founder-set value from
  // /platform/fees/ (what the backend reads first) — NOT the merged DEFAULT_FEES
  // in platform settings, which would mask a value of 0. A zero fee means the
  // subscription is free and no student is restricted.
  const platformFeesQuery = usePlatformFees();
  const { amount: platformFeeAmount, known: feeKnown } = resolveStudentSubscriptionFee(platformFeesQuery.data, platformSettings);
  const subscriptionRequired = platformFeeAmount > 0;

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [subSchoolFilter, setSubSchoolFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Single payment dialog
  const [paying, setPaying] = useState<any | null>(null);
  const [operator, setOperator] = useState("mtn_momo");
  const [phone, setPhone] = useState("");
  const [txn, setTxn] = useState<any | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Receipt dialog
  const [receipt, setReceipt] = useState<any | null>(null);

  // Bulk dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPhone, setBulkPhone] = useState("");
  const [bulkOperator, setBulkOperator] = useState("mtn_momo");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ name: string; status: string }[]>([]);
  const bulkCancel = useRef(false);

  const studentsQuery = useQuery({
    queryKey: ["subscription-students", schoolId],
    queryFn: async () => normalizeList(await usersService.getUsers({ role: "STUDENT", school: schoolId, page_size: 1000 } as any)),
    enabled: Boolean(schoolId),
  });
  const classesQuery = useHierarchyClasses(schoolId ? { school_id: schoolId } : undefined);

  const students = studentsQuery.data || [];
  const classes = normalizeList(classesQuery.data);
  const subSchools = useMemo(() => Array.from(new Set(students.map(subSchoolOf).filter(Boolean))).sort() as string[], [students]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s: any) => {
      const matchesSearch = !term || s.name?.toLowerCase().includes(term) || s.matricule?.toLowerCase().includes(term) || s.admission_number?.toLowerCase().includes(term);
      const matchesClass = classFilter === ALL || classOf(s) === classFilter;
      const matchesSub = subSchoolFilter === ALL || subSchoolOf(s) === subSchoolFilter;
      const paid = Boolean(s.is_license_paid);
      const matchesStatus = statusFilter === ALL || (statusFilter === "paid" ? paid : !paid);
      return matchesSearch && matchesClass && matchesSub && matchesStatus;
    });
  }, [students, search, classFilter, subSchoolFilter, statusFilter]);

  const pager = usePagination(filtered, 20);
  // When the subscription is free (fee 0), every student is effectively settled.
  const paidCount = useMemo(
    () => (subscriptionRequired ? students.filter((s: any) => s.is_license_paid).length : students.length),
    [students, subscriptionRequired],
  );
  const unpaidCount = Math.max(students.length - paidCount, 0);

  const selectableOnPage = subscriptionRequired ? pager.pageItems.filter((s: any) => !s.is_license_paid) : [];
  const allPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((s: any) => selected.has(String(s.id)));
  const selectedStudents = useMemo(
    () => (subscriptionRequired ? students.filter((s: any) => selected.has(String(s.id)) && !s.is_license_paid) : []),
    [students, selected, subscriptionRequired],
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) selectableOnPage.forEach((s: any) => next.delete(String(s.id)));
      else selectableOnPage.forEach((s: any) => next.add(String(s.id)));
      return next;
    });
  };

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => stopPolling, []);

  const openReceipt = (payment: any) => setReceipt(receiptFromPayment(payment, "Subscription"));

  // ---- single payment ----
  const startPayment = async () => {
    if (!paying) return;
    if (!phone.trim()) {
      toast({ variant: "destructive", title: "Phone required", description: "Enter the mobile money number (e.g. 6XXXXXXXX)." });
      return;
    }
    setStarting(true);
    try {
      const created = await feesService.campayCollect({ purpose: "platform_charge", phone: phone.trim(), student_id: String(paying.id) });
      setTxn(created);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Mobile money failed", description: getApiErrorMessage(error, "Could not start the mobile money request.") });
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    stopPolling();
    if (!txn?.external_reference || txn.status !== "PENDING") return;
    pollRef.current = setInterval(async () => {
      try {
        const updated = await feesService.campayStatus(txn.external_reference);
        if (updated.status === "SUCCESSFUL") {
          stopPolling();
          setTxn(null);
          setPaying(null);
          setPhone("");
          await queryClient.invalidateQueries({ queryKey: ["subscription-students"] });
          if (updated.payment) openReceipt(updated.payment);
          toast({ title: "Subscription paid", description: "Payment received and the student's account is now active." });
        } else if (updated.status === "FAILED") {
          stopPolling();
          setTxn(updated);
          toast({ variant: "destructive", title: "Payment failed", description: updated.reason || "The mobile money payment was not completed." });
        }
      } catch { /* keep polling */ }
    }, 4000);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn?.external_reference, txn?.status]);

  // ---- bulk payment (sequential, one MoMo approval per student) ----
  const waitForTxn = (externalReference: string) =>
    new Promise<any>((resolve) => {
      let tries = 0;
      const timer = setInterval(async () => {
        tries += 1;
        if (bulkCancel.current) { clearInterval(timer); resolve({ status: "FAILED", reason: "Cancelled" }); return; }
        try {
          const updated = await feesService.campayStatus(externalReference);
          if (updated.status === "SUCCESSFUL" || updated.status === "FAILED") { clearInterval(timer); resolve(updated); return; }
        } catch { /* keep polling */ }
        if (tries >= 75) { clearInterval(timer); resolve({ status: "FAILED", reason: "Timed out" }); }
      }, 4000);
    });

  const runBulk = async () => {
    if (!bulkPhone.trim()) {
      toast({ variant: "destructive", title: "Phone required", description: "Enter the mobile money number to charge." });
      return;
    }
    bulkCancel.current = false;
    setBulkRunning(true);
    const queue = [...selectedStudents];
    setBulkProgress(queue.map((s: any) => ({ name: s.name, status: "queued" })));
    let paid = 0;
    for (let i = 0; i < queue.length; i += 1) {
      if (bulkCancel.current) break;
      const student = queue[i];
      setBulkProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "requesting" } : p)));
      try {
        const created = await feesService.campayCollect({ purpose: "platform_charge", phone: bulkPhone.trim(), student_id: String(student.id) });
        setBulkProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "waiting" } : p)));
        const final = await waitForTxn(created.external_reference);
        if (final.status === "SUCCESSFUL") { paid += 1; setBulkProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "paid" } : p))); }
        else setBulkProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "failed" } : p)));
      } catch {
        setBulkProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "failed" } : p)));
      }
    }
    setBulkRunning(false);
    await queryClient.invalidateQueries({ queryKey: ["subscription-students"] });
    setSelected(new Set());
    toast({ title: "Bulk subscription complete", description: `${paid} of ${queue.length} student(s) activated. Receipts are saved to each account.` });
  };

  const receiptHtml = receipt ? buildFeeReceiptHtml(receipt, schoolName) : "";

  return (
    <div className="space-y-6">
      <Card className="border-none bg-primary text-white shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight">
            <Wallet className="h-6 w-6 text-secondary" /> Subscription
          </CardTitle>
          <CardDescription className="text-white/70 max-w-2xl">
            The platform subscription is set by EduIgnite and paid directly through MTN or Orange Money. Payment is real and immediate — a receipt is produced for each one and the student's account is activated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 p-8 pt-2 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Subscription</p><p className="mt-2 text-xl font-black">{platformFeeAmount > 0 ? money(platformFeeAmount) : (feeKnown ? "Free" : "Not set")}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Total Students</p><p className="mt-2 text-xl font-black">{students.length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Paid</p><p className="mt-2 text-xl font-black text-green-300">{paidCount}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Not Yet Paid</p><p className="mt-2 text-xl font-black text-amber-300">{unpaidCount}</p></div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,1fr]">
            <div className="space-y-2">
              <Label>Search Student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-10" placeholder="Name, matricule or admission no..." />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-School</Label>
              <Select value={subSchoolFilter} onValueChange={setSubSchoolFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sub-schools</SelectItem>
                  {subSchools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Not paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedStudents.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-primary"><Users className="h-4 w-4" /> {selectedStudents.length} student(s) selected for bulk subscription</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button size="sm" className="gap-2 rounded-xl font-bold" onClick={() => { setBulkOpen(true); setBulkProgress([]); }}>
                  <Smartphone className="h-4 w-4" /> Pay for selected
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-primary">
                <TableRow className="hover:bg-primary">
                  <TableHead className="w-10 pl-4">
                    <input type="checkbox" checked={allPageSelected} onChange={togglePage} className="h-4 w-4 accent-secondary" aria-label="Select page" />
                  </TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Student</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Matricule</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Class</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Sub-School</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Status</TableHead>
                  <TableHead className="pr-6 text-right text-xs font-black uppercase tracking-widest text-white">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary/40" /></TableCell></TableRow>
                ) : pager.pageItems.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">No students match the current filters.</TableCell></TableRow>
                ) : pager.pageItems.map((s: any) => {
                  const paid = Boolean(s.is_license_paid);
                  return (
                    <TableRow key={s.id} className="odd:bg-accent/5">
                      <TableCell className="pl-4">
                        {subscriptionRequired && !paid ? (
                          <input type="checkbox" checked={selected.has(String(s.id))} onChange={() => toggleOne(String(s.id))} className="h-4 w-4 accent-primary" aria-label={`Select ${s.name}`} />
                        ) : null}
                      </TableCell>
                      <TableCell><p className="font-black text-primary">{s.name}</p><p className="text-xs text-muted-foreground">{s.admission_number || ""}</p></TableCell>
                      <TableCell className="font-mono text-xs">{s.matricule || "—"}</TableCell>
                      <TableCell>{classOf(s) || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{subSchoolOf(s)}</TableCell>
                      <TableCell>
                        <Badge className={cn("border-none font-black uppercase text-[10px]", (!subscriptionRequired || paid) ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{!subscriptionRequired ? "Free" : paid ? "Paid" : "Not paid"}</Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {!subscriptionRequired ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Free</span>
                        ) : paid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Settled</span>
                        ) : (
                          <Button size="sm" className="h-9 gap-2 rounded-xl font-bold" onClick={() => { setPaying(s); setPhone(""); setTxn(null); setOperator("mtn_momo"); }}>
                            <Smartphone className="h-4 w-4" /> Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DataPagination pager={pager} label="students" />
        </CardContent>
      </Card>

      {/* Single payment dialog */}
      <Dialog open={!!paying} onOpenChange={(open) => { if (!open) { setPaying(null); setTxn(null); stopPolling(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5 text-secondary" /> Pay Subscription</DialogTitle>
            <DialogDescription>
              Paying for <span className="font-bold text-primary">{paying?.name}</span>. Real payment to EduIgnite — the amount is fixed by EduIgnite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-accent/10 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount to pay</p>
              <p className="mt-1 text-2xl font-black text-primary">{platformFeeAmount > 0 ? money(platformFeeAmount) : (feeKnown ? "Free" : "Not set")}</p>
            </div>
            <div className="space-y-2">
              <Label>Mobile Money</Label>
              <div className="grid grid-cols-2 gap-2">
                {OPERATORS.map((op) => (
                  <button key={op.value} type="button" onClick={() => setOperator(op.value)}
                    className={cn("rounded-xl border p-3 text-sm font-black transition-all", operator === op.value ? "border-primary bg-primary/5 ring-1 ring-primary text-primary" : "hover:bg-accent/20")}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{operator === "orange_money" ? "Orange" : "MTN"} Money Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XXXXXXXX" className="h-11 rounded-xl" disabled={txn?.status === "PENDING"} />
            </div>
            {txn?.status === "PENDING" ? (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-primary">
                <Loader2 className="h-5 w-5 animate-spin" /> Approve the payment on the phone. Waiting for confirmation...
              </div>
            ) : null}
            {txn?.status === "FAILED" ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{txn.reason || "The payment was not completed. You can try again."}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaying(null); setTxn(null); stopPolling(); }}>Close</Button>
            <Button onClick={startPayment} disabled={starting || txn?.status === "PENDING"} className="gap-2">
              {starting || txn?.status === "PENDING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Request payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk payment dialog */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkRunning) { setBulkOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><Users className="h-5 w-5 text-secondary" /> Bulk Subscription</DialogTitle>
            <DialogDescription>
              Charge the subscription for {selectedStudents.length} student(s) from one mobile money number. Each student needs one approval on the phone, processed one after another.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mobile Money</Label>
              <div className="grid grid-cols-2 gap-2">
                {OPERATORS.map((op) => (
                  <button key={op.value} type="button" onClick={() => setBulkOperator(op.value)} disabled={bulkRunning}
                    className={cn("rounded-xl border p-3 text-sm font-black transition-all", bulkOperator === op.value ? "border-primary bg-primary/5 ring-1 ring-primary text-primary" : "hover:bg-accent/20")}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{bulkOperator === "orange_money" ? "Orange" : "MTN"} Money Number</Label>
              <Input value={bulkPhone} onChange={(e) => setBulkPhone(e.target.value)} placeholder="6XXXXXXXX" className="h-11 rounded-xl" disabled={bulkRunning} />
            </div>
            {bulkProgress.length > 0 ? (
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border p-3">
                {bulkProgress.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="truncate font-semibold text-primary">{p.name}</span>
                    <Badge className={cn("border-none text-[9px] font-black uppercase",
                      p.status === "paid" ? "bg-green-100 text-green-700" :
                      p.status === "failed" ? "bg-red-100 text-red-700" :
                      p.status === "waiting" || p.status === "requesting" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>
                      {p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            {bulkRunning ? (
              <Button variant="outline" onClick={() => { bulkCancel.current = true; }}>Stop</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBulkOpen(false)}>Close</Button>
                <Button onClick={runBulk} className="gap-2"><Smartphone className="h-4 w-4" /> Start bulk payment</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) setReceipt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><CheckCircle2 className="h-5 w-5 text-green-600" /> Subscription Receipt</DialogTitle>
            <DialogDescription>The subscription payment was received.</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="rounded-2xl border bg-accent/10 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Receipt No.</span><span className="font-mono font-bold text-primary">{receipt.receiptNo}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Student</span><span className="font-bold text-primary">{receipt.studentName}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-black text-primary">{money(receipt.amount, receipt.currency)}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Method</span><span className="font-bold text-primary">{receipt.method}</span></div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadReceiptHtml(receiptHtml, `receipt_${receipt?.receiptNo || "subscription"}.html`)}><Download className="h-4 w-4" /> Download</Button>
            <Button className="gap-2" onClick={() => printReceiptHtml(receiptHtml)}><Printer className="h-4 w-4" /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Subscription;
