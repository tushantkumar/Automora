import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Zap, ArrowRight, Sparkles, Globe, Building2, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

const AUTOMATIONS = [
  { id: "lead_responder", title: "Lead Responder", desc: "Auto-draft replies to new inquiries" },
  { id: "invoice_chaser", title: "Invoice Chaser", desc: "Friendly reminders for overdue payments" },
  { id: "meeting_linker", title: "Meeting Linker", desc: "Share your calendar when clients ask to talk" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const [industry, setIndustry] = useState("");
  const [businessBio, setBusinessBio] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [clientsCount, setClientsCount] = useState("");
  const [automationUse, setAutomationUse] = useState("");
  const [selectedAutomations, setSelectedAutomations] = useState<string[]>(["lead_responder", "invoice_chaser"]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const isStep1Valid = industry.trim() && businessBio.trim();
  const isStep2Valid = organizationName.trim() && Number(clientsCount) > 0 && automationUse.trim();
  const isStep3Valid = selectedAutomations.length > 0;

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const loadOnboarding = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/onboarding`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) return;
        const data = await response.json();
        const details = data?.details;
        if (details) {
          setIndustry(details.industry || "");
          setBusinessBio(details.business_bio || "");
          setOrganizationName(details.organization_name || "");
          setClientsCount(String(details.clients_count || ""));
          setAutomationUse(details.automation_use || "");
          if (Array.isArray(details.selected_automations)) {
            setSelectedAutomations(details.selected_automations.map((value: unknown) => String(value)));
          }
        }
      } catch {
        // best effort only
      }
    };

    loadOnboarding();
  }, []);

  const toggleAutomation = (id: string) => {
    setSelectedAutomations((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const nextStep = async () => {
    if (step === 1 && !isStep1Valid) {
      toast({ title: "Please fill industry and business description to continue." });
      return;
    }

    if (step === 2 && !isStep2Valid) {
      toast({ title: "Please fill all organization details to continue." });
      return;
    }

    if (step < totalSteps) {
      setStep(step + 1);
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      toast({ title: "You are not logged in. Please login again." });
      return;
    }

    if (!isStep3Valid) {
      toast({ title: "Select at least one automation to finish setup." });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          industry: industry.trim(),
          businessBio: businessBio.trim(),
          organizationName: organizationName.trim(),
          clientsCount: Number(clientsCount),
          automationUse: automationUse.trim(),
          selectedAutomations,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: "Unable to save onboarding details.", description: data.message || "Please try again." });
        return;
      }

      setLocation("/dashboard");
    } catch {
      toast({ title: "Unable to save onboarding details.", description: "Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-8 animate-in-fade">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-primary items-center justify-center text-primary-foreground font-bold font-heading text-2xl mb-2 shadow-lg shadow-primary/20">
            A
          </div>
          <h1 className="text-3xl font-bold font-heading tracking-tight">Setting up your AI Agent</h1>
          <p className="text-muted-foreground">Let's customize Autoflow for your business needs.</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="shadow-xl border-border/50 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent" />

          <TabsContent active={step === 1}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" /> Your Business
              </CardTitle>
              <CardDescription>Tell us a bit about what you do so our AI can learn your context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="industry">What industry are you in?</Label>
                <Input
                  id="industry"
                  placeholder="e.g. Graphic Design, Real Estate, E-commerce"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Briefly describe your services</Label>
                <textarea
                  id="bio"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="We provide custom logos and branding for tech startups..."
                  value={businessBio}
                  onChange={(event) => setBusinessBio(event.target.value)}
                />
              </div>
            </CardContent>
          </TabsContent>

          <TabsContent active={step === 2}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> Organization Setup
              </CardTitle>
              <CardDescription>Help us configure automation for your team and client workload.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="organizationName">Organization name</Label>
                <Input
                  id="organizationName"
                  placeholder="e.g. Lumina Design Studio"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientsCount" className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" /> Number of clients
                </Label>
                <Input
                  id="clientsCount"
                  type="number"
                  min={1}
                  placeholder="e.g. 25"
                  value={clientsCount}
                  onChange={(event) => setClientsCount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="automationUse">How do you want to use automation?</Label>
                <textarea
                  id="automationUse"
                  className="flex min-h-[110px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Example: I want to automate inbound lead replies, follow-up reminders, and invoice follow-ups."
                  value={automationUse}
                  onChange={(event) => setAutomationUse(event.target.value)}
                />
              </div>
            </CardContent>
          </TabsContent>

          <TabsContent active={step === 3}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" /> Select Automations
              </CardTitle>
              <CardDescription>Choose at least one workflow to activate now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {AUTOMATIONS.map((automation) => (
                <AutomationOption
                  key={automation.id}
                  title={automation.title}
                  desc={automation.desc}
                  checked={selectedAutomations.includes(automation.id)}
                  onToggle={() => toggleAutomation(automation.id)}
                />
              ))}
            </CardContent>
          </TabsContent>

          <div className="p-6 pt-0 flex justify-between">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button onClick={nextStep} className="gap-2" disabled={step === totalSteps && isSaving}>
              {step === totalSteps ? (isSaving ? "Saving..." : "Finish Setup") : "Continue"} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>


        {step === 3 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Your AI agent is ready to start saving you time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TabsContent({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null;
  return <div className="animate-in fade-in slide-in-from-right-4 duration-300">{children}</div>;
}

function AutomationOption({
  title,
  desc,
  checked,
  onToggle,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${checked ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/20"}`}
    >
      <div className="flex gap-4 items-center">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checked ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
        {checked && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
    </div>
  );
}
