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

    return snap.exists() ? (snap.data() as IUser) : null;
  }

  /** Returns true when this call created a brand-new user doc (first-ever sign-in). */
  async syncAuthenticatedUser(uid: string, fbUser: User): Promise<boolean> {
    const userRef = doc(db, `users/${uid}`);
    const snap = await getDoc(userRef);

    // Existing users: only refresh auth profile fields, never wipe prefs/memories.
    if (snap.exists()) {
      await updateDoc(userRef, {
        email: fbUser.email ?? "",
        name: fbUser.displayName ?? snap.data()?.name ?? "",
        avatar: fbUser.photoURL ?? snap.data()?.avatar ?? "",
        updatedAt: new Date().toISOString(),
      });
      return false;
    }

    await setDoc(userRef, {
      ...generateDefaultUser(uid),
      email: fbUser.email ?? "",
      name: fbUser.displayName ?? "",
      avatar: fbUser.photoURL ?? "",
    });
    return true;
  }

  //   async migrateUserFromAnon(uid: string, email: string) {
  //     const threads = await threadService.getThreads({ userId: uid });
  //   }

  async updateUser({ uid, update }: { uid: string; update: Partial<IUser> }) {
    const userRef = doc(db, `users/${uid}`);
    // Billing and provider identifiers are server-owned. Keep this client
    // mutation intentionally limited to editable profile fields.
    const editableUpdate = {
      ...(typeof update.name === "string" ? { name: update.name } : {}),
      ...(typeof update.occupation === "string"
        ? { occupation: update.occupation }
        : {}),
      ...(typeof update.userPreferences === "string"
        ? { userPreferences: update.userPreferences }
        : {}),
      ...(typeof update.memoryEnabled === "boolean"
        ? { memoryEnabled: update.memoryEnabled }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(userRef, editableUpdate);
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
