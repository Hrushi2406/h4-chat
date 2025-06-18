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
} from "firebase/firestore";
import { auth, db } from "@/lib/clients/firebase";
import {
  Thread,
  ThreadMessage,
  generateDefaultThread,
} from "@/lib/types/thread";
import { v4 } from "uuid";
import { Attachment } from "ai";

const colThreads = "threads";

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
      threadData.messages = [messageWithTimestamp];
      threadData.messageCount = 1;
      threadData.lastMessagePreview = initialMessage.content.substring(0, 100);

      await setDoc(doc(db, colThreads, threadData.id), threadData);

      console.log("Thread created successfully:", { threadId: threadData.id });
      return threadData;
    } catch (error) {
      console.error("Failed to create thread:", error);
      throw error;
    }
  }

  // Get threads with options (limit to 20 max)
  async getThreads({ userId }: { userId: string }): Promise<Thread[]> {
    try {
      const q = query(
        collection(db, colThreads),
        where("userId", "==", userId),
        orderBy("updatedAt", "desc"),
        limit(20)
      );

      const querySnapshot = await getDocs(q);
      const threads: Thread[] = querySnapshot.docs.map(
        (doc) => doc.data() as Thread
      );

      console.log(`Retrieved ${threads.length} threads`);
      return threads;
    } catch (error) {
      console.error("Failed to fetch threads:", error);
      throw error;
    }
  }

  // Get a single thread by ID
  async getThread({
    threadId,
  }: {
    threadId: string;
  }): Promise<Thread | undefined> {
    try {
      console.log("Fetching thread: ", threadId);
      const uid = auth.currentUser?.uid;
      const docRef = doc(db, colThreads, threadId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return;
      }

      const data = docSnap.data() as Thread;

      if (data.userId !== uid) {
        console.warn("Unauthorized access to thread:", { threadId });
        window.location.href = "/";
        return;
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

      await updateDoc(docRef, updateFields);
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

      const updatedMessages = [...currentMessages, messageWithTimestamp];

      await updateDoc(docRef, {
        messages: updatedMessages,
        messageCount: updatedMessages.length,
        lastMessagePreview: messageData.content.substring(0, 100),
        updatedAt: new Date().toISOString(),
      });

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
      const q = query(
        collection(db, colThreads),
        where("shareId", "==", shareId)
      );
      const querySnapshot = await getDocs(q);
      const threads = querySnapshot.docs.map((doc) => doc.data() as Thread);

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
      await updateDoc(docRef, { shareId });
      return shareId;
    } catch (error) {
      console.error("Failed to share thread: ", { threadId }, error);
      throw error;
    }
  }
}

const threadService = new ThreadService();
export default threadService;
