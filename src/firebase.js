import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyA2nZFBhiXMHqdXUgeFmHBSst17qw_MHVY",
  authDomain: "quotekeeper-5eae1.firebaseapp.com",
  projectId: "quotekeeper-5eae1",
  storageBucket: "quotekeeper-5eae1.firebasestorage.app",
  messagingSenderId: "701273647635",
  appId: "1:701273647635:web:ad49d577aa6de158e9ade6"
};

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)