
"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useStudents } from "@/lib/hooks/useStudents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  CreditCard, 
  Search, 
  Printer, 
  Download, 
  Building2, 
  User, 
  MapPin, 
  QrCode, 
  Layers, 
  GraduationCap, 
  ShieldCheck,
  CheckCircle2,
  X,
  Eye,
  FileCheck,
  ChevronRight,
  Plus,
  Info,
  Phone,
  Signature,
  Network,
  Filter
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { pdfGenerationService } from "@/lib/pdf-generation-service";

const CLASSES = ["6ème / Form 1", "5ème / Form 2", "4ème / Form 3", "3ème / Form 4", "2nde / Form 5", "1ère / Lower Sixth", "Terminale / Upper Sixth"];
const SECTIONS = ["Anglophone Section", "Francophone Section", "Technical Section"];

export default function IdCardsPage() {
  const { user, platformSettings } = useAuth();
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const { t, language } = useI18n();
  const { toast } = useToast();
  const schoolInfo = user?.school as (typeof user.school & { settings?: { academic_year?: string }; matricule?: string }) | undefined;
  const isStudent = user?.role === "STUDENT";

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Fetch real student data from API
  const { data: studentsApiData } = useStudents({ search: searchTerm || undefined, include_qr: true });

  // Build student list from real API data
  const studentList = useMemo(() => {
    return (studentsApiData?.results || []).map((s: any) => ({
      id: s.admission_number || s.user?.matricule || s.id,
      name: s.user?.name || 'Unknown',
      class: s.student_class || 'Unknown',
      section: s.section || 'Unknown',
      avatar: resolveMediaUrl(s.user?.avatar) || '',
      dob: s.date_of_birth || '',
      gender: s.gender || '',
      admissionDate: s.admission_date || '',
      admissionYear: s.admission_date ? String(new Date(s.admission_date).getFullYear()) : '',
      qrCode: s.qr_code || '',
      guardian: s.guardian_name || '',
      guardianPhone: s.guardian_phone || '',
      address: s.address || '',
    }));
  }, [studentsApiData]);

  const availableClasses = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.class).filter(Boolean))).sort(),
    [studentList]
  );

  const availableSections = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.section).filter(Boolean))).sort(),
    [studentList]
  );

  const filtered = studentList.filter((s: any) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = classFilter === "all" || s.class === classFilter;
    const matchesSection = sectionFilter === "all" || s.section === sectionFilter;
    return matchesSearch && matchesClass && matchesSection;
  });

  useEffect(() => {
    if (isStudent && studentList[0] && selectedStudents.length === 0) {
      setSelectedStudents([studentList[0].id]);
    }
  }, [isStudent, selectedStudents.length, studentList]);

  const toggleSelectAll = () => {
    if (selectedStudents.length === filtered.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filtered.map(s => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleGenerate = () => {
    if (selectedStudents.length === 0) {
      toast({ variant: "destructive", title: "No Students Selected", description: "Please select at least one student to generate IDs." });
      return;
    }
    setIsPreviewing(true);
  };

  const downloadGeneratedFile = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownloadPdf = async () => {
    if (selectedStudents.length === 0) {
      toast({ variant: "destructive", title: "No Students Selected", description: "Please select at least one student to generate IDs." });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const selectedStudentData = studentList.filter((student: any) => selectedStudents.includes(student.id));
      const result = await pdfGenerationService.generateBatchPDF({
        type: "id-cards",
        items: selectedStudentData.map((student: any) => ({
          studentId: student.id,
          studentData: {
            name: student.name,
            matricule: student.id,
            class_level: student.class,
            section: student.section,
            avatar: student.avatar,
            date_of_birth: student.dob,
            gender: student.gender,
            admission_number: student.id,
            admission_date: student.admissionDate,
            guardian_name: student.guardian,
            guardian_phone: student.guardianPhone,
            address: student.address,
            qr_code: student.qrCode,
            admission_year: student.admissionYear || "Admission year pending",
            academic_year: student.admissionYear || "Admission year pending",
          },
          schoolData: {
            name: user?.school?.name || "School Name",
            logo: user?.school?.logo,
            motto: user?.school?.motto,
            principal: user?.school?.principal,
            address: schoolInfo?.address || schoolInfo?.location,
            phone: schoolInfo?.phone,
            matricule: schoolInfo?.matricule,
          },
          templateId: "standard-cameroon-secondary",
        })),
        options: {
          watermark: { text: "MINESEC - OFFICIAL ID", opacity: 0.1 },
          quality: "high",
          compression: true,
        },
      });

      if (!result.success || !result.downloadUrl) {
        throw new Error(result.error || "The PDF could not be generated.");
      }
      downloadGeneratedFile(result.downloadUrl, result.fileName);
      toast({ title: "ID Cards Downloaded", description: `${selectedStudents.length} official ID card(s) were generated as a PDF.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "PDF generation failed",
        description: error instanceof Error ? error.message : "The ID-card PDF could not be generated.",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
    toast({ title: "Print Command Sent", description: "Sending batch to your institutional printer." });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <CreditCard className="w-6 h-6 text-secondary" />
            </div>
            {language === 'en' ? 'Institutional ID Cards' : 'Cartes d\'Identité'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isStudent
              ? "View, print, and download your official Cameroonian secondary school ID card when published by your school."
              : "Generate and manage official dual-sided ID cards for the student body."}
          </p>
        </div>
        
        <Button 
          className="gap-2 shadow-lg h-12 px-6 rounded-2xl" 
          onClick={handleGenerate}
          disabled={selectedStudents.length === 0}
        >
          <Plus className="w-5 h-5" /> {language === 'en' ? 'Generate Selected' : 'Générer la Sélection'} ({selectedStudents.length})
        </Button>
      </div>

      <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
        <CardHeader className="bg-white border-b p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative col-span-1 md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Find student by name or ID..." 
                className="pl-10 h-11 bg-accent/20 border-none rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 col-span-1 md:col-span-2">
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="flex-1 h-11 bg-accent/20 border-none rounded-xl">
                  <div className="flex items-center gap-2">
                    <Network className="w-3.5 h-3.5 text-primary/40" />
                    <SelectValue placeholder="All Sections" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Entire Node</SelectItem>
                  {availableSections.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="flex-1 h-11 bg-accent/20 border-none rounded-xl">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-primary/40" />
                    <SelectValue placeholder="All Classes" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {availableClasses.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-accent/10 border-b border-accent/20">
                <TableHead className="w-[50px] pl-8">
                  {isStudent ? null : (
                    <Checkbox
                      checked={selectedStudents.length === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  )}
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest py-4">Matricule</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Student Profile</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Academic Level</TableHead>
                <TableHead className="text-center font-black uppercase text-[10px] tracking-widest">Card Status</TableHead>
                <TableHead className="pr-8 text-right font-black uppercase text-[10px] tracking-widest">Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className={cn("group hover:bg-accent/5 border-b border-accent/10", selectedStudents.includes(s.id) && "bg-primary/5")}>
                  <TableCell className="pl-8">
                    {isStudent ? null : (
                      <Checkbox
                        checked={selectedStudents.includes(s.id)}
                        onCheckedChange={() => toggleSelect(s.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-bold text-primary">{s.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-accent">
                        <AvatarImage src={s.avatar} />
                        <AvatarFallback className="bg-primary/5 text-primary text-xs">{s.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-primary">{s.name}</span>
                        <span className="text-[8px] font-black uppercase opacity-40">{s.section}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] border-primary/20 text-primary font-bold">{s.class}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-green-100 text-green-700 border-none text-[9px] font-black">VALIDATED</Badge>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedStudents([s.id]); setIsPreviewing(true); }} className="rounded-full hover:bg-accent">
                      <Eye className="w-4 h-4 text-primary" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ID CARD PREVIEW & PRINT DIALOG */}
      <Dialog open={isPreviewing} onOpenChange={setIsPreviewing}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] overflow-y-auto p-0 border-none shadow-2xl rounded-3xl">
          <DialogHeader className="bg-primary p-8 text-white no-print">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl">
                  <CreditCard className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black">Professional ID Card Suite</DialogTitle>
                  <DialogDescription className="text-white/60">Dual-sided Cameroonian standard cards for {selectedStudents.length} students.</DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsPreviewing(false)} className="text-white">
                <X className="w-6 h-6" />
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-muted p-8 print:p-0 print:bg-white min-h-[60vh]">
            <div className="flex flex-col gap-12 items-center print:gap-8">
              {selectedStudents.map(id => {
                const s = studentList.find((item: any) => item.id === id);
                if (!s) return null;
                return (
                  <div key={s.id} className="flex flex-col lg:flex-row gap-8 items-center print:flex-row print:gap-4 print:page-break-after-always">
                    
                    {/* FRONT SIDE */}
                    <div className="relative group card-container">
                      <Card className="w-[450px] h-[280px] border shadow-xl bg-white overflow-hidden relative border-primary/20 flex flex-col">
                        {/* Cameroon National Header */}
                        <div className="bg-primary p-2 flex items-center justify-between text-white text-[7px] font-black uppercase tracking-tighter shrink-0 border-b border-white/10">
                          <div className="text-left leading-none space-y-0.5">
                            <p>Republic of Cameroon</p>
                            <p>Peace - Work - Fatherland</p>
                          </div>
                          <div className="flex gap-1 h-3">
                            <div className="w-2 h-full bg-[#007a5e]" />
                            <div className="w-2 h-full bg-[#ce1126] flex items-center justify-center"><div className="w-0.5 h-0.5 bg-yellow-400 rounded-full" /></div>
                            <div className="w-2 h-full bg-[#fcd116]" />
                          </div>
                          <div className="text-right leading-none space-y-0.5">
                            <p>République du Cameroun</p>
                            <p>Paix - Travail - Patrie</p>
                          </div>
                        </div>

                        {/* Ministry & School Header */}
                        <div className="p-3 border-b border-accent flex items-center gap-3 bg-accent/5 shrink-0">
                          <div className="w-12 h-12 bg-white rounded-lg p-1 border shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                            {user?.school?.logo ? <img src={user.school.logo} alt="School Logo" className="w-full h-full object-contain" /> : null}
                          </div>
                          <div className="flex-1">
                            <p className="text-[8px] font-black uppercase text-muted-foreground leading-none mb-0.5">Ministry of Secondary Education</p>
                            <h3 className="text-xs font-black uppercase text-primary leading-tight">
                              {user?.school?.name || "GOVERNMENT BILINGUAL HIGH SCHOOL DEIDO"}
                            </h3>
                            <p className="text-[7px] font-bold text-muted-foreground italic">"{user?.school?.motto || "Discipline - Work - Success"}"</p>
                          </div>
                        </div>

                        <div className="flex-1 p-4 flex gap-6 relative">
                          <div className="w-28 h-28 rounded-xl border-2 border-primary/10 overflow-hidden shadow-lg shrink-0 bg-accent/5">
                            {s.avatar ? <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="flex-1 flex flex-col justify-center gap-3">
                            <div className="space-y-0.5">
                              <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Full Name / Nom Complet</p>
                              <p className="text-sm font-black text-primary uppercase leading-tight">{s.name}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-0.5">
                                <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Matricule</p>
                                <p className="text-sm font-mono font-black text-secondary">{s.id}</p>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Class / Classe</p>
                                <p className="text-xs font-black text-primary">{s.class}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-primary/5 p-2 flex justify-between items-center border-t border-accent shrink-0">
                          <div className="px-3 py-1 bg-primary text-white rounded-md text-[9px] font-black tracking-widest">
                            STUDENT ID CARD
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black text-muted-foreground uppercase">Admission Year</span>
                            <Badge className="bg-secondary text-primary border-none text-[9px] font-black h-5">{s.admissionYear || "Pending"}</Badge>
                          </div>
                        </div>
                      </Card>
                      <p className="text-center text-[10px] font-black uppercase text-muted-foreground mt-2 no-print tracking-[0.2em]">Front / Recto</p>
                    </div>

                    {/* BACK SIDE */}
                    <div className="relative card-container">
                      <Card className="w-[450px] h-[280px] border shadow-xl bg-white overflow-hidden relative border-primary/20 flex flex-col">
                        <div className="bg-primary h-1 w-full shrink-0" />
                        
                        <div className="flex-1 p-6 flex flex-col gap-6">
                          <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Guardian / Tuteur</p>
                                <p className="text-[10px] font-bold text-primary">{s.guardian}</p>
                                <p className="text-[10px] font-black text-secondary flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> {s.guardianPhone}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Date of Birth / Né(e) le</p>
                                <p className="text-[10px] font-bold text-primary">{s.dob}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Gender</p>
                                  <p className="text-[10px] font-bold text-primary capitalize">{s.gender || "-"}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Admission</p>
                                  <p className="text-[10px] font-bold text-primary">{s.admissionDate || "-"}</p>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Residential Address / Adresse</p>
                                <p className="text-[9px] font-medium text-muted-foreground leading-tight">{s.address}</p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center gap-4 text-center border-l border-accent pl-8">
                              <div className="p-2 bg-white border-2 border-accent rounded-xl shadow-inner">
                                {s.qrCode ? (
                                  <img src={s.qrCode} alt={`Verification QR for ${s.name}`} className="w-20 h-20 object-contain" />
                                ) : (
                                  <QrCode className="w-20 h-20 text-primary" />
                                )}
                              </div>
                              <p className="text-[7px] font-black text-muted-foreground uppercase leading-tight tracking-widest">
                                Scannez pour vérifier l'authenticité<br/>Scan to verify authenticity
                              </p>
                            </div>
                          </div>

                          <div className="mt-auto flex justify-between items-end border-t border-accent/50 pt-4">
                            <div className="space-y-4">
                              <div className="text-[8px] max-w-[200px] leading-relaxed text-muted-foreground font-medium">
                                <p className="font-black text-[7px] uppercase text-primary mb-1">Notice / Avertissement</p>
                                This card is strictly personal. If found, please return to the school administration.
                              </div>
                            </div>
                            <div className="text-center space-y-1 relative">
                              <div className="h-px bg-primary/20 w-24 mx-auto mb-1" />
                              <p className="text-[8px] font-black text-primary uppercase">The Principal</p>
                              <Badge variant="outline" className="text-[7px] border-primary/20 text-primary font-black uppercase">Official Seal</Badge>
                            </div>
                          </div>
                        </div>

                        {/* PLATFORM BRANDING FOOTER */}
                        <div className="bg-accent/20 p-2 px-4 flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-2">
                            <img src={platformLogo} alt="EduIgnite logo" className="w-4 h-4 object-contain rounded-sm" />
                            <p className="text-[7px] font-black text-primary uppercase tracking-widest">
                              Powered by {platformSettings.name} SaaS
                            </p>
                          </div>
                          <span className="text-[6px] text-muted-foreground font-bold italic">Secure Node Registry</span>
                        </div>
                      </Card>
                      <p className="text-center text-[10px] font-black uppercase text-muted-foreground mt-2 no-print tracking-[0.2em]">Back / Verso</p>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="bg-accent/10 p-6 border-t no-print flex sm:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2 text-muted-foreground italic">
               <Info className="w-4 h-4" />
               <p className="text-[10px]">Optimized for standard 85.60 × 53.98 mm (CR80) PVC cards.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="rounded-xl h-12 px-8" onClick={() => setIsPreviewing(false)}>Back to List</Button>
              <Button variant="outline" className="rounded-xl h-12 px-8 font-bold gap-2" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                <Download className="w-5 h-5" /> {isGeneratingPdf ? "Preparing PDF..." : `Download PDF (${selectedStudents.length})`}
              </Button>
              <Button className="rounded-xl h-12 px-8 shadow-lg font-bold gap-2" onClick={handlePrint}>
                <Printer className="w-5 h-5" /> Print Batch ({selectedStudents.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
