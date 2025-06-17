import { useMutation } from "@tanstack/react-query";
import storageService from "@/lib/services/storage-service";
import { toast } from "sonner";

interface UploadImageParams {
  files: File[];
  userId: string;
  threadId?: string;
}

export const useStorageActions = () => {
  const uploadImages = useMutation({
    mutationFn: async ({ files, userId, threadId }: UploadImageParams) => {
      // Validate and upload files in parallel
      const promises = files.map(async (file) => {
        storageService.validateImageFile(file);
        return storageService.uploadFile({ file, userId, threadId });
      });

      const results = await Promise.all(promises);
      return results;
    },
    onSuccess: (data) => {
      toast.success("Image uploaded successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload image");
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
    uploadImages,
    deleteFile,
  };
};
