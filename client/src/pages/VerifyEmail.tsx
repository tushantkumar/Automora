import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Verifying your email...");

  const token = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get("token") ?? "";
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token. Please use the link from your email.");
      return;
    }

    const verify = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/verify-email?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(data.message ?? "Verification failed.");
          return;
        }

        if (data.token) {
          localStorage.setItem("authToken", data.token);
        }

        setStatus("success");
        setMessage("Email verified successfully. Redirecting to onboarding...");
        setTimeout(() => navigate("/onboarding"), 1200);
      } catch {
        setStatus("error");
        setMessage("Could not verify email. Please try again.");
      }
    };

    verify();
  }, [navigate, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === "error" ? (
            <Button onClick={() => navigate("/signup")} className="w-full">
              Back to signup
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
