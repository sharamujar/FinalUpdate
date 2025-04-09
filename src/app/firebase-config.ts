// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBEz8A7DgKaSMW-BF2sU87BRyn_9KFCKgE",
  authDomain: "bbnka-mobile.firebaseapp.com",
  projectId: "bbnka-mobile",
  storageBucket: "bbnka-mobile.firebasestorage.app",
  messagingSenderId: "214639010070",
  appId: "1:214639010070:web:3c00f02bebfa9155e3f037"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, storage };