import { resolveMediaUrl } from "@/lib/media";

type ReportCardBuildOptions = {
  title?: string;
  school?: Record<string, any> | null;
  student?: Record<string, any> | null;
  attendance?: Record<string, any> | null;
  includeDocument?: boolean;
};

function escapeHtml(value: unknown) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value: unknown, fallback = "") {
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

function getNested(record: Record<string, any>, paths: string[], fallback = "") {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((current, key) => current?.[key], record);
    if (value !== undefined && value !== null && `${value}`.trim() !== "") return value;
  }
  return fallback;
}

function termLabel(term?: number | string | null) {
  const value = Number(term);
  if (value === 1) return "First Term";
  if (value === 2) return "Second Term";
  if (value === 3) return "Third Term";
  return term ? `Term ${term}` : "";
}

function sexLabel(value: unknown) {
  const text = `${value ?? ""}`.trim().toLowerCase();
  if (["male", "m", "masculin"].includes(text)) return "M";
  if (["female", "f", "feminin", "fÃ©minin", "féminin"].includes(text)) return "F";
  return clean(value);
}

function getSubjectRows(report: any) {
  const rows = Array.isArray(report?.subjects)
    ? report.subjects
    : Array.isArray(report?.grades)
      ? report.grades
      : Array.isArray(report?.student?.grades)
        ? report.student.grades
        : [];
  return rows.map((row: any, index: number) => {
    const subjectName = clean(row.name || row.subject || row.subject_name || row.subject?.name, "Subject");
    const score = asNumber(row.mark ?? row.score ?? row.average);
    const coefficient = asNumber(row.coefficient ?? row.coef ?? row.subject?.coefficient, 1);
    const sequenceScores = Array.isArray(row.sequence_scores) ? row.sequence_scores : [];
    let seq1: number | null = row.seq1 !== undefined ? asNumber(row.seq1) : null;
    let seq2: number | null = row.seq2 !== undefined ? asNumber(row.seq2) : null;

    sequenceScores.forEach((item: any, itemIndex: number) => {
      const name = `${item.sequence_name || item.name || ""}`.toLowerCase();
      const itemScore = asNumber(item.score);
      if (name.includes("1") || itemIndex === 0) seq1 = itemScore;
      if (name.includes("2") || itemIndex === 1) seq2 = itemScore;
    });

    if (seq1 === null && seq2 === null) {
      const name = `${report?.sequence?.name || ""}`.toLowerCase();
      if (name.includes("2")) seq2 = score;
      else seq1 = score;
    }

    return {
      key: row.id || row.subject_id || `${subjectName}-${index}`,
      subjectName,
      teacherName: clean(row.teacherName || row.teacher_name || row.teacher?.name || row.teacher?.full_name || row.teacher),
      coefficient,
      seq1,
      seq2,
      termAverage: score,
      signature: clean(row.signature),
      total: asNumber(row.total, score * coefficient),
    };
  });
}

function normalizeReport(report: any, options: ReportCardBuildOptions) {
  const reportStudent = report?.student || {};
  const student = { ...reportStudent, ...(options.student || {}) };
  const school = {
    ...(student.school || {}),
    ...(report?.school || {}),
    ...(options.school || {}),
  };
  const sequence = report?.sequence || {};
  const rows = getSubjectRows({ ...report, student });
  const totalCoefficient = rows.reduce((sum, row) => sum + row.coefficient, 0);
  const totalWeighted = rows.reduce((sum, row) => sum + row.total, 0);
  const average = asNumber(report?.averageMark ?? report?.average ?? student.annualAvg, totalCoefficient ? totalWeighted / totalCoefficient : 0);
  const photo = resolveMediaUrl(clean(
    getNested(student, ["avatar", "photo", "passport_photo", "user.avatar"])
  ));
  const logo = resolveMediaUrl(clean(
    getNested(school, ["logo", "logo_url", "favicon", "emblem"])
  ));
  const schoolName = clean(school.name || school.school_name, "");
  const academicYear = clean(sequence.academic_year || report?.academic_year || school.academic_year, "");
  const term = sequence.term || report?.term || "";
  const termSequence = clean(
    sequence.type === "TERM" || report?.period_type === "term"
      ? `${termLabel(term)}${sequence.name ? ` / ${sequence.name}` : ""}`
      : sequence.name || report?.period_label,
    ""
  );

  return {
    title: options.title || "Report Card",
    school,
    schoolName,
    schoolLogo: logo,
    student,
    studentName: clean(student.name || student.full_name || student.user?.name, ""),
    className: clean(student.class || student.student_class || student.class_name || student.school_class?.name, ""),
    rollNumber: clean(student.admission_number || student.roll_no || student.registration_number, ""),
    matricule: clean(student.matricule || student.user?.matricule, ""),
    sex: sexLabel(student.gender || student.sex),
    photo,
    academicYear,
    termSequence,
    rows,
    totalCoefficient,
    average,
    rank: clean(report?.rank, ""),
    totalStudents: clean(report?.total_students, ""),
    classAverage: clean(report?.class_average, ""),
    minAverage: clean(report?.min_average, ""),
    maxAverage: clean(report?.max_average, ""),
    successRate: clean(report?.success_rate, ""),
    attendance: options.attendance || report?.attendance || student.attendanceSummary || {},
  };
}

export function buildCameroonReportCardHtml(report: any, options: ReportCardBuildOptions = {}) {
  const data = normalizeReport(report, options);
  const rows = data.rows.length
    ? data.rows.map((row) => `
      <tr>
        <td class="subject-cell"><span class="subject-icon">${escapeHtml(row.subjectName.slice(0, 1).toUpperCase())}</span>${escapeHtml(row.subjectName)}</td>
        <td>${escapeHtml(row.teacherName)}</td>
        <td class="center">${escapeHtml(row.coefficient)}</td>
        <td class="center">${row.seq1 === null ? "" : escapeHtml(row.seq1.toFixed(2))}</td>
        <td class="center">${row.seq2 === null ? "" : escapeHtml(row.seq2.toFixed(2))}</td>
        <td class="center">${escapeHtml(row.termAverage.toFixed(2))}</td>
        <td class="center">${escapeHtml(row.signature)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty-row">No marks have been published for this report-card period.</td></tr>`;

  const totalSeq1 = data.rows.reduce((sum, row) => sum + (row.seq1 ?? 0), 0);
  const totalSeq2 = data.rows.reduce((sum, row) => sum + (row.seq2 ?? 0), 0);
  const totalAvg = data.rows.reduce((sum, row) => sum + row.termAverage, 0);
  const unjustified = clean(data.attendance.unjustified_absences ?? data.attendance.absent ?? data.attendance.absent_days, "");
  const justified = clean(data.attendance.justified_absences ?? data.attendance.excused ?? data.attendance.excused_days, "");
  const warning = clean(data.attendance.warning, "");
  const reprimand = clean(data.attendance.reprimand, "");
  const suspension = clean(data.attendance.suspension_days, "");
  const conduct = clean(data.attendance.conduct_remark ?? data.attendance.conduct, "");

  return `
    <style>
      @page{size:A4 portrait;margin:6mm}
      .ei-report-card-wrap{width:100%;overflow-x:auto;padding:8px;background:#f8fafc}
      .ei-report-card{box-sizing:border-box;width:794px;min-height:1123px;margin:0 auto;background:#fff;color:#111827;border:3px solid #0b3a73;border-radius:10px;padding:16px 18px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.25}
      .ei-report-card *{box-sizing:border-box}
      .ei-header{display:grid;grid-template-columns:1fr 150px 1fr;gap:16px;align-items:stretch;border-bottom:3px solid #d8a21b;padding:0 8px 12px;margin-bottom:14px}
      .ei-header-side{font-weight:800;text-transform:uppercase;color:#111827;font-size:12px;line-height:1.55}
      .ei-header-side.right{text-align:right}
      .ei-header-side .blue{color:#0b3a73}
      .ei-logo-box{border-left:1px solid #9ca3af;border-right:1px solid #9ca3af;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:150px;padding:8px}
      .ei-logo{width:76px;height:76px;object-fit:contain;margin-bottom:10px}
      .ei-logo-caption{font-size:11px;color:#0b3a73;font-weight:800;line-height:1.25}
      .ei-section{border:1.8px solid #78a5cc;border-radius:7px;margin-bottom:14px;overflow:hidden;background:#f8fbff}
      .ei-section-title{display:inline-block;margin:0 0 0 -1px;padding:5px 16px 5px 14px;border-radius:0 5px 5px 0;background:#083a78;color:#fff;text-transform:uppercase;font-weight:900;font-size:15px;letter-spacing:.2px}
      .ei-profile-body{display:grid;grid-template-columns:1fr 140px;gap:18px;padding:10px 12px 8px}
      .ei-profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}
      .ei-field{display:grid;grid-template-columns:92px 1fr;align-items:end;gap:8px;font-weight:800}
      .ei-field.wide{grid-column:1 / -1}
      .ei-line{min-height:18px;border-bottom:1px dotted #9ca3af;color:#0b3a73;font-weight:800;padding-left:4px}
      .ei-photo{border:1.8px solid #7d9cbd;border-radius:6px;height:146px;background:#eaf3fb;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;color:#475569;font-size:11px;font-weight:700}
      .ei-photo img{width:100%;height:100%;object-fit:cover}
      .ei-table-section{border:1.8px solid #78a5cc;border-radius:7px;margin-bottom:14px;overflow:hidden}
      .ei-table-title{display:inline-block;padding:5px 16px 5px 14px;background:#083a78;color:#fff;text-transform:uppercase;font-weight:900;font-size:15px;border-radius:0 0 5px 0}
      .ei-table{width:100%;border-collapse:collapse;font-size:12px}
      .ei-table th{background:#083a78;color:#fff;border:1px solid #97b9d8;padding:7px 6px;text-align:center;font-weight:900}
      .ei-table td{border:1px solid #c5d8e8;padding:5px 6px;background:#f4f9fd;height:25px}
      .ei-table tr:nth-child(even) td{background:#eaf3f9}
      .subject-cell{font-weight:700;color:#111827}
      .subject-icon{display:inline-flex;width:17px;height:17px;border-radius:50%;background:#0b3a73;color:#fff;align-items:center;justify-content:center;font-size:9px;margin-right:7px;font-weight:900}
      .center{text-align:center}
      .empty-row{text-align:center;color:#64748b;font-weight:700;padding:18px!important}
      .totals td{font-weight:900;background:#e2edf7!important}
      .ei-summary{border-color:#2f7d33;background:#fbfffb}
      .ei-summary .ei-section-title{background:#157018}
      .ei-summary-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:12px 16px}
      .ei-summary-grid .ei-field{grid-template-columns:105px 1fr}
      .ei-conduct{border-color:#7a3d95;background:#fffaff}
      .ei-conduct .ei-section-title{background:#64238a}
      .ei-conduct-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:12px 16px}
      .ei-conduct-grid .ei-field{grid-template-columns:135px 1fr}
      .ei-signatures{border-color:#d39a14;background:#fffdf7}
      .ei-signatures .ei-section-title{background:#c78605}
      .ei-signature-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:42px;padding:30px 36px 16px;text-align:center;color:#8a5d08;font-weight:800}
      .ei-sign-line{height:34px;border-bottom:1.8px solid #8a5d08;margin-bottom:8px;position:relative}
      .ei-sign-line:after{content:"\\270E";position:absolute;top:3px;left:50%;transform:translateX(-50%);font-size:20px;color:#8a5d08}
      @media print{html,body{width:210mm;min-height:297mm;background:#fff!important}.ei-report-card-wrap{padding:0;background:#fff;overflow:visible}.ei-report-card{width:196mm;min-height:283mm;margin:0 auto;border-radius:10px;box-shadow:none;page-break-after:always}}
    </style>
    <div class="ei-report-card-wrap">
      <section class="ei-report-card">
        <header class="ei-header">
          <div class="ei-header-side">
            <div class="blue">Republic of Cameroon</div>
            <div>Peace - Work - Fatherland</div>
            <br />
            <div>Ministry of Sec. Education</div>
            <div>Regional Delegation: <span class="blue">${escapeHtml(clean(data.school.region, ""))}</span></div>
            <div>Divisional Delegation: <span class="blue">${escapeHtml(clean(data.school.division || data.school.department, ""))}</span></div>
            <div>School: <span class="blue">${escapeHtml(data.schoolName)}</span></div>
          </div>
          <div class="ei-logo-box">
            ${data.schoolLogo ? `<img class="ei-logo" src="${escapeHtml(data.schoolLogo)}" alt="${escapeHtml(data.schoolName)} logo" />` : ""}
            <div class="ei-logo-caption">Place Stamp/Logo<br />Here Only</div>
          </div>
          <div class="ei-header-side right">
            <div class="blue">Republique du Cameroun</div>
            <div>Paix - Travail - Patrie</div>
            <br />
            <div>Ministere des Enseignements Sec.</div>
            <div>Delegation Regionale: <span class="blue">${escapeHtml(clean(data.school.region, ""))}</span></div>
            <div>Delegation Departement: <span class="blue">${escapeHtml(clean(data.school.division || data.school.department, ""))}</span></div>
            <div>Lycee / College: <span class="blue">${escapeHtml(data.schoolName)}</span></div>
          </div>
        </header>

        <section class="ei-section">
          <h2 class="ei-section-title">Student Profile &amp; Class Profile</h2>
          <div class="ei-profile-body">
            <div class="ei-profile-grid">
              <div class="ei-field wide"><span>Name:</span><span class="ei-line">${escapeHtml(data.studentName)}</span></div>
              <div class="ei-field wide"><span>Class:</span><span class="ei-line">${escapeHtml(data.className)}</span></div>
              <div class="ei-field"><span>Roll No:</span><span class="ei-line">${escapeHtml(data.rollNumber || data.matricule)}</span></div>
              <div class="ei-field"><span>Sex:</span><span class="ei-line">${escapeHtml(data.sex)}</span></div>
              <div class="ei-field wide"><span>Academic Year:</span><span class="ei-line">${escapeHtml(data.academicYear)}</span></div>
              <div class="ei-field wide"><span>Term/Sequence:</span><span class="ei-line">${escapeHtml(data.termSequence)}</span></div>
            </div>
            <div class="ei-photo">
              ${data.photo ? `<img src="${escapeHtml(data.photo)}" alt="${escapeHtml(data.studentName)} passport photo" />` : `Place Passport Photo<br />Here`}
            </div>
          </div>
        </section>

        <section class="ei-table-section">
          <h2 class="ei-table-title">Academic Performance Sheet</h2>
          <table class="ei-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher's Name</th>
                <th>Coef</th>
                <th>Seq 1<br />(/20)</th>
                <th>Seq 2<br />(/20)</th>
                <th>Term<br />Avg</th>
                <th>Sig</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="totals">
                <td class="center">TOTALS</td>
                <td></td>
                <td class="center">${escapeHtml(data.totalCoefficient)}</td>
                <td class="center">${data.rows.length ? escapeHtml(totalSeq1.toFixed(2)) : ""}</td>
                <td class="center">${data.rows.length ? escapeHtml(totalSeq2.toFixed(2)) : ""}</td>
                <td class="center">${data.rows.length ? escapeHtml(totalAvg.toFixed(2)) : ""}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="ei-section ei-summary">
          <h2 class="ei-section-title">Term Summary &amp; Class Profile</h2>
          <div class="ei-summary-grid">
            <div class="ei-field"><span>Student Average:</span><span class="ei-line">${data.rows.length ? `${escapeHtml(data.average.toFixed(2))} / 20` : ""}</span></div>
            <div class="ei-field"><span>Class Rank:</span><span class="ei-line">${escapeHtml(data.rank)}${data.totalStudents ? ` / ${escapeHtml(data.totalStudents)}` : ""}</span></div>
            <div class="ei-field"><span>Class Average:</span><span class="ei-line">${escapeHtml(data.classAverage)}</span></div>
            <div class="ei-field"><span>Min Average:</span><span class="ei-line">${escapeHtml(data.minAverage)}</span></div>
            <div class="ei-field"><span>Max Average:</span><span class="ei-line">${escapeHtml(data.maxAverage)}</span></div>
            <div class="ei-field"><span>Success Rate:</span><span class="ei-line">${escapeHtml(data.successRate)}${data.successRate ? " %" : ""}</span></div>
          </div>
        </section>

        <section class="ei-section ei-conduct">
          <h2 class="ei-section-title">Discipline &amp; Conduct Report</h2>
          <div class="ei-conduct-grid">
            <div class="ei-field"><span>Unjustified Absences (hrs):</span><span class="ei-line">${escapeHtml(unjustified)}</span></div>
            <div class="ei-field"><span>Warning:</span><span class="ei-line">${escapeHtml(warning)}</span></div>
            <div class="ei-field"><span>Suspension (days):</span><span class="ei-line">${escapeHtml(suspension)}</span></div>
            <div class="ei-field"><span>Justified Absences (hrs):</span><span class="ei-line">${escapeHtml(justified)}</span></div>
            <div class="ei-field"><span>Reprimand:</span><span class="ei-line">${escapeHtml(reprimand)}</span></div>
            <div class="ei-field"><span>Conduct Remark:</span><span class="ei-line">${escapeHtml(conduct)}</span></div>
          </div>
        </section>

        <section class="ei-section ei-signatures">
          <h2 class="ei-section-title">Signatures &amp; Stamps</h2>
          <div class="ei-signature-grid">
            <div><div class="ei-sign-line"></div><div>Class Master</div></div>
            <div><div class="ei-sign-line"></div><div>Parent/Guardian</div></div>
            <div><div class="ei-sign-line"></div><div>Principal</div></div>
          </div>
        </section>
      </section>
    </div>
  `;
}

export function buildCameroonReportCardDocument(report: any, options: ReportCardBuildOptions = {}) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(options.title || "Report Card")}</title>
      </head>
      <body style="margin:0;background:#f8fafc;">
        ${buildCameroonReportCardHtml(report, options)}
      </body>
    </html>`;
}
