import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Config do projeto Firebase "sooba-yakisoba". A apiKey é pública por design —
// quem protege os dados de verdade são as Regras de Segurança do Firestore/Storage,
// não o sigilo dessa chave.
const firebaseConfig = {
  apiKey: "AIzaSyBsByr1zGtO3mFM6xduOg-6BuupVKQt-jc",
  authDomain: "sooba-yakisoba.firebaseapp.com",
  projectId: "sooba-yakisoba",
  storageBucket: "sooba-yakisoba.firebasestorage.app",
  messagingSenderId: "186235469528",
  appId: "1:186235469528:web:7735c78699b51c5d3b61ad",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
