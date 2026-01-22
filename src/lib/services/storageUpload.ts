import { ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot } from 'firebase/storage';
import { storage } from '@/lib/firebase/client';

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number; // 0-100
}

export interface UploadResult {
  success: boolean;
  storagePath?: string;
  downloadUrl?: string;
  error?: string;
}

/**
 * Upload a file directly to Firebase Storage from the client
 * This bypasses serverless function size limits
 */
export async function uploadFileToStorage(
  file: File,
  storagePath: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve) => {
    try {
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            progress,
          });
        },
        (error) => {
          console.error('[StorageUpload] Upload error:', error);
          let errorMessage = 'Upload failed';
          if (error.code === 'storage/unauthorized') {
            errorMessage = 'Not authorized to upload. Please sign in.';
          } else if (error.code === 'storage/canceled') {
            errorMessage = 'Upload was canceled.';
          } else if (error.code === 'storage/unknown') {
            errorMessage = error.message || 'Unknown error occurred during upload.';
          }
          resolve({ success: false, error: errorMessage });
        },
        async () => {
          // Upload completed successfully
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[StorageUpload] Upload complete:', storagePath);
            resolve({
              success: true,
              storagePath,
              downloadUrl,
            });
          } catch (urlError) {
            // Upload succeeded but couldn't get URL (still successful)
            console.warn('[StorageUpload] Could not get download URL:', urlError);
            resolve({
              success: true,
              storagePath,
            });
          }
        }
      );
    } catch (error) {
      console.error('[StorageUpload] Failed to start upload:', error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start upload',
      });
    }
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
