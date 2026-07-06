import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/clients/firebase";

export const useAuth = () => {
  const [uid, setUid] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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
