import { useMutation } from "@tanstack/react-query";
import {
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/clients/firebase";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import userService from "@/lib/services/user-service";

export const useAuthActions = () => {
  const signInAnon = useMutation({
    mutationFn: async () => {
      const cred = await signInAnonymously(auth);
      await userService.createUserAnon(cred.user.uid);
    },
    onError: (error) => handleError(error, "Failed to sign in"),
  });

  const signOutUser = useMutation({
    mutationFn: () => signOut(auth),
    onSuccess: () => toast.success("Signed out successfully"),
    onError: (error) => handleError(error, "Failed to sign out"),
  });

  const signInWithGoogle = useMutation({
    mutationFn: async () => {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);

      if (cred.user) {
        localStorage.setItem("isAnon", "false");
        await userService.createUserGoogle(cred.user.uid, cred.user);
      }
    },
    onSuccess: () => {
      toast.success("Signed in with Google successfully");
    },
    onError: (error) => handleError(error, "Failed to sign in with Google"),
  });

  return {
    signInAnon,
    signOutUser,
    signInWithGoogle,
  };
};
