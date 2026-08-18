/**
 * One registry of uploaded file URLs shared by every channel, so a WhatsApp
 * conversation addresses uploads exactly the way web chat does: the URLs live
 * in the messages sent to the model, not only in the stored thread.
 */
export interface UploadedFileRef {
  url: string;
  filename?: string;
  mediaType?: string;
}

export const formatFileUrl = (
  filePart: { filename?: unknown; mediaType?: unknown; url?: unknown },
  fallbackName: string,
) => {
  const filename =
    typeof filePart.filename === "string" ? filePart.filename : fallbackName;
  const mediaType =
    typeof filePart.mediaType === "string" ? ` (${filePart.mediaType})` : "";
  const url =
    typeof filePart.url === "string"
      ? filePart.url
      : "No accessible file URL was provided.";

  return `- ${filename}${mediaType}: ${url}`;
};

/**
 * Build the "Uploaded file URLs available in this thread" block appended to the
 * newest message so it survives the context slice and stays available to tools
 * on later turns. Returns undefined when the thread has no uploads.
 */
export const buildFileUrlContext = (files: readonly UploadedFileRef[]) => {
  const fileUrls = new Map<string, string>();
  const imageUrls = new Map<string, string>();

  for (const file of files) {
    if (typeof file?.url !== "string" || !file.url) continue;
    fileUrls.set(file.url, formatFileUrl(file, "uploaded file"));
    if (file.mediaType?.startsWith("image/")) {
      imageUrls.set(file.url, formatFileUrl(file, "uploaded image"));
    }
  }

  const sections: string[] = [];

  if (fileUrls.size > 0) {
    // Keep every uploaded file addressable by tools, including file types the
    // selected model can consume directly as native file parts.
    sections.push(
      `Uploaded file URLs available in this thread:\n${[...fileUrls.values()].join("\n")}`,
    );
  }

  if (imageUrls.size > 0) {
    sections.push(
      `Image URLs available in this thread:\n${[...imageUrls.values()].join("\n")}`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : undefined;
};
