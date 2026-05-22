import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { v4 } from "uuid";
import { auth, db } from "@/lib/clients/firebase";
import { generateWaitlistEntry } from "@/lib/types/waitlist";

const ensureFirebaseAuthUser = async () => {
  if (auth.currentUser) return;

  await new Promise<void>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve();
    });
  });

  if (!auth.currentUser) await signInAnonymously(auth);
};

class WaitlistService {
  async joinWaitlist(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) throw new Error("Email is required");

    await ensureFirebaseAuthUser();

    const existing = await getDocs(
      query(collection(db, "waitlist"), where("email", "==", normalizedEmail))
    );
    if (!existing.empty) return existing.docs[0].id;

    const id = v4();
    await setDoc(doc(db, `waitlist/${id}`), generateWaitlistEntry(id, normalizedEmail));
    return id;
  }
}

const waitlistService = new WaitlistService();
export default waitlistService;
