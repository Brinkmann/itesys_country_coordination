'use server';

import { getAdminFirestore, COLLECTIONS } from '@/lib/firebase/admin';
import { Period, PeriodWithStats, CreatePeriodInput, ArtefactType } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

export async function getPeriods(includeHistorical = true): Promise<PeriodWithStats[]> {
  const db = getAdminFirestore();

  // Fetch all periods
  const snapshot = await db.collection(COLLECTIONS.PERIODS).get();

  const periods: PeriodWithStats[] = [];

  // Filter docs based on includeHistorical flag
  const filteredDocs = includeHistorical
    ? snapshot.docs
    : snapshot.docs.filter((doc) => doc.data().isHistorical !== true);

  for (const doc of filteredDocs) {
    const data = doc.data();

    // Get artefact counts for this period
    const artefactsSnapshot = await db
      .collection(COLLECTIONS.ARTEFACTS)
      .where('periodId', '==', doc.id)
      .get();

    const artefactCounts: Record<ArtefactType, number> = {
      finance: 0,
      productivity: 0,
      minutes: 0,
      hr: 0,
      other: 0,
      notes: 0,
    };

    artefactsSnapshot.docs.forEach((artefactDoc) => {
      const artefact = artefactDoc.data();
      const type = artefact.type as ArtefactType;
      if (artefactCounts[type] !== undefined) {
        artefactCounts[type]++;
      }
    });

    // Check if agenda exists
    const agendasSnapshot = await db
      .collection(COLLECTIONS.AGENDAS)
      .where('periodId', '==', doc.id)
      .limit(1)
      .get();

    const hasAgenda = !agendasSnapshot.empty;
    const hasFinalAgenda = agendasSnapshot.docs.some(
      (d) => d.data().status === 'final'
    );

    periods.push({
      id: doc.id,
      label: data.label,
      isHistorical: data.isHistorical ?? false,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      createdBy: data.createdBy ?? '',
      artefactCounts,
      totalArtefacts: artefactsSnapshot.size,
      hasAgenda,
      hasFinalAgenda,
    });
  }

  // Sort by id descending
  periods.sort((a, b) => b.id.localeCompare(a.id));

  return periods;
}

export async function getHistoricalPeriods(): Promise<PeriodWithStats[]> {
  const db = getAdminFirestore();

  // Fetch all periods and filter in code
  const snapshot = await db
    .collection(COLLECTIONS.PERIODS)
    .get();

  const periods: PeriodWithStats[] = [];

  // Filter for historical periods only
  const historicalDocs = snapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.isHistorical === true;
  });

  for (const doc of historicalDocs) {
    const data = doc.data();

    const artefactsSnapshot = await db
      .collection(COLLECTIONS.ARTEFACTS)
      .where('periodId', '==', doc.id)
      .get();

    const artefactCounts: Record<ArtefactType, number> = {
      finance: 0,
      productivity: 0,
      minutes: 0,
      hr: 0,
      other: 0,
      notes: 0,
    };

    artefactsSnapshot.docs.forEach((artefactDoc) => {
      const artefact = artefactDoc.data();
      const type = artefact.type as ArtefactType;
      if (artefactCounts[type] !== undefined) {
        artefactCounts[type]++;
      }
    });

    periods.push({
      id: doc.id,
      label: data.label,
      isHistorical: true,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      createdBy: data.createdBy ?? '',
      artefactCounts,
      totalArtefacts: artefactsSnapshot.size,
      hasAgenda: false,
      hasFinalAgenda: false,
    });
  }

  // Sort by id descending
  periods.sort((a, b) => b.id.localeCompare(a.id));

  return periods;
}

export async function getCurrentPeriods(): Promise<PeriodWithStats[]> {
  const db = getAdminFirestore();

  // Fetch all periods and filter in code to avoid index issues
  const snapshot = await db
    .collection(COLLECTIONS.PERIODS)
    .get();

  const periods: PeriodWithStats[] = [];

  // Filter for non-historical periods
  const nonHistoricalDocs = snapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.isHistorical !== true;
  });

  for (const doc of nonHistoricalDocs) {
    const data = doc.data();

    const artefactsSnapshot = await db
      .collection(COLLECTIONS.ARTEFACTS)
      .where('periodId', '==', doc.id)
      .get();

    const artefactCounts: Record<ArtefactType, number> = {
      finance: 0,
      productivity: 0,
      minutes: 0,
      hr: 0,
      other: 0,
      notes: 0,
    };

    artefactsSnapshot.docs.forEach((artefactDoc) => {
      const artefact = artefactDoc.data();
      const type = artefact.type as ArtefactType;
      if (artefactCounts[type] !== undefined) {
        artefactCounts[type]++;
      }
    });

    const agendasSnapshot = await db
      .collection(COLLECTIONS.AGENDAS)
      .where('periodId', '==', doc.id)
      .limit(1)
      .get();

    periods.push({
      id: doc.id,
      label: data.label,
      isHistorical: false,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      createdBy: data.createdBy ?? '',
      artefactCounts,
      totalArtefacts: artefactsSnapshot.size,
      hasAgenda: !agendasSnapshot.empty,
      hasFinalAgenda: agendasSnapshot.docs.some((d) => d.data().status === 'final'),
    });
  }

  // Sort by id descending (YYYY-MM format sorts correctly as strings)
  periods.sort((a, b) => b.id.localeCompare(a.id));

  return periods;
}

export async function getPeriod(periodId: string): Promise<Period | null> {
  const db = getAdminFirestore();

  const doc = await db.collection(COLLECTIONS.PERIODS).doc(periodId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;

  return {
    id: doc.id,
    label: data.label,
    isHistorical: data.isHistorical ?? false,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    createdBy: data.createdBy ?? '',
  };
}

export async function createPeriod(
  input: CreatePeriodInput,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate period ID format (YYYY-MM)
    const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!periodRegex.test(input.id)) {
      return { success: false, error: 'Invalid period format. Use YYYY-MM (e.g., 2026-01)' };
    }

    const db = getAdminFirestore();

    // Check if period already exists
    const existing = await db.collection(COLLECTIONS.PERIODS).doc(input.id).get();

    if (existing.exists) {
      return { success: false, error: 'Period already exists' };
    }

    await db.collection(COLLECTIONS.PERIODS).doc(input.id).set({
      id: input.id,
      label: input.label,
      isHistorical: input.isHistorical ?? false,
      createdAt: Timestamp.now(),
      createdBy: userId,
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating period:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to create period: ${message}` };
  }
}

export async function deletePeriod(
  periodId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();

  // Check if period has artefacts
  const artefactsSnapshot = await db
    .collection(COLLECTIONS.ARTEFACTS)
    .where('periodId', '==', periodId)
    .limit(1)
    .get();

  if (!artefactsSnapshot.empty) {
    return {
      success: false,
      error: 'Cannot delete period with existing artefacts. Delete all artefacts first.',
    };
  }

  await db.collection(COLLECTIONS.PERIODS).doc(periodId).delete();

  return { success: true };
}

export async function updatePeriodHistorical(
  periodId: string,
  isHistorical: boolean
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();

  try {
    const doc = await db.collection(COLLECTIONS.PERIODS).doc(periodId).get();

    if (!doc.exists) {
      return { success: false, error: 'Period not found' };
    }

    await db.collection(COLLECTIONS.PERIODS).doc(periodId).update({
      isHistorical,
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating period:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update period',
    };
  }
}

export async function getExistingPeriodIds(): Promise<string[]> {
  const db = getAdminFirestore();

  const snapshot = await db.collection(COLLECTIONS.PERIODS).select().get();

  return snapshot.docs.map((doc) => doc.id);
}
