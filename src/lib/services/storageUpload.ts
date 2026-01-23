export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number; // 0-100
}

export interface UploadResult {
  success: boolean;
  storagePath?: string;
  error?: string;
}

/**
 * Upload a file directly to a signed URL
 * This bypasses Firebase client SDK auth issues with custom GCS buckets
 */
export async function uploadFileToSignedUrl(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          bytesTransferred: event.loaded,
          totalBytes: event.total,
          progress: (event.loaded / event.total) * 100,
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('[StorageUpload] Upload complete');
        resolve({ success: true });
      } else {
        console.error('[StorageUpload] Upload failed:', xhr.status, xhr.statusText);
        resolve({ success: false, error: `Upload failed: ${xhr.status} ${xhr.statusText}` });
      }
    });

    xhr.addEventListener('error', () => {
      console.error('[StorageUpload] Upload error');
      resolve({ success: false, error: 'Network error during upload' });
    });

    xhr.addEventListener('abort', () => {
      resolve({ success: false, error: 'Upload was aborted' });
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Generate the storage path for an artefact
 */
export function getArtefactStoragePath(
  periodId: string,
  type: string,
  artefactId: string,
  filename: string
): string {
  return `artefacts/${periodId}/${type}/${artefactId}/${filename}`;
}
