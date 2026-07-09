"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Download,
  FileText,
  History,
  Loader2,
  Lock,
  Printer,
  QrCode,
  Send,
  ShieldCheck,
  User,
  Wallet,
  X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { usePlatformFees } from "@/lib/hooks/usePlatform";
import { useCreatePayment, useMyPayments } from "@/lib/hooks/useFees";
import { getLicenseAccessState } from "@/lib/license";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveMediaUrl } from "@/lib/media";
import { downloadHtmlDocument, escapeHtml } from "@/lib/browser-download";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROLE_FEES: Record<string, string> = {
  STUDENT: "5000",
  PARENT: "2500",
  TEACHER: "10000",
  BURSAR: "10000",
  LIBRARIAN: "10000",
  SCHOOL_ADMIN: "25000",
  SUB_ADMIN: "15000",
};

function SignatureSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 25C15 25 20 15 25 15C30 15 35 30 40 30C45 30 50 10 55 10C60 10 65 35 70 35C75 35 80 20 85 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function SubscriptionPage() {
  const { user, platformSettings, markLicensePaid } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const { data: platformFeesData } = usePlatformFees();
  const { data: myPaymentsData } = useMyPayments();
  const createPaymentMutation = useCreatePayment();

  const [isProcessing, setIsProcessing] = useState(false);
  const [issuedReceipt, setIssuedReceipt] = useState<any>(null);
  const [paymentData, setPaymentData] = useState({ method: "mtn", number: "" });

  const liveFees: Record<string, string> = {};
  const feeRows = (platformFeesData as any)?.results ?? [];
  feeRows.forEach((fee: any) => {
    if (fee?.role) liveFees[fee.role] = String(fee.amount ?? "0");
  });

  const mergedFees = { ...ROLE_FEES, ...(platformSettings.fees || {}), ...liveFees };
  const userFee = mergedFees[user?.role || "STUDENT"] || "0";
  const deadline = platformSettings.paymentDeadline;
  const licenseState = getLicenseAccessState(user as any, { ...platformSettings, fees: mergedFees } as any);
  const paymentStatus = licenseState.feeAmount <= 0 ? "waived" : licenseState.isPaid ? "paid" : licenseState.beforeDeadline ? "pending" : "overdue";
  const paymentHistory = Array.isArray(myPaymentsData) ? myPaymentsData : myPaymentsData?.results ?? [];
  const latestConfirmedPayment = paymentHistory.find((payment: any) => payment.status === "confirmed");

  const buildReceiptFromPayment = (payment?: any) => ({
    id: payment?.receipt_number || payment?.reference_number || payment?.id || `LIC-${user?.matricule || user?.id}`,
    userName: user?.name,
    userMatricule: user?.matricule || user?.id,
    userRole: user?.role,
    schoolName: user?.school?.name || platformSettings.name,
    schoolLogo: resolveMediaUrl(user?.school?.logo || ""),
    amount: Number(payment?.amount ?? userFee).toLocaleString(),
    date: payment?.payment_date
      ? new Date(payment.payment_date).toLocaleDateString(language === "en" ? "en-US" : "fr-FR")
      : new Date().toLocaleDateString(language === "en" ? "en-US" : "fr-FR"),
    expiry: deadline || "Not set",
    ref: payment?.reference_number || payment?.id || "N/A",
  });

  const handlePaySubscription = async () => {
    if (!paymentData.number.trim()) {
      toast({
        variant: "destructive",
        title: language === "en" ? "Missing Number" : "Numero Manquant",
        description: language === "en" ? "Please enter your mobile money number." : "Veuillez entrer votre numero mobile money.",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const payment = await createPaymentMutation.mutateAsync({
        amount: userFee,
        currency: "XAF",
        payment_method: "mobile_money",
        payment_date: new Date().toISOString().slice(0, 10),
        notes: `${paymentData.method.toUpperCase()} ${paymentData.number}`,
        mark_license_paid: true,
      });
      await markLicensePaid();
      setIssuedReceipt(buildReceiptFromPayment(payment));
      toast({
        title: language === "en" ? "Payment Recorded" : "Paiement Enregistre",
        description:
          language === "en"
            ? "Your annual institutional license has been activated and the receipt is ready."
            : "Votre licence institutionnelle annuelle a ete activee et le recu est pret.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: language === "en" ? "Payment Failed" : "Paiement Echoue",
        description: getApiErrorMessage(error, language === "en" ? "We could not record your subscription payment." : "Nous n'avons pas pu enregistrer votre paiement."),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateReceipt = () => {
    if (paymentStatus === "waived") {
      setIssuedReceipt(buildReceiptFromPayment());
      return;
    }
    if (!latestConfirmedPayment) {
      toast({
        variant: "destructive",
        title: language === "en" ? "No Receipt Available" : "Aucun Recu Disponible",
        description: language === "en" ? "There is no confirmed payment receipt to display yet." : "Aucun recu de paiement confirme n'est encore disponible.",
      });
      return;
    }
    setIssuedReceipt(buildReceiptFromPayment(latestConfirmedPayment));
  };

  const handleDownloadReceipt = () => {
    const element = document.getElementById("printable-license-receipt");
    if (!element) {
      return;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml("License Receipt")}</title></head><body>${element.outerHTML}</body></html>`;
    const safeReference = `${issuedReceipt?.userMatricule || user?.matricule || user?.id || "receipt"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    downloadHtmlDocument(html, `license-receipt-${safeReference}.html`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
              <div className="p-2 bg-primary rounded-xl shadow-lg">
                <Wallet className="w-6 h-6 text-secondary" />
              </div>
              {t("subscription")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === "en" ? "Manage your annual institutional license and dashboard access fees." : "Gerez votre licence institutionnelle annuelle et vos frais d'acces au tableau de bord."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(paymentStatus === "paid" || paymentStatus === "waived") && (
            <Button variant="outline" className="h-10 rounded-xl font-bold gap-2 border-primary/20" onClick={handleGenerateReceipt}>
              <Printer className="w-4 h-4" /> {language === "en" ? "Receipt" : "Recu"}
            </Button>
          )}
          <Badge
            variant={paymentStatus === "paid" || paymentStatus === "waived" ? "secondary" : "outline"}
            className={cn("h-10 px-6 rounded-xl font-black uppercase tracking-widest", paymentStatus === "paid" || paymentStatus === "waived" ? "bg-green-100 text-green-700 border-none" : "border-primary/20 text-primary")}
          >
            {paymentStatus === "waived" ? "No Fee" : paymentStatus === "paid" ? t("paid") : paymentStatus === "pending" ? "Pending" : "Overdue"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-8">
          <Card className="border-none shadow-xl overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-primary p-8 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-2xl">
                    <ShieldCheck className="w-8 h-8 text-secondary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black">{t("subscriptionStatus")}</CardTitle>
                    <CardDescription className="text-white/60">Annual Platform Access Registry</CardDescription>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">Valid Until</p>
                  <p className="text-lg font-bold">{deadline || "Not set"}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Your Role</p>
                  <p className="text-xl font-bold text-primary flex items-center gap-2">
                    <User className="w-5 h-5 text-secondary" />
                    {user?.role?.replace("_", " ")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Annual Charge</p>
                  <p className="text-2xl font-black text-primary">
                    {parseInt(userFee).toLocaleString()} <span className="text-xs font-bold text-muted-foreground">XAF</span>
                  </p>
                </div>
              </div>

              {paymentStatus === "overdue" ? (
                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
                  <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-bold text-amber-900 leading-none">Action Required</p>
                    <p className="text-xs text-amber-800 leading-relaxed">Your annual license fee is outstanding. Please clear the balance because the configured deadline has passed.</p>
                  </div>
                </div>
              ) : paymentStatus === "pending" ? (
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4">
                  <Clock className="w-6 h-6 text-blue-600 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-bold text-blue-900 leading-none">Deadline Not Reached</p>
                    <p className="text-xs text-blue-800 leading-relaxed">Access remains open until {deadline || "the founder-configured deadline"}, even though the annual fee is not yet paid.</p>
                  </div>
                </div>
              ) : paymentStatus === "waived" ? (
                <div className="p-6 bg-green-50 rounded-2xl border border-green-100 flex gap-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-bold text-green-900 leading-none">No Restriction Applied</p>
                    <p className="text-xs text-green-800 leading-relaxed">The annual license amount for your role is 0 XAF, so the dashboard stays open without payment.</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-green-50 rounded-2xl border border-green-100 flex gap-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-bold text-green-900 leading-none">License Activated</p>
                    <p className="text-xs text-green-800 leading-relaxed">Your annual license payment is recorded in the backend and your dashboard access is active.</p>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <History className="w-4 h-4" /> Transaction History
                  </h4>
                  {(paymentStatus === "paid" || paymentStatus === "waived") && (
                    <Button variant="link" className="h-auto p-0 text-[10px] font-black uppercase text-secondary" onClick={handleGenerateReceipt}>
                      Download Receipt <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {latestConfirmedPayment || paymentStatus === "waived" ? (
                    <div className="flex items-center justify-between p-4 rounded-xl bg-accent/30 border border-accent">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{latestConfirmedPayment?.fee_name || "Platform License Payment"}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">
                            {latestConfirmedPayment?.payment_date ? new Date(latestConfirmedPayment.payment_date).toLocaleDateString() : "Today"}, Successfully Recorded
                          </p>
                        </div>
                      </div>
                      <span className="font-black text-primary">{Number(latestConfirmedPayment?.amount ?? userFee).toLocaleString()} XAF</span>
                    </div>
                  ) : (
                    <p className="text-xs text-center py-10 text-muted-foreground italic">No successful transactions recorded for this period.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-8">
          <Card className={cn("border-none shadow-2xl overflow-hidden rounded-[2rem] transition-all duration-500", paymentStatus === "paid" || paymentStatus === "waived" ? "opacity-50 grayscale pointer-events-none" : "")}>
            <CardHeader className="bg-accent/50 border-b p-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <CreditCard className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl font-black text-primary">{t("paySubscription")}</CardTitle>
                  <CardDescription>Instant Institutional Activation</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Select Provider</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant={paymentData.method === "mtn" ? "default" : "outline"} className={cn("h-14 rounded-2xl font-bold transition-all", paymentData.method === "mtn" ? "border-primary" : "border-accent")} onClick={() => setPaymentData({ ...paymentData, method: "mtn" })}>MTN MoMo</Button>
                    <Button variant={paymentData.method === "orange" ? "default" : "outline"} className={cn("h-14 rounded-2xl font-bold transition-all", paymentData.method === "orange" ? "border-primary" : "border-accent")} onClick={() => setPaymentData({ ...paymentData, method: "orange" })}>Orange Money</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Mobile Number</Label>
                  <Input placeholder="6XX XX XX XX" className="h-14 bg-accent/30 border-none rounded-2xl font-black text-primary focus-visible:ring-primary text-lg px-6" value={paymentData.number} onChange={(e) => setPaymentData({ ...paymentData, number: e.target.value })} />
                </div>
                <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-primary/60 tracking-widest">Total to Pay</p>
                    <p className="text-3xl font-black text-primary">{parseInt(userFee).toLocaleString()} XAF</p>
                  </div>
                  <div className="p-3 bg-primary rounded-2xl text-white shadow-xl">
                    <Coins className="w-8 h-8 text-secondary" />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-accent/20 p-6 border-t border-accent">
              <Button className="w-full h-16 rounded-2xl shadow-xl font-black uppercase tracking-widest text-xs gap-3" onClick={() => void handlePaySubscription()} disabled={isProcessing || paymentStatus === "paid" || paymentStatus === "waived"}>
                {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                Process Payment
              </Button>
            </CardFooter>
          </Card>

          <div className="p-8 rounded-[2rem] bg-white border shadow-sm space-y-6 text-center">
            <div className="flex justify-center">
              <div className="p-4 bg-accent rounded-full">
                <Lock className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-black text-primary uppercase tracking-tighter">Secure SaaS Registry</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">All transactions are linked to your institutional matricule and saved as real platform payment records.</p>
            </div>
            <div className="flex flex-col items-center gap-2 pt-2 border-t">
              <QrCode className="w-20 h-20 opacity-10" />
              <p className="text-[10px] font-bold uppercase text-muted-foreground opacity-40">Verified Infrastructure</p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!issuedReceipt} onOpenChange={() => setIssuedReceipt(null)}>
        <DialogContent className="sm:max-w-2xl p-0 border-none shadow-2xl rounded-[2rem] overflow-hidden">
          <DialogHeader className="bg-primary p-8 text-white no-print relative">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl">
                <FileText className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <DialogTitle className="text-xl md:text-2xl font-black">Official License Receipt</DialogTitle>
                <DialogDescription className="text-white/60">Annual pedagogical dashboard authorization record.</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIssuedReceipt(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>

          <div className="bg-muted p-6 md:p-10 print:p-0 print:bg-white overflow-hidden overflow-y-auto max-h-[70vh]">
            <div id="printable-license-receipt" className="bg-white p-8 md:p-12 border-2 border-black shadow-sm relative flex flex-col space-y-10 font-serif text-black print:border-none print:shadow-none min-w-[350px]">
              <div className="grid grid-cols-3 gap-2 items-start text-center border-b-2 border-black pb-4">
                <div className="space-y-0.5 text-[7px] uppercase font-bold">
                  <p>Republic of Cameroon</p>
                  <p>Peace - Work - Fatherland</p>
                </div>
                <div className="flex flex-col items-center">
                  {issuedReceipt?.schoolLogo ? <img src={issuedReceipt.schoolLogo} alt="School" className="w-12 h-12 object-contain" /> : null}
                </div>
                <div className="space-y-0.5 text-[7px] uppercase font-bold">
                  <p>Republique du Cameroun</p>
                  <p>Paix - Travail - Patrie</p>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h2 className="font-black text-sm md:text-base uppercase tracking-tighter text-primary leading-tight">{issuedReceipt?.schoolName || platformSettings.name}</h2>
                <p className="text-[8px] md:text-[10px] font-bold uppercase opacity-60 tracking-widest underline decoration-double underline-offset-2">Dashboard License Activation Receipt</p>
              </div>

              <div className="flex justify-between items-end bg-accent/5 p-4 border border-black/10 rounded-xl">
                <div>
                  <p className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">License Code</p>
                  <p className="text-sm md:text-base font-mono font-black text-primary">{issuedReceipt?.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest">Transaction Date</p>
                  <p className="font-bold text-xs md:text-sm">{issuedReceipt?.date}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-2">
                <div className="space-y-4">
                  <div>
                    <p className="text-[8px] md:text-[9px] font-black uppercase text-muted-foreground tracking-widest border-b border-black/5 pb-1 mb-2">User Identity</p>
                    <p className="font-black text-xs md:text-base uppercase leading-tight">{issuedReceipt?.userName}</p>
                    <p className="text-[9px] font-mono font-bold text-primary mt-1">ID: {issuedReceipt?.userMatricule}</p>
                    <p className="text-[8px] font-black uppercase opacity-40 mt-1">{issuedReceipt?.userRole}</p>
                  </div>
                  <div>
                    <p className="text-[8px] md:text-[9px] font-black uppercase text-muted-foreground tracking-widest border-b border-black/5 pb-1 mb-2">Service Description</p>
                    <p className="text-[10px] leading-relaxed italic">"Annual platform access license recorded through the EduIgnite payment workflow."</p>
                  </div>
                </div>
                <div className="text-left md:text-right flex flex-col justify-between">
                  <div className="p-4 bg-primary text-white rounded-2xl shadow-xl">
                    <p className="text-[8px] md:text-[9px] font-black uppercase opacity-60 tracking-widest mb-1">Fee Amount Received</p>
                    <p className="font-black text-xl md:text-2xl text-secondary underline underline-offset-4 decoration-double">{issuedReceipt?.amount} XAF</p>
                  </div>
                  <div className="mt-4">
                    <p className="text-[8px] font-black uppercase text-muted-foreground">Transaction Reference</p>
                    <p className="text-[10px] font-mono font-bold">{issuedReceipt?.ref}</p>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-black/5 flex justify-between items-end">
                <div className="flex flex-col items-center gap-2">
                  <QrCode className="w-14 h-14 md:w-20 md:h-20 text-primary opacity-20" />
                  <p className="text-[7px] font-black uppercase text-muted-foreground opacity-40">Verified Registry Node</p>
                </div>
                <div className="text-center space-y-6 w-32">
                  <div className="h-10 md:h-12 w-full mx-auto bg-primary/5 rounded border-b-2 border-black/40 relative flex items-center justify-center">
                    <SignatureSVG className="w-full h-full text-primary/20 p-2" />
                  </div>
                  <p className="text-[8px] font-black uppercase text-primary tracking-widest leading-none">The Registrar</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="bg-accent/10 p-6 md:p-8 border-t no-print flex flex-col sm:flex-row gap-4">
            <Button variant="outline" className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs" onClick={() => setIssuedReceipt(null)}>
              Dismiss
            </Button>
            <div className="flex flex-1 gap-2">
              <Button variant="secondary" className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs gap-2" onClick={handleDownloadReceipt}>
                <Download className="w-4 h-4" /> Download
              </Button>
              <Button className="flex-1 rounded-2xl h-14 shadow-2xl font-black uppercase tracking-widest text-xs gap-2 bg-primary text-white" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Print Receipt
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
