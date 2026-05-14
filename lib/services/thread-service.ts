import {
  onAuthStateChanged,
  signInAnonymously,
} from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  where,
  setDoc,
  startAfter,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "@/lib/clients/firebase";
import {
  Thread,
  ThreadMessage,
  generateDefaultThread,
  getMessageContent,
  normalizeThreadMessage,
  serializeThreadMessageForFirestore,
} from "@/lib/types/thread";
import { v4 } from "uuid";

const colThreads = "threads";
export type ThreadCursor = QueryDocumentSnapshot<DocumentData>;

export interface ThreadsPage {
  threads: Thread[];
  nextCursor: ThreadCursor | null;
}

const normalizeThreadData = (thread: Thread): Thread => ({
  ...thread,
  messages: (thread.messages ?? []).map(normalizeThreadMessage),
});

const ensureFirebaseAuthUser = async () => {
  if (auth.currentUser) {
    return;
  }

  await new Promise<void>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve();
    });
  });

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
};

const removeUndefinedValues = <T>(value: T): T => {
  if (value === undefined) {
    return undefined as T;
  }

  if (value === null || value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedValues(item)) as T;
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)])
    ) as T;
  }

  return value;
};

class ThreadService {
  // Create a new thread
  async createThread({
    threadId,
    title,
    initialMessage,
    userId,
  }: {
    threadId: string;
    title: string;
    initialMessage: ThreadMessage;
    userId?: string;
  }): Promise<Thread> {
    try {
      console.log("Creating new thread:", { title, userId });

      const defaultThread = generateDefaultThread(userId);

      const threadData = {
        ...defaultThread,
        id: threadId,
        title: title,
        isPinned: false,
      };

      // Add initial message
      const messageWithTimestamp: ThreadMessage = {
        ...initialMessage,
        updatedAt: new Date().toISOString(),
      };
      threadData.messages = [
        serializeThreadMessageForFirestore(messageWithTimestamp),
      ];
      threadData.messageCount = 1;
      threadData.lastMessagePreview = getMessageContent(
        initialMessage
      ).substring(0, 100);

      await setDoc(
        doc(db, colThreads, threadData.id),
        removeUndefinedValues(threadData)
      );

      console.log("Thread created successfully:", { threadId: threadData.id });
      return threadData;
    } catch (error) {
      console.error("Failed to create thread:", error);
      throw error;
    }
  }

  // Get threads with pagination
  async getThreads({
    userId,
    cursor,
    pageSize = 20,
  }: {
    userId: string;
    cursor?: ThreadCursor | null;
    pageSize?: number;
  }): Promise<ThreadsPage> {
    try {
      const constraints: QueryConstraint[] = [
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
      ];

      if (cursor) {
        constraints.push(startAfter(cursor));
      }

      constraints.push(limit(pageSize));

      const q = query(
        collection(db, colThreads),
        ...constraints
      );

      const querySnapshot = await getDocs(q);
      const threads: Thread[] = querySnapshot.docs.map((doc) =>
        normalizeThreadData(doc.data() as Thread)
      );
      const nextCursor =
        querySnapshot.docs.length === pageSize
          ? querySnapshot.docs[querySnapshot.docs.length - 1]
          : null;

      console.log(`Retrieved ${threads.length} threads`);
      return { threads, nextCursor };
    } catch (error) {
      console.error("Failed to fetch threads:", error);
      throw error;
    }
  }

  // Get a single thread by ID
  async getThread({
    threadId,
    userId,
  }: {
    threadId: string;
    userId?: string;
  }): Promise<Thread | null> {
    try {
      console.log("Fetching thread: ", threadId);
      const uid = userId ?? auth.currentUser?.uid;
      const docRef = doc(db, colThreads, threadId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.warn("Thread not found:", { threadId });
        return null;
      }

      const data = normalizeThreadData(docSnap.data() as Thread);

      if (data.userId !== uid) {
        console.warn("Unauthorized access to thread:", { threadId });
        window.location.href = "/";
        return null;
      }

      console.log("Thread retrieved successfully:", { threadId });
      return data;
    } catch (error) {
      console.error("Failed to get thread:", { threadId }, error);
      throw error;
    }
  }

  // Update a thread
  async updateThread({
    threadId,
    title,
  }: {
    threadId: string;
    title: string;
  }): Promise<void> {
    try {
      console.log("Updating thread:", { threadId, title });

      const docRef = doc(db, colThreads, threadId);

      const updateFields = {
        title: title,
      };

      await updateDoc(docRef, removeUndefinedValues(updateFields));
      console.log("Thread updated successfully:", { threadId });
    } catch (error) {
      console.error("Failed to update thread:", { threadId }, error);
      throw error;
    }
  }

  // Delete a thread
  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    try {
      console.log("Deleting thread:", { threadId });

      const docRef = doc(db, colThreads, threadId);
      await deleteDoc(docRef);

      console.log("Thread deleted successfully:", { threadId });
    } catch (error) {
      console.error("Failed to delete thread:", { threadId }, error);
      throw error;
    }
  }

  // Add message to thread
  async addMessageToThread({
    threadId,
    messageData,
  }: {
    threadId: string;
    messageData: ThreadMessage;
  }): Promise<void> {
    try {
      console.log("Adding message to thread:", {
        threadId,
        role: messageData.role,
      });

      const docRef = doc(db, colThreads, threadId);
      const threadDoc = await getDoc(docRef);

      if (!threadDoc.exists()) {
        console.error("Thread not found when adding message:", { threadId });
        throw new Error("Thread not found");
      }

      const threadData = threadDoc.data() as Thread;
      const currentMessages = threadData.messages || [];

      const messageWithTimestamp: ThreadMessage = {
        ...messageData,
        id: v4(),
        updatedAt: new Date().toISOString(),
      };

      const updatedMessages = [
        ...currentMessages.map(serializeThreadMessageForFirestore),
        serializeThreadMessageForFirestore(messageWithTimestamp),
      ];

      await updateDoc(
        docRef,
        removeUndefinedValues({
          messages: updatedMessages,
          messageCount: updatedMessages.length,
          lastMessagePreview: getMessageContent(messageData).substring(0, 100),
          updatedAt: new Date().toISOString(),
        })
      );

      console.log("Message added successfully:", {
        threadId,
        messageCount: updatedMessages.length,
      });
    } catch (error) {
      console.error("Failed to add message to thread:", { threadId }, error);
      throw error;
    }
  }

  async getSharedThread({ shareId }: { shareId: string }): Promise<Thread> {
    try {
      await ensureFirebaseAuthUser();

      const q = query(
        collection(db, colThreads),
        where("shareId", "==", shareId)
      );
      const querySnapshot = await getDocs(q);
      const threads = querySnapshot.docs.map((doc) =>
        normalizeThreadData(doc.data() as Thread)
      );

      if (threads.length === 0) throw new Error("Thread not found");
      return threads[0];
    } catch (error) {
      console.error("Failed to get shared thread: ", { shareId }, error);
      throw error;
    }
  }

  async shareThread({ threadId }: { threadId: string }): Promise<string> {
    try {
      const shareId = v4();
      const docRef = doc(db, colThreads, threadId);
      await updateDoc(docRef, removeUndefinedValues({ shareId }));
      return shareId;
    } catch (error) {
      console.error("Failed to share thread: ", { threadId }, error);
      throw error;
    }
  }
}

const threadService = new ThreadService();
export default threadService;
