'use server';

import { getAdminFirestore, COLLECTIONS } from '@/lib/firebase/admin';
import { ActionItem, ActionStatus, CreateActionInput, UpdateActionInput } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

export async function getActionsByPeriod(periodId: string): Promise<ActionItem[]> {
  const db = getAdminFirestore();

  // Simple query without orderBy to avoid index requirement
  const snapshot = await db
    .collection(COLLECTIONS.ACTION_ITEMS)
    .where('periodIdCreated', '==', periodId)
    .get();

  const actions = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      periodIdCreated: data.periodIdCreated,
      title: data.title,
      owner: data.owner,
      status: data.status as ActionStatus,
      dueDate: data.dueDate?.toDate() ?? null,
      sourceArtefactId: data.sourceArtefactId ?? null,
      sourceRef: data.sourceRef ?? null,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      lastUpdatedAt: data.lastUpdatedAt?.toDate() ?? new Date(),
    };
  });

  // Sort by createdAt descending in code
  actions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return actions;
}

export async function getOpenActions(): Promise<ActionItem[]> {
  const db = getAdminFirestore();

  // Simple query without orderBy to avoid index requirement
  const snapshot = await db
    .collection(COLLECTIONS.ACTION_ITEMS)
    .where('status', 'in', ['open', 'in_progress'])
    .get();

  const actions = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      periodIdCreated: data.periodIdCreated,
      title: data.title,
      owner: data.owner,
      status: data.status as ActionStatus,
      dueDate: data.dueDate?.toDate() ?? null,
      sourceArtefactId: data.sourceArtefactId ?? null,
      sourceRef: data.sourceRef ?? null,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      lastUpdatedAt: data.lastUpdatedAt?.toDate() ?? new Date(),
    };
  });

  // Sort by dueDate ascending in code (null dates at end)
  actions.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  return actions;
}

export async function getCarryOverActions(currentPeriodId: string): Promise<ActionItem[]> {
  const db = getAdminFirestore();

  // Get all open/in_progress actions and filter in code to avoid complex index
  const snapshot = await db
    .collection(COLLECTIONS.ACTION_ITEMS)
    .where('status', 'in', ['open', 'in_progress'])
    .get();

  const actions = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        periodIdCreated: data.periodIdCreated,
        title: data.title,
        owner: data.owner,
        status: data.status as ActionStatus,
        dueDate: data.dueDate?.toDate() ?? null,
        sourceArtefactId: data.sourceArtefactId ?? null,
        sourceRef: data.sourceRef ?? null,
        createdAt: data.createdAt?.toDate() ?? new Date(),
        lastUpdatedAt: data.lastUpdatedAt?.toDate() ?? new Date(),
      };
    })
    // Filter for previous periods only
    .filter((action) => action.periodIdCreated < currentPeriodId);

  // Sort by periodIdCreated desc, then dueDate asc
  actions.sort((a, b) => {
    const periodCompare = b.periodIdCreated.localeCompare(a.periodIdCreated);
    if (periodCompare !== 0) return periodCompare;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  return actions;
}

export async function createAction(
  input: CreateActionInput
): Promise<{ success: boolean; actionId?: string; error?: string }> {
  const db = getAdminFirestore();

  try {
    const actionId = uuidv4();
    const now = Timestamp.now();

    await db.collection(COLLECTIONS.ACTION_ITEMS).doc(actionId).set({
      periodIdCreated: input.periodIdCreated,
      title: input.title,
      owner: input.owner,
      status: 'open',
      dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
      sourceArtefactId: input.sourceArtefactId ?? null,
      sourceRef: null,
      createdAt: now,
      lastUpdatedAt: now,
    });

    return { success: true, actionId };
  } catch (error) {
    console.error('Error creating action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create action',
    };
  }
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();

  try {
    const updateData: Record<string, unknown> = {
      lastUpdatedAt: Timestamp.now(),
    };

    if (input.title !== undefined) {
      updateData.title = input.title;
    }
    if (input.owner !== undefined) {
      updateData.owner = input.owner;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.dueDate !== undefined) {
      updateData.dueDate = input.dueDate ? Timestamp.fromDate(input.dueDate) : null;
    }

    await db.collection(COLLECTIONS.ACTION_ITEMS).doc(actionId).update(updateData);

    return { success: true };
  } catch (error) {
    console.error('Error updating action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update action',
    };
  }
}

export async function deleteAction(
  actionId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminFirestore();

  try {
    await db.collection(COLLECTIONS.ACTION_ITEMS).doc(actionId).delete();
    return { success: true };
  } catch (error) {
    console.error('Error deleting action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete action',
    };
  }
}

export async function markActionComplete(
  actionId: string
): Promise<{ success: boolean; error?: string }> {
  return updateAction(actionId, { status: 'done' });
}

export async function markActionInProgress(
  actionId: string
): Promise<{ success: boolean; error?: string }> {
  return updateAction(actionId, { status: 'in_progress' });
}
