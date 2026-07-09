"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { ordersService } from "@/lib/api/services/orders.service";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

const regions = [
  "Adamawa",
  "Centre",
  "East",
  "Far North",
  "Littoral",
  "North",
  "North West",
  "West",
  "South",
  "South West",
];

const capabilities = [
  { icon: Building2, title: "School structure", text: "General, technical, bilingual, Anglophone and Francophone sections with classes and staff responsibilities." },
  { icon: ClipboardCheck, title: "Attendance and discipline", text: "Daily records, summaries, parent visibility and administrative follow-up based on real school data." },
  { icon: BookOpenCheck, title: "Marks and report cards", text: "Terms, sequences, 0-20 marks, rankings, report cards, transcripts and honour roll workflows." },
  { icon: CreditCard, title: "Fees and documents", text: "Fee types, balances, receipts, student ID cards, school branding and downloadable PDF documents." },
  { icon: Users, title: "Connected accounts", text: "Founder, school admin, sub-admin, teacher, student, parent, bursar and librarian accounts with proper access control." },
  { icon: MessageCircle, title: "Communication", text: "Announcements, feedback, support, live chat, community updates and onboarding guidance for every school." },
];

const onboardingSteps = [
  "Submit your school account request from this page.",
  "The EduIgnite founder office reviews your school details and contacts your administration.",
  "Your school is registered, receives its matricule and onboarding documents, then activates the admin account.",
  "Your school configures academic years, sections, classes, staff, fees, subjects and users.",
];

type RequestForm = {
  full_name: string;
  occupation: string;
  school_name: string;
  whatsapp_number: string;
  email: string;
  region: string;
  division: string;
  sub_division: string;
  message: string;
};

const initialForm: RequestForm = {
  full_name: "",
  occupation: "",
  school_name: "",
  whatsapp_number: "",
  email: "",
  region: "",
  division: "",
  sub_division: "",
  message: "",
};

export default function SchoolAccountRequestPage() {
  const { platformSettings } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<RequestForm>(initialForm);
  const [source, setSource] = useState("direct");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const platformName = platformSettings.name || "EduIgnite";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSource(params.get("source") || "direct");
  }, []);

  const message = useMemo(() => {
    const note = form.message.trim();
    const sourceLine = `Request source: ${source}.`;
    return note ? `${note}\n\n${sourceLine}` : sourceLine;
  }, [form.message, source]);

  const updateForm = (key: keyof RequestForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await ordersService.createOrder({
        ...form,
        message,
      });
      setSubmitted(true);
      setForm(initialForm);
      toast({
        title: "Request submitted",
        description: "The EduIgnite founder office will review your school request and contact you.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: getApiErrorMessage(error, "We could not submit the request right now."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden bg-primary text-white">
        <div className="absolute inset-0 opacity-[0.08]" aria-hidden="true">
          <div className="h-full w-full bg-[linear-gradient(90deg,white_1px,transparent_1px),linear-gradient(0deg,white_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>
        <div className="relative mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
          <nav className="mb-14 flex items-center justify-between gap-4">
            <Link href="/community" className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-lg">
                <img src={platformLogo} alt={`${platformName} logo`} className="h-full w-full object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xl font-black">{platformName}</span>
                <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-white/60">School account request</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher tone="dark" className="border border-white/20" />
              <Button asChild variant="secondary" className="hidden rounded-xl font-black text-primary sm:inline-flex">
                <a href="#request">Request Account</a>
              </Button>
            </div>
          </nav>

          <div className="max-w-5xl">
            <Badge className="mb-5 border-white/10 bg-white/10 text-white">Built for Cameroon secondary schools</Badge>
            <h1 className="max-w-4xl text-4xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              A complete digital operating system for modern school administration.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/75">
              EduIgnite helps secondary schools manage administration, academic records, teachers, students, parents, fees, attendance, examinations, report cards, transcripts, ID cards, communication and executive support from one secure platform.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-xl bg-secondary px-8 font-black text-primary hover:bg-secondary/90">
                <a href="#request">
                  Request Your School Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-xl border-white/20 bg-white/10 px-8 font-black text-white hover:bg-white hover:text-primary">
                <a href="#platform">See What It Covers</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-secondary">Platform coverage</p>
            <h2 className="mt-2 text-3xl font-black text-primary sm:text-4xl">Everything a school needs to run clearly</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            The platform is organized around real school roles and Cameroon secondary school workflows, including terms, sequences, sub-schools, class masters, bursars, teachers, parents and students.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((item) => (
            <Card key={item.title} className="border-none shadow-sm">
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
                  <item.icon className="h-5 w-5 text-secondary" />
                </div>
                <CardTitle className="text-lg text-primary">{item.title}</CardTitle>
                <CardDescription className="leading-7">{item.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-secondary">How onboarding works</p>
            <h2 className="mt-2 text-3xl font-black text-primary">From request to activated school account</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              EduIgnite does not leave schools to guess. The founder office reviews the request, creates the school profile, sends onboarding documents and guides the school administrator through activation and setup.
            </p>
          </div>
          <div className="grid gap-3">
            {onboardingSteps.map((step, index) => (
              <div key={step} className="flex gap-4 rounded-2xl border bg-background p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-white">{index + 1}</span>
                <p className="self-center text-sm font-semibold leading-6 text-primary">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="request" className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
        <div className="space-y-5">
          <Badge className="border-none bg-secondary/20 text-primary">School onboarding request</Badge>
          <h2 className="text-3xl font-black text-primary">Tell us about your school</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Fill this form if you are a proprietor, principal, vice principal, administrator or authorized school representative. The request goes directly to the EduIgnite founder team.
          </p>
          <div className="grid gap-3 text-sm">
            {[
              { icon: ShieldCheck, text: "Founder office review before account creation." },
              { icon: Mail, text: "Onboarding information is sent to the school administrator email." },
              { icon: Bell, text: "Your request appears in the executive Support & Orders dashboard." },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                <item.icon className="h-4 w-4 text-secondary" />
                <span className="font-semibold text-primary">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle>Request School Account</CardTitle>
            <CardDescription>Use official school information so the founder office can verify and contact you quickly.</CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
                <div className="flex items-center gap-3 font-black">
                  <CheckCircle2 className="h-5 w-5" />
                  Request received
                </div>
                <p className="mt-2 text-sm leading-7">
                  Thank you. The EduIgnite founder office will review the request and contact the school representative.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full-name">Representative full name</Label>
                <Input id="full-name" required value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Role / occupation</Label>
                <Select value={form.occupation} onValueChange={(value) => updateForm("occupation", value)}>
                  <SelectTrigger id="occupation"><SelectValue placeholder="Choose your role" /></SelectTrigger>
                  <SelectContent>
                    {["Proprietor", "Principal", "Vice Principal", "School Administrator", "ICT Coordinator", "Bursar", "Teacher", "Other"].map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="school-name">School name</Label>
                <Input id="school-name" required value={form.school_name} onChange={(event) => updateForm("school_name", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Official email</Label>
                <Input id="email" required type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp number</Label>
                <Input id="whatsapp" required value={form.whatsapp_number} onChange={(event) => updateForm("whatsapp_number", event.target.value)} placeholder="+237..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Select value={form.region} onValueChange={(value) => updateForm("region", value)}>
                  <SelectTrigger id="region"><SelectValue placeholder="Choose region" /></SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => <SelectItem key={region} value={region}>{region}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="division">Division</Label>
                <Input id="division" required value={form.division} onChange={(event) => updateForm("division", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sub-division">Sub-division / town</Label>
                <Input id="sub-division" required value={form.sub_division} onChange={(event) => updateForm("sub_division", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="message">What should we know before contacting you?</Label>
                <Textarea id="message" value={form.message} onChange={(event) => updateForm("message", event.target.value)} placeholder="Example: We are a bilingual secondary school and want to digitize fees, report cards and parent follow-up." />
              </div>
              <Button disabled={isSubmitting || !form.occupation || !form.region} className="h-12 rounded-xl font-black md:col-span-2">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Submit School Request
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t bg-primary px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between">
          <div className="font-black">{platformName}</div>
          <div className="flex flex-wrap gap-4 text-white/70">
            <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> +237 school onboarding support</span>
            <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> Cameroon secondary education</span>
            <span className="inline-flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Digital school transformation</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
