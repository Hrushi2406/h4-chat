import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { v4 } from "uuid";
import { db } from "@/lib/clients/firebase";
import { generateWaitlistEntry } from "@/lib/types/waitlist";

class WaitlistService {
  async joinWaitlist(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) throw new Error("Email is required");

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
