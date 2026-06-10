// assets/js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
  Cole aqui as configurações do seu projeto Firebase.

  Caminho:
  Firebase Console > Configurações do projeto > Geral > Seus apps > App Web
*/

const firebaseConfig = {
  apiKey: "AIzaSyCkFHOVZvHAbr-bVqo-kx2LWJB0MNXaJSo",
  authDomain: "looping-tecnologia.firebaseapp.com",
  projectId: "looping-tecnologia",
  storageBucket: "looping-tecnologia.firebasestorage.app",
  messagingSenderId: "113035173210",
  appId: "1:113035173210:web:ade2a991b3df2fe9c16763"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);