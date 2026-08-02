"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthActions } from "@/lib/hooks/auth/use-auth-actions";

export function EmailPasswordLoginForm() {
  const { signInWithEmail } = useAuthActions();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    signInWithEmail.mutate({ email, password });
  };

  return (
    <div className="mt-5 border-t pt-5">
      {!isOpen ? (
        <div className="text-center">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
            aria-controls="email-password-login-form"
            onClick={() => setIsOpen(true)}
          >
            Login using Email
          </Button>
        </div>
      ) : (
        <form
          id="email-password-login-form"
          className="mt-4 space-y-4"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={signInWithEmail.isPending}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={signInWithEmail.isPending}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={signInWithEmail.isPending || !email || !password}
          >
            {signInWithEmail.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {signInWithEmail.isPending ? "Logging in..." : "Login"}
          </Button>
        </form>
      )}
    </div>
  );
}
