'use server';

import { getAdminFirestore, getAdminStorage, COLLECTIONS, STORAGE_PATHS } from '@/lib/firebase/admin';
import { Artefact, ArtefactType, ArtefactVisibility } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

export async function getArtefactsByPeriod(periodId: string): Promise<Artefact[]> {
  const db = getAdminFirestore();

  const snapshot = await db
    .collection(COLLECTIONS.ARTEFACTS)
    .where('periodId', '==', periodId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      periodId: data.periodId,
      type: data.type as ArtefactType,
      filename: data.filename,
      storagePath: data.storagePath,
      uploadedBy: data.uploadedBy,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      versionInt: data.versionInt ?? 1,
      tags: data.tags ?? [],
      parsedText: data.parsedText ?? null,
      parsedPages: data.parsedPages ?? null,
      visibility: data.visibility ?? 'normal',
      parseError: data.parseError ?? null,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
    };
  });
}

export async function getArtefactsByType(
  periodId: string,
  type: ArtefactType
): Promise<Artefact[]> {
  const db = getAdminFirestore();

  const snapshot = await db
    .collection(COLLECTIONS.ARTEFACTS)
    .where('periodId', '==', periodId)
    .where('type', '==', type)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      periodId: data.periodId,
      type: data.type as ArtefactType,
      filename: data.filename,
      storagePath: data.storagePath,
      uploadedBy: data.uploadedBy,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      versionInt: data.versionInt ?? 1,
      tags: data.tags ?? [],
      parsedText: data.parsedText ?? null,
      parsedPages: data.parsedPages ?? null,
      visibility: data.visibility ?? 'normal',
      parseError: data.parseError ?? null,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
    };
  });
}

export async function getArtefact(artefactId: string): Promise<Artefact | null> {
  const db = getAdminFirestore();

  const doc = await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;

  return {
    id: doc.id,
    periodId: data.periodId,
    type: data.type as ArtefactType,
    filename: data.filename,
    storagePath: data.storagePath,
    uploadedBy: data.uploadedBy,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    versionInt: data.versionInt ?? 1,
    tags: data.tags ?? [],
    parsedText: data.parsedText ?? null,
    parsedPages: data.parsedPages ?? null,
    visibility: data.visibility ?? 'normal',
    parseError: data.parseError ?? null,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
  };
}

export async function createArtefact(
  periodId: string,
  type: ArtefactType,
  filename: string,
  fileData: string, // Base64 encoded
  mimeType: string,
  userId: string,
  tags: string[] = [],
  visibility: ArtefactVisibility = 'normal'
): Promise<{ success: boolean; artefactId?: string; error?: string }> {
  const db = getAdminFirestore();
  const storage = getAdminStorage();

  try {
    const artefactId = uuidv4();
    const storagePath = `${STORAGE_PATHS.ARTEFACTS}/${periodId}/${type}/${artefactId}/${filename}`;

    // Decode base64 and upload to storage
    const buffer = Buffer.from(fileData, 'base64');
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    // Create artefact document
    await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).set({
      periodId,
      type,
      filename,
      storagePath,
      uploadedBy: userId,
      createdAt: Timestamp.now(),
      versionInt: 1,
      tags,
      parsedText: null,
      parsedPages: null,
      visibility,
      parseError: null,
      fileSize: buffer.length,
      mimeType,
    });

    return { success: true, artefactId };
  } catch (error) {
    console.error('Error creating artefact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create artefact',
    };
  }
}

export async function createNoteArtefact(
  periodId: string,
  content: string,
  userId: string,
  tags: string[] = []
): Promise<{ success: boolean; artefactId?: string; error?: string }> {
  const db = getAdminFirestore();

  try {
    const artefactId = uuidv4();

    await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).set({
      periodId,
      type: 'notes',
      filename: null,
      storagePath: null,
      uploadedBy: userId,
      createdAt: Timestamp.now(),
      versionInt: 1,
      tags,
      parsedText: content,
      parsedPages: null,
      visibility: 'normal',
      parseError: null,
      fileSize: null,
      mimeType: null,
    });

    return { success: true, artefactId };
  } catch (error) {
    console.error('Error creating note artefact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create note',
    };
  }
}

export async function updateArtefactParsedText(
  artefactId: string,
  parsedText: string,
  parsedPages: { page: number; text: string }[] | null = null
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();

  try {
    await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).update({
      parsedText,
      parsedPages,
      parseError: null,
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating artefact parsed text:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update artefact',
    };
  }
}

export async function setArtefactParseError(
  artefactId: string,
  error: string
): Promise<{ success: boolean }> {
  const db = getAdminFirestore();

  try {
    await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).update({
      parseError: error,
    });

    return { success: true };
  } catch (err) {
    console.error('Error setting artefact parse error:', err);
    return { success: false };
  }
}

export async function deleteArtefact(
  artefactId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();
  const storage = getAdminStorage();

  try {
    const doc = await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).get();

    if (!doc.exists) {
      return { success: false, error: 'Artefact not found' };
    }

    const data = doc.data()!;

    // Delete from storage if file exists
    if (data.storagePath) {
      const bucket = storage.bucket();
      const file = bucket.file(data.storagePath);
      await file.delete().catch(() => {
        // Ignore if file doesn't exist
      });
    }

    // Delete document
    await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).delete();

    // Delete related extractions
    const extractionsSnapshot = await db
      .collection(COLLECTIONS.EXTRACTIONS)
      .where('artefactId', '==', artefactId)
      .get();

    const batch = db.batch();
    extractionsSnapshot.docs.forEach((extractionDoc) => {
      batch.delete(extractionDoc.ref);
    });
    await batch.commit();

    return { success: true };
  } catch (error) {
    console.error('Error deleting artefact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete artefact',
    };
  }
}

export async function getArtefactDownloadUrl(
  artefactId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const db = getAdminFirestore();
  const storage = getAdminStorage();

  try {
    const doc = await db.collection(COLLECTIONS.ARTEFACTS).doc(artefactId).get();

    if (!doc.exists) {
      return { success: false, error: 'Artefact not found' };
    }

    const data = doc.data()!;

    if (!data.storagePath) {
      return { success: false, error: 'Artefact has no file' };
    }

    const bucket = storage.bucket();
    const file = bucket.file(data.storagePath);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return { success: true, url };
  } catch (error) {
    console.error('Error getting download URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get download URL',
    };
  }
}
