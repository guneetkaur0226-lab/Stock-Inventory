import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || (env.VITE_FIREBASE_PROJECT_ID ? `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com` : undefined),
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let auth = null;
let db = null;

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    // Offline support: data is kept on the phone and synced when back online.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Offline storage unavailable, using memory cache', e);
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}

export { auth, db };
