import { useMutation } from "@tanstack/react-query";
import storageService from "@/lib/services/storage-service";
import { toast } from "sonner";

interface UploadFileParams {
  files: File[];
  userId: string;
  threadId?: string;
}

export const useStorageActions = () => {
  const uploadFiles = useMutation({
    mutationFn: async ({ files, userId, threadId }: UploadFileParams) => {
      // Validate and upload files in parallel
      const promises = files.map(async (file) => {
        storageService.validateFile(file);
        return storageService.uploadFile({ file, userId, threadId });
      });

      const results = await Promise.all(promises);
      return results;
    },
    onSuccess: (data) => {
      toast.success(data.length === 1 ? "File uploaded" : "Files uploaded");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload file");
    },
  });

  const deleteFile = useMutation({
    mutationFn: (filePath: string) => storageService.deleteFile(filePath),
    onSuccess: () => {
      toast.success("File deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  return {
    uploadFiles,
    uploadImages: uploadFiles,
    deleteFile,
  };
};
