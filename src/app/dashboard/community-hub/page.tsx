"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useStudents } from "@/lib/hooks/useStudents";
import { useUsers } from "@/lib/hooks/useUsers";
import { apiClient } from "@/lib/api/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { CalendarDays, Loader2, Search, Users } from "lucide-react";

/**
 * Community tab: a searchable directory of the school — Students, Staff,
 * Parents and Events — rendered as a professional two-per-row card grid.
 * Students filter by class, staff by role, parents by number of children in
 * the school, events by recency. Built entirely on existing endpoints
 * (students, users, platform events).
 */

type Section = "students" | "staff" | "parents" | "events";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "staff", label: "Staff" },
  { id: "parents", label: "Parents" },
  { id: "events", label: "Events" },
];

const STAFF_ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: "Administrator",
  SUB_ADMIN: "Sub-Admin",
  TEACHER: "Teacher",
  BURSAR: "Bursar",
  LIBRARIAN: "Librarian",
};

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

function DirectoryCard({
  avatar,
  name,
  lines,
}: {
  avatar?: string;
  name: string;
  lines: string[];
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-black/[0.03]">
      <Avatar className="h-16 w-16 border-2 border-primary/10">
        <AvatarImage src={avatar || ""} />
        <AvatarFallback className="bg-primary/10 text-lg font-black text-primary">
          {(name || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <p className="w-full truncate text-[13px] font-black leading-tight text-foreground">
        {name}
      </p>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-[11px] font-medium leading-snug text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function SubFilterChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors",
            value === option.value
              ? "border-primary bg-primary text-white"
              : "border-border bg-white text-muted-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function CommunityHubPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("students");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [childrenFilter, setChildrenFilter] = useState("all");
  const [eventOrder, setEventOrder] = useState("recent");

  const studentsQuery = useStudents({ page_size: 500 } as any);
  const staffQuery = useUsers({
    role: "SCHOOL_ADMIN,SUB_ADMIN,TEACHER,BURSAR,LIBRARIAN",
    page_size: 300,
  } as any);
  const parentsQuery = useUsers({ role: "PARENT", page_size: 300 } as any);
  // School events posted by this school's administration (not platform-wide
  // EduIgnite events) — same feed the admin manages in the Events grid.
  const eventsQuery = useQuery({
    queryKey: ["school-events"],
    queryFn: async () =>
      normalizeList((await apiClient.get("/schools/events/", { params: { page_size: 200 } })).data),
  });

  const students = useMemo(() => normalizeList(studentsQuery.data), [studentsQuery.data]);
  const staff = useMemo(() => normalizeList(staffQuery.data), [staffQuery.data]);
  const parents = useMemo(() => normalizeList(parentsQuery.data), [parentsQuery.data]);
  const events = useMemo(() => normalizeList(eventsQuery.data), [eventsQuery.data]);

  // Children per parent, computed from the student registry's parent links.
  const childrenCountByParent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const student of students) {
      for (const link of student.parent_links || []) {
        const id = String(link.parent);
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return counts;
  }, [students]);

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    for (const student of students) {
      const name = student.school_class_name || student.student_class;
      if (name) names.add(String(name));
    }
    return [
      { value: "all", label: "All classes" },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [students]);

  const query = search.trim().toLowerCase();
  const matches = (...fields: (string | undefined | null)[]) =>
    !query || fields.some((f) => (f || "").toLowerCase().includes(query));

  const filteredStudents = useMemo(
    () =>
      students.filter((s: any) => {
        const className = String(s.school_class_name || s.student_class || "");
        if (classFilter !== "all" && className !== classFilter) return false;
        return matches(s.user?.name, s.user?.matricule, s.admission_number, className);
      }),
    [students, classFilter, query]
  );

  const filteredStaff = useMemo(
    () =>
      staff.filter((m: any) => {
        if (staffRoleFilter !== "all" && m.role !== staffRoleFilter) return false;
        return matches(m.name, m.matricule, m.email, STAFF_ROLE_LABELS[m.role] || m.role);
      }),
    [staff, staffRoleFilter, query]
  );

  const filteredParents = useMemo(
    () =>
      parents.filter((p: any) => {
        const count = childrenCountByParent.get(String(p.id)) || 0;
        if (childrenFilter === "1" && count !== 1) return false;
        if (childrenFilter === "2" && count !== 2) return false;
        if (childrenFilter === "3+" && count < 3) return false;
        return matches(p.name, p.matricule, p.email);
      }),
    [parents, childrenFilter, childrenCountByParent, query]
  );

  const filteredEvents = useMemo(() => {
    const list = events.filter((e: any) => matches(e.title, e.description, e.location));
    // The backend returns school events newest-first (ordering -created_at).
    return eventOrder === "recent" ? list : [...list].reverse();
  }, [events, eventOrder, query]);

  const isLoading =
    section === "students"
      ? studentsQuery.isLoading
      : section === "staff"
        ? staffQuery.isLoading
        : section === "parents"
          ? parentsQuery.isLoading
          : eventsQuery.isLoading;

  const totals: Record<Section, { label: string; count: number }> = {
    students: { label: "Total Students", count: filteredStudents.length },
    staff: { label: "Total Staff", count: filteredStaff.length },
    parents: { label: "Total Parents", count: filteredParents.length },
    events: { label: "Total Events", count: filteredEvents.length },
  };

  const sectionTitles: Record<Section, string> = {
    students: "Student Directory",
    staff: "Staff Directory",
    parents: "Parent Directory",
    events: "School Events",
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search community..."
          className="h-11 rounded-2xl border-none bg-white pl-10 shadow-sm ring-1 ring-black/[0.04]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-foreground">Community</h1>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all",
              section === item.id
                ? "bg-primary text-white shadow-md"
                : "bg-white text-muted-foreground ring-1 ring-black/[0.05]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === "students" && (
        <SubFilterChips options={classOptions} value={classFilter} onChange={setClassFilter} />
      )}
      {section === "staff" && (
        <SubFilterChips
          options={[
            { value: "all", label: "All roles" },
            ...Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          value={staffRoleFilter}
          onChange={setStaffRoleFilter}
        />
      )}
      {section === "parents" && (
        <SubFilterChips
          options={[
            { value: "all", label: "All parents" },
            { value: "1", label: "1 child" },
            { value: "2", label: "2 children" },
            { value: "3+", label: "3+ children" },
          ]}
          value={childrenFilter}
          onChange={setChildrenFilter}
        />
      )}
      {section === "events" && (
        <SubFilterChips
          options={[
            { value: "recent", label: "Most recent" },
            { value: "oldest", label: "Oldest first" },
          ]}
          value={eventOrder}
          onChange={setEventOrder}
        />
      )}

      <div className="rounded-2xl bg-accent/40 px-4 py-2.5 text-center">
        <p className="text-[13px] font-black text-foreground">
          {totals[section].label}: {isLoading ? "…" : totals[section].count.toLocaleString()}
        </p>
      </div>

      <h2 className="text-lg font-black tracking-tight text-foreground">
        {sectionTitles[section]}
      </h2>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary/30" />
        </div>
      ) : section === "students" ? (
        filteredStudents.length === 0 ? (
          <EmptyState label="No students found" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredStudents.map((s: any) => (
              <DirectoryCard
                key={s.id}
                avatar={resolveMediaUrl(s.user?.avatar)}
                name={s.user?.name || "Student"}
                lines={[
                  `Matricule: ${s.user?.matricule || s.admission_number || "—"}`,
                  "Student",
                  `Class: ${s.school_class_name || s.student_class || "—"}`,
                ]}
              />
            ))}
          </div>
        )
      ) : section === "staff" ? (
        filteredStaff.length === 0 ? (
          <EmptyState label="No staff found" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredStaff.map((m: any) => (
              <DirectoryCard
                key={m.id}
                avatar={resolveMediaUrl(m.avatar)}
                name={m.name || "Staff"}
                lines={[
                  `Matricule: ${m.matricule || "—"}`,
                  STAFF_ROLE_LABELS[m.role] || m.role || "Staff",
                ]}
              />
            ))}
          </div>
        )
      ) : section === "parents" ? (
        filteredParents.length === 0 ? (
          <EmptyState label="No parents found" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredParents.map((p: any) => {
              const count = childrenCountByParent.get(String(p.id)) || 0;
              return (
                <DirectoryCard
                  key={p.id}
                  avatar={resolveMediaUrl(p.avatar)}
                  name={p.name || "Parent"}
                  lines={[
                    `Matricule: ${p.matricule || "—"}`,
                    "Parent",
                    `Children: ${count || "—"}`,
                  ]}
                />
              );
            })}
          </div>
        )
      ) : filteredEvents.length === 0 ? (
        <EmptyState label="No school events yet" />
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event: any) => (
            <div
              key={event.id}
              className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.03]"
            >
              {event.image ? (
                <img src={event.image} alt={event.title} className="h-40 w-full object-cover" />
              ) : null}
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black leading-snug text-foreground">
                    {event.title}
                  </p>
                  {event.description ? (
                    <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {event.description}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {event.event_date ? (
                      <span className="text-[11px] font-bold text-primary">
                        {new Date(event.event_date).toLocaleDateString([], {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    ) : null}
                    {event.location ? (
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        📍 {event.location}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed bg-white py-14 text-center">
      <Users className="h-9 w-9 text-primary/20" />
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
