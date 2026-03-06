import { Link, useLocation } from "wouter";
import { ArrowRight, BadgeCheck, BarChart3, Bot, FileText, Mail, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const coreFeatures = [
  {
    icon: Mail,
    title: "Smart Inbox + Gmail Sync",
    description: "Connect Gmail, classify incoming emails, generate AI-assisted replies, and keep your entire communication flow organized.",
  },
  {
    icon: Users,
    title: "Workspace User Management",
    description: "Invite teammates, assign roles, deactivate users, and keep your whole team collaborating in one shared workspace.",
  },
  {
    icon: Workflow,
    title: "Automation Workflows",
    description: "Trigger actions from business events and emails to remove repetitive work across customer, invoice, and outreach operations.",
  },
  {
    icon: FileText,
    title: "Customers & Invoices",
    description: "Manage customers, create/update invoices, export files, and keep billing data synchronized across your organization.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Insights",
    description: "Track revenue, overdue invoices, activity trends, and searchable business metrics from one central dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "RBAC & Account Protection",
    description: "Role-based controls and account deactivation safeguards ensure secure operations for every workspace user.",
  },
];

const highlights = [
  "Admin invite + activation flow with secure expiring tokens",
  "Viewer / Editor / Author / Owner / Admin permission model",
  "Automated email + CRM + invoice lifecycle",
  "Deactivated account lockout with immediate access blocking",
];

type BillingPlan = {
  id: "starter" | "growth" | "enterprise";
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: readonly string[];
  recommended?: boolean;
};

const billingPlans: readonly BillingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    cadence: "per workspace / month",
    description: "For solo operators launching automation and invoices quickly.",
    features: ["1 user seat", "Up to 1,000 automated actions", "Email + invoice basics", "Community support"],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$69",
    cadence: "per workspace / month",
    description: "For scaling teams that need deeper collaboration and process control.",
    features: ["Up to 10 user seats", "Up to 20,000 automated actions", "Advanced inbox + templates", "Priority support"],
    recommended: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "annual contract",
    description: "For organizations requiring custom controls, auditability, and SLA commitments.",
    features: ["Unlimited user seats", "Unlimited automations", "Dedicated success manager", "Security + compliance reviews"],
  },
];

type BillingPlanId = (typeof billingPlans)[number]["id"];

export default function Home() {
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId | null>(null);

  const signupUrl = useMemo(() => (selectedPlan ? `/signup?plan=${selectedPlan}` : "/signup"), [selectedPlan]);

  const continueToSignup = () => {
    if (!selectedPlan) {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    navigate(signupUrl);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">A</div>
            <span className="text-lg font-bold tracking-tight">Automora</span>
          </div>
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
            <a href="#highlights" className="transition-colors hover:text-foreground">Highlights</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login"><Button variant="ghost">Login</Button></Link>
            <Button onClick={continueToSignup}>Start Free</Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 sm:py-28">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.16),transparent_45%),radial-gradient(circle_at_80%_10%,hsl(var(--primary)/0.10),transparent_40%)]" />
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI-powered SaaS Operations Platform
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Beautifully automate
                <span className="block text-primary">emails, CRM, invoices, and team workflows.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
                Automora helps teams run operations from one place: smart inbox, automation builder, invoicing, templates, dashboard analytics, and workspace-aware user management.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="gap-2" onClick={continueToSignup}>
                  Create Workspace <ArrowRight className="h-4 w-4" />
                </Button>
                <Link href="/login"><Button size="lg" variant="outline">Go to Login</Button></Link>
              </div>
            </div>

            <Card className="border-border/60 bg-card/80 shadow-xl">
              <CardContent className="space-y-4 p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5 text-primary" /> Platform Highlights</h2>
                <div className="space-y-3">
                  {highlights.map((point) => (
                    <div key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="features" className="border-y border-border/60 bg-muted/25 py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold tracking-tight">Everything already built into your workspace</h2>
              <p className="mt-2 text-muted-foreground">Designed around your current product capabilities—ready for production teams.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {coreFeatures.map((feature) => (
                <FeatureCard key={feature.title} icon={<feature.icon className="h-5 w-5 text-primary" />} title={feature.title} description={feature.description} />
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold tracking-tight">Select your billing plan</h2>
              <p className="mt-2 text-muted-foreground">Choose one plan to continue with workspace creation.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {billingPlans.map((plan) => {
                const isSelected = selectedPlan === plan.id;
                return (
                  <Card
                    key={plan.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPlan(plan.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedPlan(plan.id);
                      }
                    }}
                    className={cn(
                      "relative h-full cursor-pointer border-border/60 bg-card transition-all hover:border-primary/40 hover:shadow-md",
                      isSelected && "border-primary shadow-lg ring-2 ring-primary/20",
                    )}
                  >
                    <CardContent className="flex h-full flex-col p-6">
                      {plan.recommended ? (
                        <span className="mb-4 inline-flex w-fit rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">Most Popular</span>
                      ) : (
                        <span className="mb-4 inline-flex w-fit rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">Plan</span>
                      )}
                      <h3 className="text-xl font-semibold">{plan.name}</h3>
                      <p className="mt-1 text-3xl font-bold">{plan.price}</p>
                      <p className="text-sm text-muted-foreground">{plan.cadence}</p>
                      <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                      <div className="mt-5 space-y-2">
                        {plan.features.map((feature) => (
                          <div key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>

                      <Button className="mt-6" variant={isSelected ? "default" : "outline"}>
                        {isSelected ? "Selected" : "Select plan"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Button size="lg" disabled={!selectedPlan} className="gap-2" onClick={continueToSignup}>
                Continue with selected plan <ArrowRight className="h-4 w-4" />
              </Button>
              {!selectedPlan ? (
                <p className="mt-3 text-sm text-muted-foreground">Please select one billing plan to continue.</p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">You selected the <span className="font-semibold text-foreground">{billingPlans.find((plan) => plan.id === selectedPlan)?.name}</span> plan.</p>
              )}
            </div>
          </div>
        </section>

        <section id="highlights" className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h3 className="text-2xl font-bold tracking-tight">Built for secure, collaborative SaaS operations</h3>
            <p className="mx-auto mt-3 max-w-3xl text-muted-foreground">
              From invitation-based onboarding to role-driven permissions and immediate deactivation enforcement, Automora keeps collaboration productive and controlled.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button className="gap-2" onClick={continueToSignup}>Launch your workspace <ArrowRight className="h-4 w-4" /></Button>
              <Link href="/login"><Button variant="secondary">I already have an account</Button></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Automora. Built for modern business automation.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Card className="h-full border-border/60 bg-card transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
        <h4 className="text-base font-semibold">{title}</h4>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
