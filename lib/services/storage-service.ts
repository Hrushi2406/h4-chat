import { storage } from "@/lib/clients/firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

interface UploadFileParams {
  file: File;
  userId: string;
  threadId?: string;
}

interface UploadFileResult {
  url: string;
  fileName: string;
  fileId: string;
  fileSize: number;
  fileType: string;
}

class StorageService {
  async uploadFile({
    file,
    userId,
    threadId,
  }: UploadFileParams): Promise<UploadFileResult> {
    const fileId = uuidv4();
    const fileName = `${fileId}_${file.name}`;
    const path = threadId
      ? `users/${userId}/threads/${threadId}/${fileName}`
      : `users/${userId}/files/${fileName}`;

    const storageRef = ref(storage, path);

    try {
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);

      return {
        url,
        fileName: file.name,
        fileId,
        fileSize: file.size,
        fileType: file.type,
      };
    } catch (error) {
      console.error("Error uploading file:", error);
      throw new Error("Failed to upload file");
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const storageRef = ref(storage, filePath);

    try {
      await deleteObject(storageRef);
    } catch (error) {
      console.error("Error deleting file:", error);
      throw new Error("Failed to delete file");
    }
  }

  validateImageFile(file: File): boolean {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Only JPEG, PNG, GIF, and WebP images are allowed");
    }

    if (file.size > maxSize) {
      throw new Error("File size must be less than 10MB");
    }

    return true;
  }
}

const storageService = new StorageService();
export default storageService;
