import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

export default function ActivateAccount() {
  const [, navigate] = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") || "";

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        const response = await fetch(`${AUTH_API_URL}/invites/validate?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        if (!response.ok) {
          toast({ title: data?.message || "Invalid activation link" });
          setIsValidating(false);
          return;
        }

        setInviteEmail(String(data?.invite?.email || ""));
        setInviteName(String(data?.invite?.name || ""));
        setIsValidToken(true);
      } catch {
        toast({ title: "Unable to validate invite link" });
      } finally {
        setIsValidating(false);
      }
    };

    void validate();
  }, [token]);

  const activateAccount = async () => {
    if (!token) return;

    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters." });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${AUTH_API_URL}/invites/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast({ title: data?.message || "Unable to activate account" });
        return;
      }

      if (data?.token) {
        localStorage.setItem("authToken", data.token);
      }

      toast({ title: "Account activated successfully." });
      navigate(String(data?.redirectTo || "/dashboard"));
    } catch {
      toast({ title: "Unable to activate account" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Activate your account</CardTitle>
          <CardDescription>Set your password to complete account activation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isValidating ? (
            <p className="text-sm text-muted-foreground">Validating invitation link...</p>
          ) : !isValidToken ? (
            <p className="text-sm text-destructive">Invalid or expired invitation link.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={inviteName} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={inviteEmail} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} />
              </div>
              <Button className="w-full" onClick={() => { void activateAccount(); }} disabled={isSubmitting}>
                {isSubmitting ? "Activating..." : "Activate Account"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
