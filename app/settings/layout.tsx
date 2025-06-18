"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/hooks/auth/use-auth";
import { useAuthActions } from "@/lib/hooks/auth/use-auth-actions";
import { GoogleLogo } from "@/lib/brand-logos";
import { Loader2 } from "lucide-react";

const SettingsLayout = ({ children }: { children: React.ReactNode }) => {
  const { uid, isAnon } = useAuth();

  if (isAnon) {
    return (
      <div className="h-screen bg-secondary flex items-center justify-center">
        <AuthContainer />
      </div>
    );
  }

  return (
    <SidebarInset>
      <div className="flex flex-col gap-4 bg-secondary min-h-screen">
        {children}
      </div>
    </SidebarInset>
  );
};

export default SettingsLayout;

const AuthContainer = () => {
  const { signInWithGoogle } = useAuthActions();

  const handleGoogleSignIn = () => {
    signInWithGoogle.mutate();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          Welcome to Saaki Chat
        </CardTitle>
        <CardDescription>
          Sign In to access settings (we'll increase your limits)
        </CardDescription>
      </CardHeader>
      <CardContent className="">
        <Button
          variant="outline"
          className="w-full flex items-center gap-2"
          onClick={handleGoogleSignIn}
          disabled={signInWithGoogle.isPending}
        >
          {signInWithGoogle.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <GoogleLogo className="w-5 h-5" />
            </>
          )}
          Sign in with Google
        </Button>
      </CardContent>

      <CardFooter className="mx-auto">
        <p className="text-xs text-muted-foreground text-center">
          By signing in, you accept our{" "}
          <a href="/terms" className="underline hover:text-primary">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline hover:text-primary">
            Privacy Policy
          </a>
        </p>
      </CardFooter>
    </Card>
  );
};
