"use client";

import ChatLayout from "@/components/chat/chat-layout";
import { useAuthActions } from "@/lib/hooks/auth/use-auth-actions";
import { auth } from "@/lib/clients/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@/lib/brand-logos";
import { Loader2 } from "lucide-react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { signInWithGoogle } = useAuthActions();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [requiresSignIn, setRequiresSignIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setRequiresSignIn(!user || user.isAnonymous);
      setIsCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  if (isCheckingAuth) {
    return (
      <div className="h-mobile-viewport flex items-center justify-center bg-secondary">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (requiresSignIn) {
    return (
      <div className="h-mobile-viewport flex items-center justify-center bg-secondary p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Sign in required</CardTitle>
            <CardDescription>
              Please sign in with Google to access chat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => signInWithGoogle.mutate()}
              disabled={signInWithGoogle.isPending}
            >
              {signInWithGoogle.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <GoogleLogo className="h-5 w-5" />
              )}
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ChatLayout>{children}</ChatLayout>;
}
