"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CheckCircle2, Filter, Loader2, RefreshCw, Search, Send, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { academicsService } from "@/lib/api/services/academics.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type PromotionStatus = "ALL" | "PROMOTED" | "REPEATED" | "PENDING" | "GRADUATED";

type PromotionRecord = {
  id: string;
  student: string;
  student_name: string;
  student_matricule: string;
  admission_number: string;
  academic_year: string;
  current_class: string | null;
  current_class_name: string;
  sub_school_name?: string;
  promoted_to_class: string | null;
  promoted_to_class_name: string;
  average_score: string | number | null;
  promotion_average: string | number;
  status: Exclude<PromotionStatus, "ALL">;
  decision_reason: string;
};

function defaultAcademicYear() {
  const today = new Date();
  const startYear = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

function statusClass(status: PromotionRecord["status"]) {
  if (status === "PROMOTED") return "bg-green-100 text-green-700";
  if (status === "REPEATED") return "bg-amber-100 text-amber-700";
  if (status === "GRADUATED") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function errorMessage(error: unknown) {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  const first = data ? Object.values(data).flat().find(Boolean) : null;
  return typeof first === "string" ? first : error instanceof Error ? error.message : "The action could not be completed.";
}

export default function PromotionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const schoolId = user?.school?.id || user?.school_id || user?.schoolId || "";
  const isSchoolAdmin = user?.role && ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user.role);

  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [status, setStatus] = useState<PromotionStatus>("ALL");
  const [classId, setClassId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedClassAverage, setSelectedClassAverage] = useState("10");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const settingsQuery = useQuery({
    queryKey: ["school-settings", schoolId],
    queryFn: () => schoolsService.getSchoolSettings(schoolId),
    enabled: Boolean(schoolId),
  });

  const classesQuery = useQuery({
    queryKey: ["school-classes", schoolId],
    queryFn: () => schoolsService.getSchoolClasses(schoolId),
    enabled: Boolean(schoolId),
  });

  React.useEffect(() => {
    if (settingsQuery.data?.academic_year) {
      setAcademicYear(settingsQuery.data.academic_year);
    }
  }, [settingsQuery.data?.academic_year]);

  const promotionsQuery = useQuery({
    queryKey: ["student-promotions", academicYear, status, classId, search],
    queryFn: () => academicsService.listStudentPromotions({
      academic_year: academicYear,
      status: status === "ALL" ? undefined : status,
      class_id: classId === "ALL" ? undefined : classId,
      search: search.trim() || undefined,
    }),
    enabled: Boolean(isSchoolAdmin && academicYear),
  });

  const records = (promotionsQuery.data?.results || []) as PromotionRecord[];
  const summary = promotionsQuery.data?.summary || {};
  const promotionAverage = Number(summary.promotion_average ?? settingsQuery.data?.promotion_average ?? 10);
  const activePromotionAverage = Number(summary.class_promotion_average ?? promotionAverage);

  React.useEffect(() => {
    setSelectedClassAverage(Number.isFinite(activePromotionAverage) ? activePromotionAverage.toFixed(2) : "10.00");
  }, [activePromotionAverage, classId, academicYear]);

  const repeatedRecords = useMemo(() => records.filter((record) => record.status === "REPEATED"), [records]);
  const selectedRepeatedCount = records.filter((record) => selectedIds.includes(record.id) && record.status === "REPEATED").length;

  const recalculateMutation = useMutation({
    mutationFn: () => academicsService.recalculateStudentPromotions({
      academic_year: academicYear,
      promotion_average: classId === "ALL" ? promotionAverage : Number(selectedClassAverage),
      class_id: classId === "ALL" ? undefined : classId,
    }),
    onSuccess: async () => {
      toast({ title: "Promotion records updated", description: "The registry was recalculated from the latest annual averages." });
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["student-promotions"] });
    },
    onError: (error) => toast({ variant: "destructive", title: "Could not recalculate promotions", description: errorMessage(error) }),
  });

  const bulkPromoteMutation = useMutation({
    mutationFn: () => academicsService.bulkPromoteStudents({
      academic_year: academicYear,
      promotion_ids: selectedIds,
    }),
    onSuccess: async (data) => {
      toast({
        title: "Selected students promoted",
        description: data?.detail || `${data?.promoted_count || 0} learner(s) moved to the next class. Matricules were preserved.`,
      });
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["student-promotions"] });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (error) => toast({ variant: "destructive", title: "Promotion failed", description: errorMessage(error) }),
  });

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id));
  };

  const selectAllRepeated = () => {
    setSelectedIds(repeatedRecords.map((record) => record.id));
  };

  if (!isSchoolAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-20">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-sm font-semibold text-destructive">Only school administrators can manage annual promotion decisions.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <span className="rounded-xl bg-primary p-2 shadow-lg"><Award className="h-6 w-6 text-secondary" /></span>
            Student Promotions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promote learners according to the Cameroon secondary school annual average policy. Matricules remain unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={selectAllRepeated} disabled={!repeatedRecords.length}>
            <Users className="h-4 w-4" />
            Select Repeated
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => recalculateMutation.mutate()} disabled={recalculateMutation.isPending}>
            {recalculateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalculate
          </Button>
          <Button className="gap-2" onClick={() => bulkPromoteMutation.mutate()} disabled={!selectedIds.length || bulkPromoteMutation.isPending}>
            {bulkPromoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Promote Selected
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          ["Promotion Average", `${promotionAverage.toFixed(2)} / 20`],
          ["Selected Class Avg.", `${activePromotionAverage.toFixed(2)} / 20`],
          ["Promoted", summary.promoted || 0],
          ["Repeated", summary.repeated || 0],
          ["Pending", summary.pending || 0],
        ].map(([label, value]) => (
          <Card key={label} className="border-none shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-black text-primary">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5 text-primary" /> Promotion Filters</CardTitle>
          <CardDescription>Filter by decision status, class, and learner identity before bulk actions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Academic Year</Label>
            <Input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value: PromotionStatus) => setStatus(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All decisions</SelectItem>
                <SelectItem value="PROMOTED">Promoted</SelectItem>
                <SelectItem value="REPEATED">Repeated</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="GRADUATED">Graduated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {(classesQuery.data || []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{classId === "ALL" ? "School Default Avg." : "This Class Avg."}</Label>
            <Input
              type="number"
              min="0"
              max="20"
              step="0.25"
              value={classId === "ALL" ? promotionAverage.toFixed(2) : selectedClassAverage}
              disabled={classId === "ALL"}
              onChange={(event) => setSelectedClassAverage(event.target.value)}
            />
            <p className="text-[10px] font-semibold text-muted-foreground">
              {classId === "ALL" ? "Change the default in Years & Terms." : "Saved when you recalculate this class."}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, matricule, admission no." />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-none bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Promotion Registry</CardTitle>
          <CardDescription>
            {selectedIds.length} selected. {selectedRepeatedCount} selected learner(s) are currently marked repeated.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>Student</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Admission No.</TableHead>
                  <TableHead>Current Class</TableHead>
                  <TableHead>Average</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Next Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotionsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading promotions...</TableCell></TableRow>
                ) : records.length ? records.map((record) => (
                  <TableRow key={record.id} className="hover:bg-primary/5">
                    <TableCell>
                      <Checkbox checked={selectedIds.includes(record.id)} onCheckedChange={(checked) => toggleSelection(record.id, Boolean(checked))} />
                    </TableCell>
                    <TableCell>
                      <p className="font-bold text-primary">{record.student_name}</p>
                      <p className="text-xs text-muted-foreground">{record.sub_school_name || "Main school"}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{record.student_matricule}</TableCell>
                    <TableCell className="font-mono text-xs">{record.admission_number}</TableCell>
                    <TableCell>{record.current_class_name || "-"}</TableCell>
                    <TableCell>{record.average_score ?? "Pending"}</TableCell>
                    <TableCell>
                      <Badge className={cn("border-none text-[10px] font-black", statusClass(record.status))}>
                        {record.status === "REPEATED" ? "Repeated" : record.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {record.status === "PROMOTED" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        <span>{record.promoted_to_class_name || (record.status === "GRADUATED" ? "Graduated" : "-")}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                      No promotion records yet. Click Recalculate to generate decisions from annual averages.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
