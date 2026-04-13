import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAm-WkbDCMDNuWIsqI8QbbU4mdKEdIUnYo",
  authDomain: "proraca-6f522.firebaseapp.com",
  projectId: "proraca-6f522",
  storageBucket: "proraca-6f522.firebasestorage.app",
  messagingSenderId: "659594069162",
  appId: "1:659594069162:web:1fefbf925707663604fcd3",
  measurementId: "G-P1GN3DTV0Q",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
