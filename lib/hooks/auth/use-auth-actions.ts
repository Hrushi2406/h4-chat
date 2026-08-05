import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/clients/firebase";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import userService from "@/lib/services/user-service";
import { markWelcomeCreditsPending } from "@/lib/billing/welcome-credits-flag";

export const useAuthActions = () => {
  const queryClient = useQueryClient();

  const signOutUser = useMutation({
    mutationFn: () => signOut(auth),
    onSuccess: () => {
      queryClient.clear();
      toast.success("Signed out successfully");
    },
    onError: (error) => handleError(error, "Failed to sign out"),
  });

  const signInWithGoogle = useMutation({
    mutationFn: async () => {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);

      if (cred.user) {
        const isNewUser = await userService.syncAuthenticatedUser(
          cred.user.uid,
          cred.user,
        );
        if (isNewUser) markWelcomeCreditsPending(cred.user.uid);
      }

      return cred.user.uid;
    },
    onSuccess: (uid) => {
      void queryClient.invalidateQueries({ queryKey: ["users", uid] });
      toast.success("Signed in with Google successfully");
    },
    onError: (error) => handleError(error, "Failed to sign in with Google"),
  });

  const signInWithEmail = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );

      await userService.syncAuthenticatedUser(cred.user.uid, cred.user);
      return cred.user.uid;
    },
    onSuccess: (uid) => {
      void queryClient.invalidateQueries({ queryKey: ["users", uid] });
      toast.success("Signed in successfully");
    },
    onError: (error) => {
      console.error("Email sign-in failed:", error);

      const message =
        error instanceof FirebaseError &&
        [
          "auth/invalid-credential",
          "auth/invalid-email",
          "auth/user-disabled",
        ].includes(error.code)
          ? "The email or password is incorrect."
          : "Could not sign in. Please try again.";

      toast.error(message);
    },
  });

  return {
    signOutUser,
    signInWithGoogle,
    signInWithEmail,
  };
};
