import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/clients/firebase";

export const useAuth = () => {
  const [uid, setUid] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.isAnonymous) {
        setUid(undefined);
        setIsLoading(false);
        void signOut(auth);
        return;
      }

      setUid(user?.uid ?? undefined);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    uid,
    isLoading,
  };
};
