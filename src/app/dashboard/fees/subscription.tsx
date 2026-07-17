"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { Search, Loader2, CheckCircle2, Wallet, Clock } from "lucide-react";
import { usersService } from "@/lib/api/services/users.service";
import { usePlatformFees } from "@/lib/hooks/usePlatform";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { cn } from "@/lib/utils";
import { money } from "./fee-receipt";
import { resolveStudentSubscriptionFee, studentSubscriptionBlocks } from "./subscription-access";

/**
 * Subscription tab — shows every student's platform-subscription status.
 *
 * Online subscription collection is being migrated to a new payment gateway, so
 * this view is read-only for now: it reports who is settled, free, or owing,
 * using the authoritative founder-set fee from /platform/fees/.
 */

const ALL = "all";

const normalizeList = (payload: any): any[] =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
const classOf = (s: any) => s.student_class || s.class_name || s.school_class_name || s.className || "";
const subSchoolOf = (s: any) => s.sub_school_name || s.subSchoolName || s.section || "General";

export function Subscription() {
  const { user, platformSettings } = useAuth();
  const schoolId = (typeof (user as any)?.school === "object" ? (user as any)?.school?.id : (user as any)?.school) || (user as any)?.school_id || "";

  const platformFeesQuery = usePlatformFees();
  const { amount: platformFeeAmount, known: feeKnown } = resolveStudentSubscriptionFee(platformFeesQuery.data, platformSettings);
  const subscriptionRequired = platformFeeAmount > 0;

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [subSchoolFilter, setSubSchoolFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

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
  const paidCount = useMemo(
    () => (subscriptionRequired ? students.filter((s: any) => s.is_license_paid).length : students.length),
    [students, subscriptionRequired],
  );
  const unpaidCount = Math.max(students.length - paidCount, 0);

  return (
    <div className="space-y-6">
      <Card className="border-none bg-primary text-white shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight">
            <Wallet className="h-6 w-6 text-secondary" /> Subscription
          </CardTitle>
          <CardDescription className="text-white/70 max-w-2xl">
            The platform subscription is set by EduIgnite. This view shows each student&apos;s current subscription status.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 p-8 pt-2 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Subscription</p><p className="mt-2 text-xl font-black">{platformFeeAmount > 0 ? money(platformFeeAmount) : (feeKnown ? "Free" : "Not set")}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Total Students</p><p className="mt-2 text-xl font-black">{students.length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Settled</p><p className="mt-2 text-xl font-black text-green-300">{paidCount}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Owing</p><p className="mt-2 text-xl font-black text-amber-300">{unpaidCount}</p></div>
        </CardContent>
      </Card>

      {subscriptionRequired ? (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-primary">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
          <span>Online subscription payment is being upgraded to a new payment gateway and will return shortly. This tab currently shows subscription status only.</span>
        </div>
      ) : null}

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
                  <SelectItem value="paid">Settled</SelectItem>
                  <SelectItem value="unpaid">Owing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <Table className="min-w-[720px]">
              <TableHeader className="bg-primary">
                <TableRow className="hover:bg-primary">
                  <TableHead className="pl-6 text-xs font-black uppercase tracking-widest text-white">Student</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Matricule</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Class</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Sub-School</TableHead>
                  <TableHead className="pr-6 text-right text-xs font-black uppercase tracking-widest text-white">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary/40" /></TableCell></TableRow>
                ) : pager.pageItems.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">No students match the current filters.</TableCell></TableRow>
                ) : pager.pageItems.map((s: any) => {
                  const paid = Boolean(s.is_license_paid);
                  const owing = subscriptionRequired && studentSubscriptionBlocks(s, platformFeesQuery.data, platformSettings);
                  return (
                    <TableRow key={s.id} className="odd:bg-accent/5">
                      <TableCell className="pl-6"><p className="font-black text-primary">{s.name}</p><p className="text-xs text-muted-foreground">{s.admission_number || ""}</p></TableCell>
                      <TableCell className="font-mono text-xs">{s.matricule || "—"}</TableCell>
                      <TableCell>{classOf(s) || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{subSchoolOf(s)}</TableCell>
                      <TableCell className="pr-6 text-right">
                        {!subscriptionRequired ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Free</span>
                        ) : paid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Settled</span>
                        ) : (
                          <Badge className={cn("border-none font-black uppercase text-[10px]", owing ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>{owing ? "Owing" : "Pending"}</Badge>
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
    </div>
  );
}

export default Subscription;
