'use server';

import { getAdminFirestore, COLLECTIONS } from '@/lib/firebase/admin';
import {
  Extraction,
  ExtractionKind,
  FinanceExtraction,
  ProductivityExtraction,
  MinutesExtraction,
} from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

const EXTRACTOR_VERSION = '1.0.0';

/**
 * Save an extraction result for an artefact
 */
export async function saveExtraction(
  artefactId: string,
  periodId: string,
  kind: ExtractionKind,
  payload: FinanceExtraction | ProductivityExtraction | MinutesExtraction
): Promise<{ success: boolean; extractionId?: string; error?: string }> {
  const db = getAdminFirestore();

  try {
    const extractionId = uuidv4();

    await db.collection(COLLECTIONS.EXTRACTIONS).doc(extractionId).set({
      artefactId,
      periodId,
      kind,
      payload,
      extractorVersion: EXTRACTOR_VERSION,
      createdAt: Timestamp.now(),
    });

    return { success: true, extractionId };
  } catch (error) {
    console.error('Error saving extraction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save extraction',
    };
  }
}

/**
 * Get all extractions for a period
 */
export async function getExtractionsByPeriod(periodId: string): Promise<Extraction[]> {
  const db = getAdminFirestore();

  const snapshot = await db
    .collection(COLLECTIONS.EXTRACTIONS)
    .where('periodId', '==', periodId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      artefactId: data.artefactId,
      periodId: data.periodId,
      kind: data.kind as ExtractionKind,
      payload: data.payload,
      extractorVersion: data.extractorVersion,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    };
  });
}

/**
 * Get extractions by kind for a period
 */
export async function getExtractionsByKind(
  periodId: string,
  kind: ExtractionKind
): Promise<Extraction[]> {
  const db = getAdminFirestore();

  const snapshot = await db
    .collection(COLLECTIONS.EXTRACTIONS)
    .where('periodId', '==', periodId)
    .where('kind', '==', kind)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      artefactId: data.artefactId,
      periodId: data.periodId,
      kind: data.kind as ExtractionKind,
      payload: data.payload,
      extractorVersion: data.extractorVersion,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    };
  });
}

/**
 * Get extractions for multiple periods (for cross-period comparison)
 * Returns extractions ordered by period descending
 */
export async function getExtractionsForPeriods(
  periodIds: string[],
  kind?: ExtractionKind
): Promise<Extraction[]> {
  const db = getAdminFirestore();

  let query = db
    .collection(COLLECTIONS.EXTRACTIONS)
    .where('periodId', 'in', periodIds);

  if (kind) {
    query = query.where('kind', '==', kind);
  }

  const snapshot = await query.get();

  const extractions = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      artefactId: data.artefactId,
      periodId: data.periodId,
      kind: data.kind as ExtractionKind,
      payload: data.payload,
      extractorVersion: data.extractorVersion,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    };
  });

  // Sort by periodId descending
  extractions.sort((a, b) => b.periodId.localeCompare(a.periodId));

  return extractions;
}

/**
 * Delete extractions for an artefact (when artefact is deleted)
 */
export async function deleteExtractionsForArtefact(
  artefactId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();

  try {
    const snapshot = await db
      .collection(COLLECTIONS.EXTRACTIONS)
      .where('artefactId', '==', artefactId)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return { success: true };
  } catch (error) {
    console.error('Error deleting extractions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete extractions',
    };
  }
}
