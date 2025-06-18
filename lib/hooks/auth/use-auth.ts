import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/clients/firebase";
import { useAuthActions } from "./use-auth-actions";
import { useQuery } from "@tanstack/react-query";
import userService from "@/lib/services/user-service";

export const useAuth = () => {
  const { signInAnon } = useAuthActions();
  const [uid, setUid] = useState<string>();
  const [isAnon, setIsAnon] = useState<boolean>();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
      } else {
        signInAnon.mutate();
        localStorage.setItem("isAnon", "true");
        setUid(undefined);
        setIsAnon(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const isAnon = (localStorage.getItem("isAnon") ?? "true") === "true";
    setIsAnon(isAnon);
  }, [isAnon, uid]);

  return {
    uid,
    isAnon,
  };
};
