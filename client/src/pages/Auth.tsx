import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:4000";

type AuthResponse = {
  message?: string;
  token?: string;
};

export default function Auth() {
  const [location, navigate] = useLocation();
  const isLogin = location === "/login";
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();

    const payload = isLogin
      ? { email, password }
      : {
          name: [firstName, lastName].filter(Boolean).join(" "),
          email,
          password,
        };

    const endpoint = isLogin ? "/login" : "/signup";

    try {
      const response = await fetch(`${AUTH_API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: AuthResponse = await response.json();

      if (!response.ok) {
        toast({ title: data.message || "Something went wrong. Please try again." });
        return;
      }

      if (data.token) {
        localStorage.setItem("authToken", data.token);
      }

      if (!isLogin) {
        toast({ title: data.message || "Signup successful. Please verify your email." });
        return;
      }

      toast({ title: data.message || "Login successful" });
      navigate("/dashboard");
    } catch {
      toast({ title: "Unable to reach auth server. Please make sure it is running." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-8 animate-in-fade">
        <div className="text-center">
          <div className="inline-flex w-12 h-12 rounded-xl bg-primary items-center justify-center text-primary-foreground font-bold font-heading text-2xl mb-4 shadow-lg shadow-primary/20 mx-auto">
            A
          </div>
          <h2 className="text-3xl font-bold font-heading tracking-tight">
            {isLogin ? "Welcome back" : "Create an account"}
          </h2>
          <p className="text-muted-foreground mt-2">
            {isLogin ? "Enter your details to access your dashboard" : "Get started with AI automation today"}
          </p>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">{isLogin ? "Log in" : "Sign up"}</CardTitle>
            <CardDescription>
              {isLogin ? "Login with your email and password" : "Enter your info to create your account"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form onSubmit={handleSubmit} className="grid gap-4">
              {!isLogin && (
                <div className="grid gap-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="firstName" name="firstName" type="text" placeholder="John" className="pl-10" required />
                  </div>
                </div>
              )}

              {!isLogin && (
                <div className="grid gap-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="lastName" name="lastName" type="text" placeholder="Doe" className="pl-10" required />
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" name="email" type="email" placeholder="name@example.com" className="pl-10" required />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" name="password" type="password" className="pl-10" required minLength={8} />
                </div>
              </div>

              {isLogin && (
                <div className="text-right -mt-1">
                  <Link href="/forgot-password">
                    <a className="text-sm text-primary hover:underline">Forgot password?</a>
                  </Link>
                </div>
              )}
              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <p className="text-center text-sm text-muted-foreground w-full">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <Link href={isLogin ? "/signup" : "/login"}>
                <a className="text-primary font-medium hover:underline">{isLogin ? "Sign up" : "Log in"}</a>
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
