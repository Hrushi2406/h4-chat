import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { v4 } from "uuid";
import { db } from "../clients/firebase";
import {
  generateDefaultUser,
  IMemory,
  IUser,
  MAX_MEMORY_CONTENT_LENGTH,
  MAX_USER_MEMORIES,
} from "../types/user";
import { User } from "firebase/auth";

class UserService {
  async getUserInfo(email: string) {
    const userRef = doc(db, `users/${email}`);
    const snap = await getDoc(userRef);

    return snap.data() as IUser;
  }

  async createUserGoogle(uid: string, fbUser: User) {
    const userRef = doc(db, `users/${uid}`);
    const user = generateDefaultUser(uid);
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

  async updateUser({ uid, update }: { uid: string; update: Partial<IUser> }) {
    const userRef = doc(db, `users/${uid}`);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data() as IUser;
    const updated = {
      ...userData,
      ...update,
    };
    await updateDoc(userRef, updated);
  }

  async addMemory({
    uid,
    content,
    id,
  }: {
    uid: string;
    content: string;
    id?: string;
  }) {
    const userRef = doc(db, `users/${uid}`);

    await runTransaction(db, async (tx) => {
      const userDoc = await tx.get(userRef);
      const userData = userDoc.data() as IUser;
      const memories = userData.memories ?? [];

      if (memories.length >= MAX_USER_MEMORIES) {
        throw new Error("Memory limit reached. Delete an existing memory first.");
      }

      const memory: IMemory = {
        id: id ?? v4(),
        content: content.slice(0, MAX_MEMORY_CONTENT_LENGTH),
        updatedAt: new Date().toISOString(),
      };

      tx.update(userRef, { memories: [...memories, memory] });
    });
  }

  async updateMemory({
    uid,
    memoryId,
    content,
  }: {
    uid: string;
    memoryId: string;
    content: string;
  }) {
    const userRef = doc(db, `users/${uid}`);

    await runTransaction(db, async (tx) => {
      const userDoc = await tx.get(userRef);
      const userData = userDoc.data() as IUser;
      const memories = (userData.memories ?? []).map((memory) =>
        memory.id === memoryId
          ? {
              ...memory,
              content: content.slice(0, MAX_MEMORY_CONTENT_LENGTH),
              updatedAt: new Date().toISOString(),
            }
          : memory,
      );

      tx.update(userRef, { memories });
    });
  }

  async deleteMemory({ uid, memoryId }: { uid: string; memoryId: string }) {
    const userRef = doc(db, `users/${uid}`);

    await runTransaction(db, async (tx) => {
      const userDoc = await tx.get(userRef);
      const userData = userDoc.data() as IUser;
      const memories = (userData.memories ?? []).filter(
        (memory) => memory.id !== memoryId,
      );

      tx.update(userRef, { memories });
    });
  }
}

const userService = new UserService();
export default userService;
