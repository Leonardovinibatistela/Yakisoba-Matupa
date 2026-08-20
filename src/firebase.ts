import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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

// App Check: garante que só o site de verdade (rodando no domínio configurado no
// reCAPTCHA) consegue gravar no Firestore — bloqueia scripts/bots batendo direto
// na API do banco, mesmo sabendo a config acima (que é sempre pública). Em
// localhost, usa um token de depuração pra não travar o desenvolvimento.
if (window.location.hostname === "localhost") {
  (window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6Lf1h5AtAAAAAFTYNqnjw6KBSnvpYxheTxN_CDeL"),
  isTokenAutoRefreshEnabled: true,
});

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
