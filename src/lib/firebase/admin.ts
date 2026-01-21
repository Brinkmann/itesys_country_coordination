import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage, Storage } from 'firebase-admin/storage';

let adminApp: App | undefined;
let adminDb: Firestore | undefined;
let adminAuth: Auth | undefined;
let adminStorage: Storage | undefined;

function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  // Initialize with service account credentials
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Firebase Admin SDK credential check:', {
      hasProjectId: !!projectId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKey,
    });
    throw new Error(
      'Missing Firebase Admin SDK credentials. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in .env.local. Restart the dev server after adding environment variables.'
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket: `${projectId}.firebasestorage.app`,
  });

  return adminApp;
}

export function getAdminFirestore(): Firestore {
  if (adminDb) {
    return adminDb;
  }
  adminDb = getFirestore(getAdminApp());
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (adminAuth) {
    return adminAuth;
  }
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

export function getAdminStorage(): Storage {
  if (adminStorage) {
    return adminStorage;
  }
  adminStorage = getStorage(getAdminApp());
  return adminStorage;
}

// Collection names as constants
export const COLLECTIONS = {
  PROFILES: 'profiles',
  PERIODS: 'periods',
  ARTEFACTS: 'artefacts',
  EXTRACTIONS: 'extractions',
  AGENDAS: 'agendas',
  ACTION_ITEMS: 'action_items',
} as const;

// Storage paths
export const STORAGE_PATHS = {
  ARTEFACTS: 'artefacts',
  AGENDA_EXPORTS: 'agenda-exports',
} as const;
