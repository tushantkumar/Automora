import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { User, Shield, Zap, Mail, Trash2, CreditCard, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type ProfileState = {
  name: string;
  email: string;
  status: string;
  platformTier: string;
  subscriptionPlan: string;
  role: string;
  companyName: string;
};

type IntegrationState = {
  connected: boolean;
  connectedEmail: string | null;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  invitedDate: string;
  isDisabled?: boolean;
  invitationState?: string;
};

const initialProfile: ProfileState = {
  name: "",
  email: "",
  status: "Active",
  platformTier: "free",
  subscriptionPlan: "Starter",
  role: "Viewer",
  companyName: "",
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
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<ManagedUser | null>(null);
  const [deletingManagedUser, setDeletingManagedUser] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateTargetUser, setDeactivateTargetUser] = useState<ManagedUser | null>(null);
  const [deactivatingManagedUser, setDeactivatingManagedUser] = useState(false);
  const [loadingManagedUsers, setLoadingManagedUsers] = useState(false);
  const [invitingUser, setInvitingUser] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "Viewer" });
  const [userFilter, setUserFilter] = useState({ name: "", email: "", role: "all" });
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

  const loadProfile = async () => {
    if (!token) {
      setLoadingProfile(false);
      toast({ title: "You are not logged in." });
      return;
    }

    try {
      const meResponse = await fetch(`${AUTH_API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const meData = await meResponse.json();

      if (!meResponse.ok) {
        toast({ title: "Unable to load profile details.", description: meData?.message || "Please try again." });
        setLoadingProfile(false);
        return;
      }

      setProfile({
        name: String(meData?.user?.name || ""),
        email: String(meData?.user?.email || ""),
        status: String(meData?.user?.status || "Active"),
        platformTier: String(meData?.user?.platformTier || "free"),
        subscriptionPlan: String(meData?.user?.subscriptionPlan || "Starter"),
        role: String(meData?.user?.role || "Viewer"),
        companyName: String(meData?.user?.organizationName || ""),
      });
    } catch {
      toast({ title: "Unable to load profile details.", description: "Please try again." });
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadManagedUsers = async () => {
    if (!token || profile.role !== "Admin") {
      setManagedUsers([]);
      return;
    }

    setLoadingManagedUsers(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to load users", description: data?.message || "Please try again." });
        return;
      }
      setManagedUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      toast({ title: "Unable to load users", description: "Please try again." });
    } finally {
      setLoadingManagedUsers(false);
    }
  };

  useEffect(() => {
    void loadProfile();
    void loadIntegrations();
  }, [token]);

  useEffect(() => {
    if (profile.role === "Admin") {
      void loadManagedUsers();
    }
  }, [profile.role, token]);

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

  const inviteUser = async () => {
    if (!token) return;
    const payload = {
      name: inviteForm.name.trim(),
      email: inviteForm.email.trim(),
      role: inviteForm.role,
    };
    if (!payload.name || !payload.email || !payload.role) {
      toast({ title: "Name, email and role are required." });
      return;
    }

    setInvitingUser(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/admin/users/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to invite user", description: data?.message || "Please try again." });
        return;
      }
      toast({ title: "Invite sent successfully." });
      setInviteForm({ name: "", email: "", role: "Viewer" });
      void loadManagedUsers();
    } catch {
      toast({ title: "Unable to invite user", description: "Please try again." });
    } finally {
      setInvitingUser(false);
    }
  };

  const resendInvite = async (email: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${AUTH_API_URL}/admin/users/${encodeURIComponent(email)}/resend-invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to resend invite", description: data?.message || "Please try again." });
        return;
      }
      toast({ title: "Invite resent." });
      void loadManagedUsers();
    } catch {
      toast({ title: "Unable to resend invite", description: "Please try again." });
    }
  };

  const changeUserRole = async (userId: string, role: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${AUTH_API_URL}/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to change role", description: data?.message || "Please try again." });
        return;
      }
      void loadManagedUsers();
    } catch {
      toast({ title: "Unable to change role", description: "Please try again." });
    }
  };

  const requestDeactivateUser = (user: ManagedUser) => {
    setDeactivateTargetUser(user);
    setDeactivateDialogOpen(true);
  };

  const disableUser = async (userId: string, disabled: boolean) => {
    if (!token) return;

    if (disabled) {
      setDeactivatingManagedUser(true);
    }

    try {
      const response = await fetch(`${AUTH_API_URL}/admin/users/${userId}/disable`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ disabled }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to update user", description: data?.message || "Please try again." });
        return;
      }

      if (disabled) {
        toast({ title: "User deactivated." });
        setDeactivateDialogOpen(false);
        setDeactivateTargetUser(null);
      }

      void loadManagedUsers();
    } catch {
      toast({ title: "Unable to update user", description: "Please try again." });
    } finally {
      if (disabled) {
        setDeactivatingManagedUser(false);
      }
    }
  };




  const requestDeleteUser = (user: ManagedUser) => {
    setDeleteTargetUser(user);
    setDeleteUserDialogOpen(true);
  };

  const deleteUser = async () => {
    if (!token || !deleteTargetUser) return;

    setDeletingManagedUser(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/admin/users/${deleteTargetUser.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "Unable to delete user", description: data?.message || "Please try again." });
        return;
      }
      toast({ title: "User deleted." });
      setDeleteUserDialogOpen(false);
      setDeleteTargetUser(null);
      void loadManagedUsers();
    } catch {
      toast({ title: "Unable to delete user", description: "Please try again." });
    } finally {
      setDeletingManagedUser(false);
    }
  };


  const filteredManagedUsers = useMemo(() => managedUsers.filter((user) => {
    const nameOk = userFilter.name.trim() ? user.name.toLowerCase().includes(userFilter.name.trim().toLowerCase()) : true;
    const emailOk = userFilter.email.trim() ? user.email.toLowerCase().includes(userFilter.email.trim().toLowerCase()) : true;
    const roleOk = userFilter.role === "all" ? true : user.role === userFilter.role;
    return nameOk && emailOk && roleOk;
  }), [managedUsers, userFilter]);
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and platform preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-2"><User className="w-4 h-4" /> Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="w-4 h-4" /> Security</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2"><Zap className="w-4 h-4" /> Integrations</TabsTrigger>
          <TabsTrigger value="user-management" className="gap-2"><Users className="w-4 h-4" /> User Management</TabsTrigger>
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
                <Label htmlFor="company-name">Company Name</Label>
                <Input id="company-name" value={profile.companyName || "-"} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={profile.role} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Input id="status" value={profile.status} readOnly disabled={loadingProfile} />
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
              <CardDescription>
                {profile.role === "Admin"
                  ? "Delete account requires OTP verification sent to your registered email."
                  : "Only workspace admin can delete accounts."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile.role === "Admin" ? (
                <Button variant="destructive" className="gap-2" onClick={() => setConfirmDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4" /> Delete Account
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Please contact your admin for account deletion.</p>
              )}
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

        <TabsContent value="user-management" className="space-y-6">
          {profile.role !== "Admin" ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">You don't have access to user management.</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Invite User</CardTitle>
                  <CardDescription>Send an account activation link that expires in 24 hours.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input placeholder="Name" value={inviteForm.name} onChange={(event) => setInviteForm((prev) => ({ ...prev, name: event.target.value }))} />
                  <Input placeholder="Email" type="email" value={inviteForm.email} onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))} />
                  <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={inviteForm.role} onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))}>
                    <option value="Viewer">Viewer</option>
                    <option value="Editor">Editor</option>
                    <option value="Author">Author</option>
                  </select>
                  <Button onClick={() => { void inviteUser(); }} disabled={invitingUser}>{invitingUser ? "Sending..." : "Send Invite"}</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Name, email, role, status, invited date and actions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input placeholder="Filter by name" value={userFilter.name} onChange={(event) => setUserFilter((prev) => ({ ...prev, name: event.target.value }))} />
                    <Input placeholder="Filter by email" value={userFilter.email} onChange={(event) => setUserFilter((prev) => ({ ...prev, email: event.target.value }))} />
                    <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={userFilter.role} onChange={(event) => setUserFilter((prev) => ({ ...prev, role: event.target.value }))}>
                      <option value="all">All Roles</option>
                      <option value="Viewer">Viewer</option>
                      <option value="Editor">Editor</option>
                      <option value="Author">Author</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>

                  {loadingManagedUsers ? (
                    <p className="text-sm text-muted-foreground">Loading users...</p>
                  ) : filteredManagedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users found for selected filters.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Invited Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredManagedUsers.map((user) => (
                          <TableRow key={`${user.id}-${user.email}`}>
                            <TableCell>{user.name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              {user.status !== "Pending" && user.status !== "Expired" && user.role !== "Admin" ? (
                                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={user.role} onChange={(event) => { void changeUserRole(user.id, event.target.value); }}>
                                  <option value="Viewer">Viewer</option>
                                  <option value="Editor">Editor</option>
                                  <option value="Author">Author</option>
                                </select>
                              ) : user.role}
                            </TableCell>
                            <TableCell>{user.status}</TableCell>
                            <TableCell>{new Date(user.invitedDate).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              {user.status === "Pending" || user.status === "Expired" ? (
                                <Button variant="outline" size="sm" onClick={() => { void resendInvite(user.email); }}>Resend Invite</Button>
                              ) : user.role === "Admin" ? (
                                <span className="text-xs text-muted-foreground">Workspace Admin</span>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant={user.isDisabled ? "default" : "destructive"}
                                    size="sm"
                                    onClick={() => {
                                      if (user.isDisabled) {
                                        void disableUser(user.id, false);
                                        return;
                                      }
                                      requestDeactivateUser(user);
                                    }}
                                  >
                                    {user.isDisabled ? "Enable User" : "Deactivate"}
                                  </Button>
                                  <Button variant="destructive" size="sm" onClick={() => requestDeleteUser(user)}>Delete</Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={deactivateDialogOpen}
        onOpenChange={(open) => {
          setDeactivateDialogOpen(open);
          if (!open && !deactivatingManagedUser) setDeactivateTargetUser(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user account?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will immediately block ${deactivateTargetUser?.name || "this user"} (${deactivateTargetUser?.email || ""}) from accessing the application until re-enabled.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivatingManagedUser}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivatingManagedUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (!deactivateTargetUser) return;
                void disableUser(deactivateTargetUser.id, true);
              }}
            >
              {deactivatingManagedUser ? "Deactivating..." : "Deactivate User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteUserDialogOpen}
        onOpenChange={(open) => {
          setDeleteUserDialogOpen(open);
          if (!open && !deletingManagedUser) setDeleteTargetUser(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will permanently delete ${deleteTargetUser?.name || "this user"} (${deleteTargetUser?.email || ""}). This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingManagedUser}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingManagedUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteUser();
              }}
            >
              {deletingManagedUser ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
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
