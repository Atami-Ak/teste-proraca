import { initializeApp, getApps } from 'firebase/app'
import { getFirestore }           from 'firebase/firestore'
import { getAuth }                from 'firebase/auth'
import { getStorage }             from 'firebase/storage'

const firebaseConfig = {
  apiKey:            'AIzaSyAm-WkbDCMDNuWIsqI8QbbU4mdKEdIUnYo',
  authDomain:        'proraca-6f522.firebaseapp.com',
  projectId:         'proraca-6f522',
  storageBucket:     'proraca-6f522.firebasestorage.app',
  messagingSenderId: '659594069162',
  appId:             '1:659594069162:web:1fefbf925707663604fcd3',
}

// Prevent re-initialization on HMR
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const db      = getFirestore(app)
export const auth    = getAuth(app)
export const storage = getStorage(app)
