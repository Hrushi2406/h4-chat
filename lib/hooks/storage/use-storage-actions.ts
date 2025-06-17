import { useMutation } from "@tanstack/react-query";
import storageService from "@/lib/services/storage-service";
import { toast } from "sonner";

interface UploadImageParams {
  file: File;
  userId: string;
  threadId?: string;
}

export const useStorageActions = () => {
  const uploadImage = useMutation({
    mutationFn: ({ file, userId, threadId }: UploadImageParams) => {
      // Validate image file before upload
      storageService.validateImageFile(file);
      return storageService.uploadFile({ file, userId, threadId });
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
    uploadImage,
    deleteFile,
  };
};
