import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { User, Bell, Shield, Zap, Mail, Trash2, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

const AUTH_API_ORIGIN = (() => {
  try {
    return new URL(AUTH_API_URL).origin;
  } catch {
    return "";
  }
})();

type ProfileState = {
  name: string;
  email: string;
  company: string;
  status: string;
  platformTier: string;
  subscriptionPlan: string;
};

type IntegrationState = {
  connected: boolean;
  connectedEmail: string | null;
};

const initialProfile: ProfileState = {
  name: "",
  email: "",
  company: "",
  status: "Active",
  platformTier: "free",
  subscriptionPlan: "Starter",
};

export default function Settings() {
  const token = localStorage.getItem("authToken");
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<ProfileState>(initialProfile);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [integrations, setIntegrations] = useState<{ gmail: IntegrationState; outlook: IntegrationState }>({
    gmail: { connected: false, connectedEmail: null },
    outlook: { connected: false, connectedEmail: null },
  });
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [disconnectingProvider, setDisconnectingProvider] = useState<"" | "gmail" | "outlook">("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [sendingDeleteOtp, setSendingDeleteOtp] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteOtp, setDeleteOtp] = useState("");
  const { toast } = useToast();

  const loadIntegrations = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${AUTH_API_URL}/email-integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) return;

      setIntegrations({
        gmail: {
          connected: Boolean(data?.integrations?.gmail?.connected),
          connectedEmail: data?.integrations?.gmail?.connectedEmail || null,
        },
        outlook: {
          connected: Boolean(data?.integrations?.outlook?.connected),
          connectedEmail: data?.integrations?.outlook?.connectedEmail || null,
        },
      });
    } catch {
      // best effort
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!token) {
        setLoadingProfile(false);
        toast({ title: "You are not logged in." });
        return;
      }

      try {
        const [meResponse, onboardingResponse] = await Promise.all([
          fetch(`${AUTH_API_URL}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${AUTH_API_URL}/onboarding`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const meData = await meResponse.json();
        const onboardingData = onboardingResponse.ok ? await onboardingResponse.json() : null;

        if (!meResponse.ok) {
          toast({ title: "Unable to load profile details.", description: meData?.message || "Please try again." });
          setLoadingProfile(false);
          return;
        }

        setProfile({
          name: String(meData?.user?.name || ""),
          email: String(meData?.user?.email || ""),
          company: String(
            onboardingData?.details?.organization_name
              || meData?.user?.organizationName
              || "",
          ),
          status: String(meData?.user?.status || "Active"),
          platformTier: String(meData?.user?.platformTier || "free"),
          subscriptionPlan: String(meData?.user?.subscriptionPlan || "Starter"),
        });
      } catch {
        toast({ title: "Unable to load profile details.", description: "Please try again." });
      } finally {
        setLoadingProfile(false);
      }
    };

    void loadProfile();
    void loadIntegrations();
  }, [token]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const allowedOrigins = [window.location.origin, AUTH_API_ORIGIN].filter(Boolean);
      if (!allowedOrigins.includes(event.origin)) return;

      if (event?.data?.type === "gmail_connected") {
        toast({ title: "Gmail connected successfully. Emails will be available in Inbox." });
        void loadIntegrations();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [token]);

  const connectGmail = async () => {
    if (!token) return;

    setConnectingGmail(true);

    const popup = window.open("", "gmail-auth", "width=520,height=720");

    try {
      const response = await fetch(`${AUTH_API_URL}/email-integrations/gmail/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok || !data?.authUrl) {
        popup?.close();
        toast({ title: "Unable to start Gmail authorization.", description: data?.message || "Please try again." });
        return;
      }

      if (popup) {
        popup.location.href = data.authUrl;
        popup.focus();
      } else {
        window.location.href = data.authUrl;
      }
    } catch {
      popup?.close();
      toast({ title: "Unable to start Gmail authorization.", description: "Please try again." });
    } finally {
      setConnectingGmail(false);
    }
  };

  const disconnectIntegration = async (provider: "gmail" | "outlook") => {
    if (!token) return;

    setDisconnectingProvider(provider);

    try {
      const response = await fetch(`${AUTH_API_URL}/email-integrations/${provider}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        toast({ title: "Unable to disconnect integration.", description: data?.message || "Please try again." });
        return;
      }

      toast({ title: `${provider === "gmail" ? "Gmail" : "Outlook"} disconnected successfully.` });
      void loadIntegrations();
    } catch {
      toast({ title: "Unable to disconnect integration.", description: "Please try again." });
    } finally {
      setDisconnectingProvider("");
    }
  };

  const requestDeleteOtp = async () => {
    if (!token) return;

    setSendingDeleteOtp(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/account/delete/request-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        toast({ title: "Unable to send delete OTP.", description: data?.message || "Please try again." });
        return;
      }

      setDeleteOtp("");
      setOtpModalOpen(true);
      toast({ title: "OTP sent to your email.", description: "It is valid for 10 minutes." });
    } catch {
      toast({ title: "Unable to send delete OTP.", description: "Please try again." });
    } finally {
      setSendingDeleteOtp(false);
    }
  };

  const verifyOtpAndDelete = async () => {
    if (!token) return;

    const otp = deleteOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      toast({ title: "Enter a valid 6-digit OTP." });
      return;
    }

    setDeletingAccount(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otp }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast({ title: "Unable to delete account.", description: data?.message || "Please try again." });
        return;
      }

      toast({ title: "Account deleted successfully." });
      localStorage.removeItem("authToken");
      navigate("/login");
    } catch {
      toast({ title: "Unable to delete account.", description: "Please try again." });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and platform preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-2"><User className="w-4 h-4" /> Profile</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="w-4 h-4" /> Notifications</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="w-4 h-4" /> Security</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2"><Zap className="w-4 h-4" /> Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>User profile details are loaded from database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" value={profile.name} readOnly disabled={loadingProfile} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" value={profile.email} readOnly disabled={loadingProfile} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input id="company" value={profile.company} readOnly disabled={loadingProfile} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Input id="status" value={profile.status} readOnly disabled={loadingProfile} />
              </div>
              <Button disabled>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose when and how you want to be notified.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Digest</Label>
                  <p className="text-sm text-muted-foreground">Receive a daily summary of AI activities.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Lead Alerts</Label>
                  <p className="text-sm text-muted-foreground">Instant notification when a new lead is detected.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>System Updates</Label>
                  <p className="text-sm text-muted-foreground">Updates about new features and improvements.</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform & Plan</CardTitle>
              <CardDescription>See which platform tier and plan this customer account is using.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Platform Type</Label>
                  <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <span className="capitalize">{profile.platformTier}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Current Plan</Label>
                  <div className="rounded-md border p-3 text-sm">{profile.subscriptionPlan}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Delete account requires OTP verification sent to your registered email.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                <Trash2 className="w-4 h-4" /> Delete Account
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <IntegrationCard
              name="Gmail"
              description="Authorize Gmail and pull emails automatically into Inbox."
              status={integrations.gmail.connected ? `Connected (${integrations.gmail.connectedEmail || "account"})` : "Not Connected"}
              icon={<Mail className="w-5 h-5" />}
              actionLabel={integrations.gmail.connected ? "Connected" : connectingGmail ? "Opening..." : "Authorize Gmail"}
              actionDisabled={integrations.gmail.connected || connectingGmail}
              onAction={connectGmail}
              secondaryActionLabel={disconnectingProvider === "gmail" ? "Disconnecting..." : "Disconnect"}
              secondaryActionDisabled={!integrations.gmail.connected || disconnectingProvider === "gmail"}
              onSecondaryAction={() => { void disconnectIntegration("gmail"); }}
            />
            <IntegrationCard
              name="Outlook"
              description="Authorize Outlook and sync emails into Inbox."
              status={integrations.outlook.connected ? `Connected (${integrations.outlook.connectedEmail || "account"})` : "Not Connected"}
              icon={<Mail className="w-5 h-5" />}
              actionLabel="Coming Soon"
              actionDisabled
              secondaryActionLabel={disconnectingProvider === "outlook" ? "Disconnecting..." : "Disconnect"}
              secondaryActionDisabled={!integrations.outlook.connected || disconnectingProvider === "outlook"}
              onSecondaryAction={() => { void disconnectIntegration("outlook"); }}
            />
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your account and all related data. Continue to receive a one-time OTP on your email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingDeleteOtp}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendingDeleteOtp}
              onClick={(event) => {
                event.preventDefault();
                setConfirmDeleteOpen(false);
                void requestDeleteOtp();
              }}
            >
              {sendingDeleteOtp ? "Sending OTP..." : "Yes, Send OTP"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={otpModalOpen} onOpenChange={setOtpModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify OTP to Delete Account</DialogTitle>
            <DialogDescription>
              Enter the 6-digit OTP sent to your registered email. OTP expires in 10 minutes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-account-otp">OTP</Label>
            <Input
              id="delete-account-otp"
              inputMode="numeric"
              maxLength={6}
              value={deleteOtp}
              onChange={(event) => setDeleteOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { void requestDeleteOtp(); }} disabled={sendingDeleteOtp || deletingAccount}>
              {sendingDeleteOtp ? "Resending..." : "Resend OTP"}
            </Button>
            <Button variant="destructive" onClick={() => { void verifyOtpAndDelete(); }} disabled={deletingAccount}>
              {deletingAccount ? "Deleting..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function IntegrationCard({
  name,
  description,
  status,
  icon,
  actionLabel,
  actionDisabled,
  onAction,
  secondaryActionLabel,
  secondaryActionDisabled,
  onSecondaryAction,
}: {
  name: string;
  description: string;
  status: string;
  icon?: React.ReactNode;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionDisabled?: boolean;
  onSecondaryAction?: () => void;
}) {
  const isConnected = status.startsWith("Connected");

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isConnected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {icon || <Zap className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold">{name}</h3>
              <p className="text-xs text-muted-foreground">{status}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {secondaryActionLabel && (
              <Button variant="destructive" size="sm" disabled={secondaryActionDisabled} onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </Button>
            )}
            <Button variant={isConnected ? "outline" : "default"} size="sm" disabled={actionDisabled} onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
