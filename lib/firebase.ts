import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/* CRITICAL: Must pass firebaseConfig.firestoreDatabaseId with force long polling for reliable webview & sandbox connection */
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  try {
    dbInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}
export const db = dbInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    await getDocFromServer(doc(db, 'test', 'connection')).catch((err) => {
      // Gracefully silence expected transient unavailable/offline error while connecting
      if (err?.code === 'unavailable' || err?.message?.includes('offline')) {
        return;
      }
      console.warn("Firestore connection check note:", err?.message || err);
    });
  } catch {
    // Graceful offline fallback
  }
}
