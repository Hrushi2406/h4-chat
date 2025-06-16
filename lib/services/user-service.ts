import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../clients/firebase";
import { generateDefaultUser } from "../types/user";
import threadService from "./thread-service";
import { User } from "firebase/auth";

class UserService {
  async getUserInfo(email: string) {
    const userRef = doc(db, `users/${email}`);
    const snap = await getDoc(userRef);

    return snap.data();
  }

  async createUserAnon(uid: string) {
    const userRef = doc(db, `users/${uid}`);
    const user = generateDefaultUser(uid, true);
    await setDoc(userRef, user);
  }

  async createUserGoogle(uid: string, fbUser: User) {
    const userRef = doc(db, `users/${uid}`);
    const user = generateDefaultUser(uid, false);
    const updated = {
      ...user,
      email: fbUser.email ?? "",
      name: fbUser.displayName ?? "",
      avatar: fbUser.photoURL ?? "",
    };
    await setDoc(userRef, updated, { merge: true });
  }

  //   async migrateUserFromAnon(uid: string, email: string) {
  //     const threads = await threadService.getThreads({ userId: uid });
  //   }
}

const userService = new UserService();
export default userService;
