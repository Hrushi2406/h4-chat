import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/clients/firebase";

export const useAuth = () => {
  const [uid, setUid] = useState<string>();
  const [isAnon, setIsAnon] = useState<boolean>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        setUid(user.uid);
        setIsAnon(false);
        localStorage.setItem("isAnon", "false");
      } else {
        if (user?.isAnonymous) {
          void signOut(auth);
        }

        setUid(undefined);
        localStorage.setItem("isAnon", "true");
        setIsAnon(true);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    uid,
    isAnon,
    isLoading,
  };
};
