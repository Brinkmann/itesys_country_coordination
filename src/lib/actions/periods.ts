'use server';

import { getAdminFirestore, COLLECTIONS } from '@/lib/firebase/admin';
import { Period, PeriodWithStats, CreatePeriodInput, ArtefactType } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

export async function getPeriods(includeHistorical = true): Promise<PeriodWithStats[]> {
  const db = getAdminFirestore();

  let query = db.collection(COLLECTIONS.PERIODS).orderBy('id', 'desc');

  if (!includeHistorical) {
    query = query.where('isHistorical', '==', false);
  }

  const snapshot = await query.get();

  const periods: PeriodWithStats[] = [];

  for (const doc of snapshot.docs) {
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

  return periods;
}

export async function getHistoricalPeriods(): Promise<PeriodWithStats[]> {
  const db = getAdminFirestore();

  const snapshot = await db
    .collection(COLLECTIONS.PERIODS)
    .where('isHistorical', '==', true)
    .orderBy('id', 'desc')
    .get();

  const periods: PeriodWithStats[] = [];

  for (const doc of snapshot.docs) {
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

  return periods;
}

export async function getCurrentPeriods(): Promise<PeriodWithStats[]> {
  const db = getAdminFirestore();

  const snapshot = await db
    .collection(COLLECTIONS.PERIODS)
    .where('isHistorical', '==', false)
    .orderBy('id', 'desc')
    .get();

  const periods: PeriodWithStats[] = [];

  for (const doc of snapshot.docs) {
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
  const db = getAdminFirestore();

  // Check if period already exists
  const existing = await db.collection(COLLECTIONS.PERIODS).doc(input.id).get();

  if (existing.exists) {
    return { success: false, error: 'Period already exists' };
  }

  // Validate period ID format (YYYY-MM)
  const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!periodRegex.test(input.id)) {
    return { success: false, error: 'Invalid period format. Use YYYY-MM (e.g., 2026-01)' };
  }

  await db.collection(COLLECTIONS.PERIODS).doc(input.id).set({
    label: input.label,
    isHistorical: input.isHistorical,
    createdAt: Timestamp.now(),
    createdBy: userId,
  });

  return { success: true };
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

export async function getExistingPeriodIds(): Promise<string[]> {
  const db = getAdminFirestore();

  const snapshot = await db.collection(COLLECTIONS.PERIODS).select().get();

  return snapshot.docs.map((doc) => doc.id);
}
