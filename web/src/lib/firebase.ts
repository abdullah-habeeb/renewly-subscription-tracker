import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Public web config — safe to ship to the client. Values can be overridden
// per-environment with VITE_FIREBASE_* variables.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyB7nnj_hdAzZ7q891bKAzi2a3Bq0uuTlTc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "subscription-hub-19cf9.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "subscription-hub-19cf9",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "subscription-hub-19cf9.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "154636560412",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:154636560412:web:72c29b9d5eb96eaae957d9",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
