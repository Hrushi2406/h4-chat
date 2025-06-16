"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthActions } from "@/lib/hooks/auth/use-auth-actions";
import { GoogleLogo } from "@/lib/brand-logos";
import { useState } from "react";
import Modal from "@/components/ui/modal";
import { XIcon } from "lucide-react";

export default function AuthDialog() {
  const { signInWithGoogle } = useAuthActions();
  const [isOpen, setIsOpen] = useState(true);

  const handleGoogleSignIn = () => {
    signInWithGoogle.mutate();
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      closeModal={closeModal}
      clickOutsideToClose={true}
      size="md"
    >
      <Card className="w-full bg-transparent shadow-none">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Sign In</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeModal}
              className="h-8 w-8"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>Continue with your Google account</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full flex items-center gap-2"
            onClick={handleGoogleSignIn}
            disabled={signInWithGoogle.isPending}
          >
            <GoogleLogo className="w-5 h-5" />
            {signInWithGoogle.isPending
              ? "Signing in..."
              : "Sign in with Google"}
          </Button>
        </CardContent>
      </Card>
    </Modal>
  );
}
