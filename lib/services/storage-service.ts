import { storage } from "@/lib/clients/firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

export const ALLOWED_FILE_TYPES = {
  "image/jpeg": [".jpeg", ".jpg"],
  "image/jpg": [".jpg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/csv": [".csv"],
  "application/csv": [".csv"],
  "text/comma-separated-values": [".csv"],
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/vnd.oasis.opendocument.presentation": [".odp"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "application/zip": [".zip"],
} as const;

export const MAX_UPLOAD_FILE_SIZE = 25 * 1024 * 1024;

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

  validateFile(file: File): boolean {
    const allowedTypes = Object.keys(ALLOWED_FILE_TYPES);
    const allowedExtensions: readonly string[] =
      Object.values(ALLOWED_FILE_TYPES).flat();
    const extension = getFileExtension(file.name);
    const hasAllowedMimeType = allowedTypes.includes(file.type);
    const hasAllowedExtension = allowedExtensions.includes(extension);

    if (!hasAllowedMimeType && !hasAllowedExtension) {
      throw new Error(
        "Only images, PDFs, spreadsheets, documents, text files, JSON, and ZIP files are allowed"
      );
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      throw new Error("File size must be less than 25MB");
    }

    return true;
  }

  validateImageFile(file: File): boolean {
    return this.validateFile(file);
  }
}

const getFileExtension = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return fileName.slice(dotIndex).toLowerCase();
};

const storageService = new StorageService();
export default storageService;
