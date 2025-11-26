const firebaseConfig = {
    apiKey: "AIzaSyC0I-rDLA9A4Slgl8oTj8qLAGuEAliHao8",
    authDomain: "pactodelloto-8a2fe.firebaseapp.com",
    projectId: "pactodelloto-8a2fe",
    storageBucket: "pactodelloto-8a2fe.firebasestorage.app",
    messagingSenderId: "962193034546",
    appId: "1:962193034546:web:f81ca47919b54ade69db2b",
    measurementId: "G-41BVZDFQN6"
 };
 
 // Inicializa Firebase
 const app = firebase.initializeApp(firebaseConfig);
 
 // Inicializa los servicios que vamos a usar
 const auth = firebase.auth();
 const db = firebase.firestore(); // Este servicio requiere una base de datos Cloud Firestore
