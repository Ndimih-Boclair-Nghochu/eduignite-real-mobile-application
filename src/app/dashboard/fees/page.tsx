"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Coins, Download, GraduationCap, Loader2, PencilLine, Printer, Search, ShieldAlert, Wallet } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { generateAnnualFeeReport } from "@/lib/pdf-generation-service";
import { downloadHtmlDocument, escapeHtml } from "@/lib/browser-download";
import {
  useCreateFeeStructure,
  useCreateSchoolFeeAssignment,
  useFeeStructures,
  useSchoolFeeAssignments,
  useSchoolFeeSummary,
  useStudentSchoolFees,
  useUpdateSchoolFeeAssignment,
  useUpdateStudentSchoolFeeRecord,
} from "@/lib/hooks/useFees";
import { useMySchool, useHierarchyClasses } from "@/lib/hooks/useSchools";
import type { FeeStructure, SchoolFeeAssignment, StudentSchoolFeeRecord } from "@/lib/api/types";
import { BursarPayments } from "./bursar-payments";

const DEFAULT_CURRENCY = "XAF";
const ALL_CLASSES = "all-classes";
const ALL_STATUSES = "all-statuses";

function formatMoney(value: number | string | undefined, currency = DEFAULT_CURRENCY) {
  const amount = Number(value || 0);
  return `${currency} ${amount.toLocaleString()}`;
}

function toNumber(value: number | string | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function derivePaymentState(totalAmount: number, amountPaid: number) {
  const safeTotal = Math.max(totalAmount, 0);
  const safePaid = Math.max(amountPaid, 0);
  const balance = Math.max(safeTotal - safePaid, 0);
  if (safeTotal === 0 || safePaid >= safeTotal) {
    return { status: "paid", balance };
  }
  if (safePaid > 0) {
    return { status: "incomplete", balance };
  }
  return { status: "unpaid", balance };
}

function humanizeStatus(status: string) {
  if (status === "paid") return "Paid";
  if (status === "incomplete") return "Incomplete Payment";
  if (status === "unpaid") return "Unpaid";
  return status;
}

function statusBadgeClass(status: string) {
  if (status === "paid") return "bg-green-100 text-green-700";
  if (status === "incomplete") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export default function FeesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const canManageSchoolFees = user?.role === "BURSAR" || user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const canViewOwnFees = user?.role === "STUDENT" || user?.role === "PARENT";

  const { data: schoolProfile } = useMySchool();
  const classesQuery = useHierarchyClasses(undefined, canManageSchoolFees);
  const assignmentsQuery = useSchoolFeeAssignments({ page_size: 200 }, canManageSchoolFees);
  const feeStructuresQuery = useFeeStructures({ page_size: 200 });

  const [search, setSearch] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState(ALL_CLASSES);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState(ALL_STATUSES);
  const deferredSearch = useDeferredValue(search);

  const summaryFilters = {
    school_class: selectedClassFilter !== ALL_CLASSES ? selectedClassFilter : undefined,
    status: selectedStatusFilter !== ALL_STATUSES ? selectedStatusFilter : undefined,
    search: deferredSearch.trim() || undefined,
  };

  const summaryQuery = useSchoolFeeSummary(summaryFilters, canManageSchoolFees);
  const recordsQuery = useStudentSchoolFees({
    page_size: 500,
    school_class: selectedClassFilter !== ALL_CLASSES ? selectedClassFilter : undefined,
    status: selectedStatusFilter !== ALL_STATUSES ? selectedStatusFilter : undefined,
    search: deferredSearch.trim() || undefined,
  }, canManageSchoolFees || canViewOwnFees);

  const createAssignmentMutation = useCreateSchoolFeeAssignment();
  const createFeeStructureMutation = useCreateFeeStructure();
  const updateAssignmentMutation = useUpdateSchoolFeeAssignment();
  const updateRecordMutation = useUpdateStudentSchoolFeeRecord();

  const [allocationClassId, setAllocationClassId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [allocationAcademicYear, setAllocationAcademicYear] = useState("");
  const [allocationNotes, setAllocationNotes] = useState("");
  const [feeTypeName, setFeeTypeName] = useState("");
  const [feeTypeRole, setFeeTypeRole] = useState("STUDENT");
  const [feeTypeClassId, setFeeTypeClassId] = useState(ALL_CLASSES);
  const [feeTypeAmount, setFeeTypeAmount] = useState("");
  const [feeTypeDueDate, setFeeTypeDueDate] = useState("");
  const [feeTypeDescription, setFeeTypeDescription] = useState("");
  const [activeRecord, setActiveRecord] = useState<StudentSchoolFeeRecord | null>(null);
  const [recordAmountPaid, setRecordAmountPaid] = useState("");
  const [recordNotes, setRecordNotes] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const classes = classesQuery.data ?? [];
  const assignments = assignmentsQuery.data?.results ?? [];
  const feeStructures = feeStructuresQuery.data?.results ?? [];
  const records = recordsQuery.data?.results ?? [];
  const summary = summaryQuery.data;
  const ownFeeTotals = useMemo(() => {
    const totalExpected = records.reduce((sum, record) => sum + toNumber(record.total_amount), 0);
    const totalPaid = records.reduce((sum, record) => sum + toNumber(record.amount_paid), 0);
    const totalBalance = records.reduce((sum, record) => sum + toNumber(record.balance), 0);
    const paidItems = records.filter((record) => record.status === "paid").length;
    const collectionRate = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;
    return { totalExpected, totalPaid, totalBalance, paidItems, collectionRate };
  }, [records]);

  const selectedAssignment = useMemo<SchoolFeeAssignment | null>(
    () => assignments.find((assignment) => assignment.school_class === allocationClassId) ?? null,
    [allocationClassId, assignments]
  );

  useEffect(() => {
    const defaultAcademicYear = schoolProfile?.settings?.academic_year || "";
    if (!allocationClassId && classes.length) {
      setAllocationClassId(classes[0].id);
    }
    if (!allocationAcademicYear && defaultAcademicYear) {
      setAllocationAcademicYear(defaultAcademicYear);
    }
  }, [allocationAcademicYear, allocationClassId, classes, schoolProfile?.settings?.academic_year]);

  useEffect(() => {
    if (!allocationClassId) return;
    if (selectedAssignment) {
      setAllocationAmount(String(selectedAssignment.amount ?? ""));
      setAllocationAcademicYear(selectedAssignment.academic_year || schoolProfile?.settings?.academic_year || "");
      setAllocationNotes(selectedAssignment.notes || "");
      return;
    }
    setAllocationAmount("");
    setAllocationAcademicYear(schoolProfile?.settings?.academic_year || "");
    setAllocationNotes("");
  }, [allocationClassId, schoolProfile?.settings?.academic_year, selectedAssignment]);

  useEffect(() => {
    if (!activeRecord) return;
    setRecordAmountPaid(String(activeRecord.amount_paid ?? "0"));
    setRecordNotes(activeRecord.notes || "");
  }, [activeRecord]);

  const anyError = classesQuery.isError || assignmentsQuery.isError || summaryQuery.isError || recordsQuery.isError;

  const retryAll = async () => {
    await Promise.allSettled([
      classesQuery.refetch(),
      assignmentsQuery.refetch(),
      summaryQuery.refetch(),
      recordsQuery.refetch(),
    ]);
  };

  const handleSaveAllocation = async () => {
    if (!allocationClassId || !allocationAmount.trim() || !allocationAcademicYear.trim()) {
      toast({
        variant: "destructive",
        title: "Incomplete class fee allocation",
        description: "Select a class, enter the school fee amount, and confirm the academic year.",
      });
      return;
    }

    try {
      if (selectedAssignment) {
        await updateAssignmentMutation.mutateAsync({
          id: selectedAssignment.id,
          data: {
            school_class: allocationClassId,
            amount: allocationAmount,
            academic_year: allocationAcademicYear,
            currency: DEFAULT_CURRENCY,
            notes: allocationNotes.trim() || undefined,
            is_active: true,
          },
        });
      } else {
        await createAssignmentMutation.mutateAsync({
          school_class: allocationClassId,
          amount: allocationAmount,
          academic_year: allocationAcademicYear,
          currency: DEFAULT_CURRENCY,
          notes: allocationNotes.trim() || undefined,
          is_active: true,
        });
      }

      toast({
        title: "Class fee saved",
        description: "The school fee has been allocated to every learner currently registered in that class.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save class fee",
        description: getApiErrorMessage(error, "The class school-fee allocation could not be saved."),
      });
    }
  };

  const handleCreateFeeType = async () => {
    const amount = Number(feeTypeAmount);
    const academicYear =
      allocationAcademicYear.trim()
      || String((schoolProfile as any)?.settings?.academic_year || (schoolProfile as any)?.academic_year || new Date().getFullYear());

    if (!feeTypeName.trim() || !Number.isFinite(amount) || amount < 0) {
      toast({
        variant: "destructive",
        title: "Incomplete fee type",
        description: "Enter a fee name and a valid amount before saving.",
      });
      return;
    }

    try {
      await createFeeStructureMutation.mutateAsync({
        name: feeTypeName.trim(),
        role: feeTypeRole,
        school_class: feeTypeRole === "STUDENT" && feeTypeClassId !== ALL_CLASSES ? feeTypeClassId : undefined,
        amount: feeTypeAmount,
        currency: DEFAULT_CURRENCY,
        academic_year: academicYear,
        due_date: feeTypeDueDate || undefined,
        is_mandatory: true,
        description: feeTypeDescription.trim() || undefined,
      });
      setFeeTypeName("");
      setFeeTypeClassId(ALL_CLASSES);
      setFeeTypeAmount("");
      setFeeTypeDueDate("");
      setFeeTypeDescription("");
      toast({
        title: "Fee type saved",
        description: "The fee type is now available to the bursar workflow and payment records.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save fee type",
        description: getApiErrorMessage(error, "The fee type could not be saved."),
      });
    }
  };

  const handleSaveStudentRecord = async () => {
    if (!activeRecord) return;

    try {
      await updateRecordMutation.mutateAsync({
        id: activeRecord.id,
        data: {
          amount_paid: recordAmountPaid || "0",
          notes: recordNotes.trim() || undefined,
        },
      });
      toast({
        title: "Student fee record updated",
        description: "The payment status was recalculated from the recorded school fee amount.",
      });
      setActiveRecord(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update student fee record",
        description: getApiErrorMessage(error, "The student school-fee record could not be updated."),
      });
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const academicYear = allocationAcademicYear || schoolProfile?.settings?.academic_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
      await generateAnnualFeeReport(
        {
          name: schoolProfile?.name || user?.school?.name || "EduIgnite School",
          logo: schoolProfile?.logo || user?.school?.logo,
          motto: schoolProfile?.motto || user?.school?.motto,
          region: schoolProfile?.region || user?.school?.region,
          location: schoolProfile?.location || user?.school?.location,
          matricule: (schoolProfile as any)?.matricule || user?.school?.id || "",
        },
        { summary, records },
        academicYear
      );
    } catch (error) {
      toast({
        variant: "destructive",
        title: "PDF export failed",
        description: getApiErrorMessage(error, "We could not download the school-fee report right now."),
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const downloadStudentFeeReceipt = (record: StudentSchoolFeeRecord) => {
    const academicYear = schoolProfile?.settings?.academic_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    const schoolName = schoolProfile?.name || user?.school?.name || "EduIgnite School";
    const schoolLogo = schoolProfile?.logo || user?.school?.logo || "";
    const receiptNo = `EIG-FEE-${String(record.id).slice(0, 8).toUpperCase()}`;
    const generatedAt = new Date().toLocaleString();
    const status = humanizeStatus(record.status);
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(receiptNo)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #15243b; margin: 0; background: #f4f7fb; }
    .page { width: 780px; margin: 24px auto; background: #fff; border: 1px solid #d9e2ef; box-shadow: 0 12px 30px rgba(15, 23, 42, .08); }
    .header { display: flex; gap: 18px; align-items: center; padding: 26px 32px; border-bottom: 6px solid #264D73; }
    .logo { width: 68px; height: 68px; object-fit: contain; border: 1px solid #d9e2ef; border-radius: 12px; padding: 6px; }
    h1 { margin: 0; color: #264D73; font-size: 22px; text-transform: uppercase; letter-spacing: .03em; }
    .subtitle { margin: 5px 0 0; font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 24px 32px; }
    .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; background: #f8fafc; }
    .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .12em; font-weight: 800; }
    .value { margin-top: 6px; font-size: 15px; font-weight: 800; color: #0f172a; }
    table { width: calc(100% - 64px); margin: 8px 32px 24px; border-collapse: collapse; }
    th { background: #264D73; color: white; text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; }
    td { padding: 13px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .status { display: inline-block; border-radius: 999px; padding: 6px 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; background: #dcfce7; color: #166534; }
    .status.incomplete { background: #fef3c7; color: #92400e; }
    .status.unpaid { background: #fee2e2; color: #991b1b; }
    .footer { padding: 18px 32px 26px; color: #64748b; font-size: 11px; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; }
    @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; width: 100%; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      ${schoolLogo ? `<img class="logo" src="${escapeHtml(schoolLogo)}" alt="${escapeHtml(schoolName)} logo" />` : ""}
      <div>
        <h1>${escapeHtml(schoolName)}</h1>
        <p class="subtitle">Official Student Fee Receipt / Recu officiel des frais scolaires</p>
        <p class="subtitle">Academic Year: ${escapeHtml(academicYear)}</p>
      </div>
    </section>
    <section class="meta">
      <div class="box"><div class="label">Receipt No.</div><div class="value">${escapeHtml(receiptNo)}</div></div>
      <div class="box"><div class="label">Generated</div><div class="value">${escapeHtml(generatedAt)}</div></div>
      <div class="box"><div class="label">Student</div><div class="value">${escapeHtml(record.student_name || user?.name || "Student")}</div></div>
      <div class="box"><div class="label">Matricule</div><div class="value">${escapeHtml(record.student_matricule || record.admission_number || user?.matricule || "")}</div></div>
      <div class="box"><div class="label">Class</div><div class="value">${escapeHtml(record.class_name || "Class not assigned")}</div></div>
      <div class="box"><div class="label">Sub-School</div><div class="value">${escapeHtml(record.sub_school_name || "Main school")}</div></div>
    </section>
    <table>
      <thead>
        <tr><th>Fee Type</th><th>Total Due</th><th>Amount Paid</th><th>Balance</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>School Fees - ${escapeHtml(record.class_name || "Registered Class")}</td>
          <td>${escapeHtml(formatMoney(record.total_amount))}</td>
          <td>${escapeHtml(formatMoney(record.amount_paid))}</td>
          <td>${escapeHtml(formatMoney(record.balance))}</td>
          <td><span class="status ${escapeHtml(record.status)}">${escapeHtml(status)}</span></td>
        </tr>
      </tbody>
    </table>
    <section class="footer">
      <span>Generated by EduIgnite Platform</span>
      <span>${escapeHtml(record.notes || "This receipt reflects the latest approved school fee record.")}</span>
    </section>
  </main>
</body>
</html>`;
    const safeName = `${receiptNo}_${record.student_name || "student"}`.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    downloadHtmlDocument(html, `${safeName}.html`);
  };

  const recordPreview = useMemo(() => {
    if (!activeRecord) {
      return { status: "unpaid", balance: 0 };
    }
    return derivePaymentState(toNumber(activeRecord.total_amount), toNumber(recordAmountPaid));
  }, [activeRecord, recordAmountPaid]);

  if (canViewOwnFees) {
    if (recordsQuery.isLoading) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground">Loading your school fee records...</p>
        </div>
      );
    }

    if (recordsQuery.isError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-bold">Could not load fee records</h2>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            We could not reach your school-fee ledger. Please retry, and contact the bursar if the issue continues.
          </p>
          <Button onClick={() => recordsQuery.refetch()}>
            <Loader2 className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-8 pb-20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full shadow-sm hover:bg-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="rounded-2xl border-2 border-white bg-primary p-3 shadow-xl">
              <Wallet className="h-6 w-6 text-secondary md:h-8 md:w-8" />
            </div>
            <div>
              <h1 className="font-headline text-2xl font-bold uppercase tracking-tighter text-primary md:text-3xl">
                {user?.role === "PARENT" ? "Children Fee Status" : "My School Fees"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                View assigned school fees, payment status, balance, and download official receipts from your live records.
              </p>
            </div>
          </div>
          <Button variant="outline" className="h-12 rounded-xl border-primary/20 bg-white px-5 font-bold" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Fees", value: formatMoney(ownFeeTotals.totalExpected), icon: Coins },
            { label: "Amount Paid", value: formatMoney(ownFeeTotals.totalPaid), icon: Wallet },
            { label: "Balance", value: formatMoney(ownFeeTotals.totalBalance), icon: AlertCircle },
            { label: "Payment Rate", value: `${ownFeeTotals.collectionRate}%`, icon: GraduationCap },
          ].map((card) => (
            <Card key={card.label} className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{card.label}</CardTitle>
                <card.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-primary">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-primary">Fee Items</CardTitle>
            <CardDescription>
              Each row represents an official class fee allocation and the latest payment status recorded by the school bursar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr,220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-12 rounded-xl pl-10"
                  placeholder="Search by student, class, matricule, or admission number..."
                />
              </div>
              <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="incomplete">Incomplete Payment</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Type</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Total Due</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>
                          <p className="font-bold text-primary">School Fees - {record.class_name || "Registered Class"}</p>
                          <p className="text-xs text-muted-foreground">{record.sub_school_name || "Main school"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-bold text-primary">{record.student_name || user?.name || "Student"}</p>
                          <p className="text-xs text-muted-foreground">{record.student_matricule || record.admission_number || user?.matricule}</p>
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(record.total_amount)}</TableCell>
                      <TableCell>{formatMoney(record.amount_paid)}</TableCell>
                      <TableCell>{formatMoney(record.balance)}</TableCell>
                      <TableCell>
                        <Badge className={`${statusBadgeClass(record.status)} border-none text-[10px] font-black uppercase`}>
                          {humanizeStatus(record.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="rounded-xl font-bold" onClick={() => downloadStudentFeeReceipt(record)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!records.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                        No school-fee records have been published for this account yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-muted-foreground">
              Receipts reflect the latest approved record from your school. For cash corrections or missing payments, contact the bursar or school administrator.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canManageSchoolFees) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold">Finance portal unavailable</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Only bursars and school administrators can manage school-fee allocations and fee status updates.
        </p>
      </div>
    );
  }

  if (anyError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold">Failed to load school fee data</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          The bursar school-fee ledger could not be reached. Retry after confirming the backend is online.
        </p>
        <Button onClick={retryAll}>
          <Loader2 className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border-2 border-white bg-primary p-3 shadow-xl">
              <Wallet className="h-6 w-6 text-secondary md:h-8 md:w-8" />
            </div>
            <div>
              <h1 className="font-headline text-2xl font-bold uppercase tracking-tighter text-primary md:text-3xl">
                {user?.role === "BURSAR" ? "Bursar Fee Portal" : "School Fees & Finance"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                Allocate school fees by class, track payment status per learner, and export the live school-fee report in PDF format.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-12 rounded-xl border-primary/20 bg-white px-5 font-bold" onClick={handleDownloadPdf} disabled={downloadingPdf}>
            {downloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Annual Report (PDF)
          </Button>
          <Button variant="outline" className="h-12 rounded-xl border-primary/20 bg-white px-5 font-bold" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-primary">Platform Fee Protection</p>
            <p className="text-sm text-muted-foreground">
              This portal only updates school-fee records. Platform fee status stays read-only here and can only change through the actual platform payment flow.
            </p>
          </div>
          <Badge className="w-fit border-none bg-amber-100 px-3 py-1 text-amber-700">Protected</Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total To Collect",
            value: formatMoney(summary?.school_totals?.total_expected),
            icon: Coins,
          },
          {
            label: "Collected",
            value: formatMoney(summary?.school_totals?.total_collected),
            icon: Wallet,
          },
          {
            label: "Outstanding",
            value: formatMoney(summary?.school_totals?.total_outstanding),
            icon: AlertCircle,
          },
          {
            label: "Collection Rate",
            value: `${toNumber(summary?.school_totals?.collection_rate).toFixed(0)}%`,
            icon: GraduationCap,
          },
        ].map((card) => (
          <Card key={card.label} className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{card.label}</CardTitle>
              <card.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border bg-white p-1.5 shadow-sm sm:w-auto sm:grid-cols-5">
          <TabsTrigger value="payments" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Record Payment</TabsTrigger>
          <TabsTrigger value="overview" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="registry" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Student Registry</TabsTrigger>
          <TabsTrigger value="allocation" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Class Allocation</TabsTrigger>
          <TabsTrigger value="fee-types" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Fee Types</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-6 space-y-6">
          <BursarPayments />
        </TabsContent>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Whole-School Fee Position</CardTitle>
              <CardDescription>
                Expected collection is calculated from the allocated school fee for each class multiplied by the number of learners currently in that class.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border bg-accent/10 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Classes With Fee Plans</p>
                <p className="mt-3 text-2xl font-black text-primary">{summary?.school_totals?.class_count ?? 0}</p>
              </div>
              <div className="rounded-2xl border bg-accent/10 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Learners Covered</p>
                <p className="mt-3 text-2xl font-black text-primary">{summary?.school_totals?.student_count ?? 0}</p>
              </div>
              <div className="rounded-2xl border bg-accent/10 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Paid Learners</p>
                <p className="mt-3 text-2xl font-black text-primary">{summary?.school_totals?.paid_students ?? 0}</p>
              </div>
              <div className="rounded-2xl border bg-accent/10 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Incomplete / Unpaid</p>
                <p className="mt-3 text-2xl font-black text-primary">
                  {(summary?.school_totals?.incomplete_students ?? 0) + (summary?.school_totals?.unpaid_students ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Class Fee Breakdown</CardTitle>
              <CardDescription>
                Every class summary shows the fee set per learner, the total expected collection, what has been collected, and what remains.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Fee / Learner</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Total Expected</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status Mix</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary?.classes?.length ? (
                    summary.classes.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div>
                            <p className="font-bold text-primary">{row.class_name}</p>
                            <p className="text-xs text-muted-foreground">{row.sub_school_name || "General"}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatMoney(row.fee_amount, row.currency)}</TableCell>
                        <TableCell>{row.student_count}</TableCell>
                        <TableCell>{formatMoney(row.total_expected, row.currency)}</TableCell>
                        <TableCell>{formatMoney(row.total_collected, row.currency)}</TableCell>
                        <TableCell>{formatMoney(row.total_outstanding, row.currency)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.paid_students} paid / {row.incomplete_students} incomplete / {row.unpaid_students} unpaid
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-20 text-center text-sm text-muted-foreground">
                        No class fee allocations have been saved yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registry" className="mt-6 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Student School-Fee Registry</CardTitle>
              <CardDescription>
                Search a learner, filter by class or payment status, then update the recorded amount paid. The platform recalculates the balance and status automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,auto]">
                <div className="space-y-2">
                  <Label>Search Student</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-12 rounded-xl pl-10"
                      placeholder="Search by learner name, email, matricule, or admission number..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Filter by Class</Label>
                  <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                      {classes.map((schoolClass) => (
                        <SelectItem key={schoolClass.id} value={schoolClass.id}>
                          {schoolClass.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Filter by Status</Label>
                  <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="incomplete">Incomplete Payment</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" className="h-12 rounded-xl px-5 font-bold" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                    {downloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Annual PDF
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border bg-accent/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Filtered Learners</p>
                  <p className="mt-3 text-2xl font-black text-primary">{summary?.filtered_totals?.student_count ?? 0}</p>
                </div>
                <div className="rounded-2xl border bg-accent/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Filtered Expected</p>
                  <p className="mt-3 text-2xl font-black text-primary">{formatMoney(summary?.filtered_totals?.total_expected)}</p>
                </div>
                <div className="rounded-2xl border bg-accent/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Filtered Collected</p>
                  <p className="mt-3 text-2xl font-black text-primary">{formatMoney(summary?.filtered_totals?.total_collected)}</p>
                </div>
                <div className="rounded-2xl border bg-accent/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Filtered Outstanding</p>
                  <p className="mt-3 text-2xl font-black text-primary">{formatMoney(summary?.filtered_totals?.total_outstanding)}</p>
                </div>
              </div>

              {recordsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Total Fee</TableHead>
                      <TableHead>Amount Paid</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length ? (
                      records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <div>
                              <p className="font-bold text-primary">{record.student_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {record.student_matricule} {record.admission_number ? `• ${record.admission_number}` : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{record.class_name}</p>
                              <p className="text-xs text-muted-foreground">{record.sub_school_name || "General"}</p>
                            </div>
                          </TableCell>
                          <TableCell>{formatMoney(record.total_amount)}</TableCell>
                          <TableCell>{formatMoney(record.amount_paid)}</TableCell>
                          <TableCell>{formatMoney(record.balance)}</TableCell>
                          <TableCell>
                            <Badge className={`border-none ${statusBadgeClass(record.status)}`}>{humanizeStatus(record.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {record.last_recorded_at ? new Date(record.last_recorded_at).toLocaleDateString() : "Not yet updated"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveRecord(record)}>
                              <PencilLine className="mr-2 h-4 w-4" />
                              Update
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-20 text-center text-sm text-muted-foreground">
                          No school-fee records matched the current filters. Allocate a class fee first if this school has not started the bursar workflow yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocation" className="mt-6 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Allocate School Fee to a Class</CardTitle>
              <CardDescription>
                Select the class, set the total school fee per learner, and the backend applies it to every student currently registered in that class.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={allocationClassId} onValueChange={setAllocationClassId}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((schoolClass) => (
                      <SelectItem key={schoolClass.id} value={schoolClass.id}>
                        {schoolClass.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Input
                  value={allocationAcademicYear}
                  onChange={(event) => setAllocationAcademicYear(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="2026-2027"
                />
              </div>
              <div className="space-y-2">
                <Label>Total School Fee Per Learner</Label>
                <Input
                  type="number"
                  value={allocationAmount}
                  onChange={(event) => setAllocationAmount(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={DEFAULT_CURRENCY} readOnly className="h-12 rounded-xl bg-muted" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Input
                  value={allocationNotes}
                  onChange={(event) => setAllocationNotes(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="Optional class fee notes"
                />
              </div>
            </CardContent>
            <div className="px-6 pb-6">
              <Button
                className="h-12 w-full rounded-xl font-black uppercase"
                onClick={handleSaveAllocation}
                disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
              >
                {createAssignmentMutation.isPending || updateAssignmentMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Coins className="mr-2 h-4 w-4" />
                )}
                {selectedAssignment ? "Update Class Fee" : "Save Class Fee"}
              </Button>
            </div>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Current Class Fee Plans</CardTitle>
              <CardDescription>
                These allocations feed the bursar registry and the school-admin finance totals automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignments.length ? (
                assignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border bg-accent/10 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-bold text-primary">{assignment.school_class_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.academic_year} • {assignment.sub_school_name || "General"} • {assignment.student_count || 0} learners
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-none bg-primary/10 text-primary">{formatMoney(assignment.amount, assignment.currency)}</Badge>
                        <Badge className="border-none bg-green-100 text-green-700">{formatMoney(assignment.total_collected, assignment.currency)} collected</Badge>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No class school-fee allocations have been created yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fee-types" className="mt-6 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Create Fee Type</CardTitle>
              <CardDescription>
                Bursars can define official fee types such as registration, exams, PTA, boarding, or development fees. These become available to payment records for the selected academic year.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Fee Name</Label>
                <Input
                  value={feeTypeName}
                  onChange={(event) => setFeeTypeName(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="e.g. PTA Levy, Exam Fee, Development Fee"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Account</Label>
                <Select
                  value={feeTypeRole}
                  onValueChange={(value) => {
                    setFeeTypeRole(value);
                    if (value !== "STUDENT") setFeeTypeClassId(ALL_CLASSES);
                  }}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT">Students</SelectItem>
                    <SelectItem value="PARENT">Parents</SelectItem>
                    <SelectItem value="TEACHER">Teachers</SelectItem>
                    <SelectItem value="STAFF">Other Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Which Students / Class</Label>
                <Select value={feeTypeClassId} onValueChange={setFeeTypeClassId} disabled={feeTypeRole !== "STUDENT"}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLASSES}>All student classes</SelectItem>
                    {classes.map((schoolClass) => (
                      <SelectItem key={schoolClass.id} value={schoolClass.id}>
                        {schoolClass.name}{schoolClass.sub_school_name ? ` - ${schoolClass.sub_school_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Example: choose Form 1 when this fee applies only to Form 1 students.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={feeTypeAmount}
                  onChange={(event) => setFeeTypeAmount(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={feeTypeDueDate}
                  onChange={(event) => setFeeTypeDueDate(event.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Input
                  value={feeTypeDescription}
                  onChange={(event) => setFeeTypeDescription(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="Optional description shown to the finance team"
                />
              </div>
            </CardContent>
            <div className="px-6 pb-6">
              <Button
                onClick={handleCreateFeeType}
                disabled={createFeeStructureMutation.isPending}
                className="h-12 rounded-xl bg-primary px-6 font-black uppercase tracking-widest text-white"
              >
                {createFeeStructureMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Coins className="mr-2 h-4 w-4" />}
                Save Fee Type
              </Button>
            </div>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary">Configured Fee Types</CardTitle>
              <CardDescription>Official fee catalogue for this school.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Fee Type</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Class / Form</TableHead>
                    <TableHead>Academic Year</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeStructures.length ? feeStructures.map((fee: FeeStructure) => (
                    <TableRow key={fee.id}>
                      <TableCell className="pl-6">
                        <p className="font-bold text-primary">{fee.name}</p>
                        {fee.description ? <p className="text-xs text-muted-foreground">{fee.description}</p> : null}
                      </TableCell>
                      <TableCell><Badge variant="outline">{fee.role}</Badge></TableCell>
                      <TableCell>
                        {fee.school_class_name ? (
                          <div>
                            <p className="font-semibold">{fee.school_class_name}</p>
                            <p className="text-xs text-muted-foreground">{fee.sub_school_name || "Main school"}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">All classes</span>
                        )}
                      </TableCell>
                      <TableCell>{fee.academic_year}</TableCell>
                      <TableCell>{formatMoney(fee.amount, fee.currency || DEFAULT_CURRENCY)}</TableCell>
                      <TableCell>{fee.due_date ? new Date(fee.due_date).toLocaleDateString() : "Flexible"}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center text-sm text-muted-foreground">
                        No fee types have been configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!activeRecord} onOpenChange={(open) => !open && setActiveRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Student School-Fee Status</DialogTitle>
            <DialogDescription>
              Enter the amount paid so far. If it matches the total school fee, the learner becomes fully paid. If there is a balance left, the record stays incomplete.
            </DialogDescription>
          </DialogHeader>
          {activeRecord ? (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border bg-accent/10 p-4">
                <p className="font-bold text-primary">{activeRecord.student_name}</p>
                <p className="text-xs text-muted-foreground">{activeRecord.class_name}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Total School Fee</Label>
                  <Input readOnly value={formatMoney(activeRecord.total_amount)} className="h-12 rounded-xl bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Amount Paid So Far</Label>
                  <Input
                    type="number"
                    value={recordAmountPaid}
                    onChange={(event) => setRecordAmountPaid(event.target.value)}
                    className="h-12 rounded-xl"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Internal Note</Label>
                <Input
                  value={recordNotes}
                  onChange={(event) => setRecordNotes(event.target.value)}
                  className="h-12 rounded-xl"
                  placeholder="Optional bursar note"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-accent/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Balance Left</p>
                  <p className="mt-2 text-xl font-black text-primary">{formatMoney(recordPreview.balance)}</p>
                </div>
                <div className="rounded-2xl border bg-accent/10 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Calculated Status</p>
                  <Badge className={`mt-2 border-none ${statusBadgeClass(recordPreview.status)}`}>{humanizeStatus(recordPreview.status)}</Badge>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveRecord(null)}>Cancel</Button>
            <Button onClick={handleSaveStudentRecord} disabled={updateRecordMutation.isPending}>
              {updateRecordMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
