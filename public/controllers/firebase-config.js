// Evitar inicializar/configurar Firebase más de una vez si el script se carga duplicado
if (!window.__pdl_firebase_config_loaded) {
    window.__pdl_firebase_config_loaded = true;

    window.firebaseConfig = {
        apiKey: "AIzaSyC0I-rDLA9A4Slgl8oTj8qLAGuEAliHao8",
        authDomain: "pactodelloto-8a2fe.firebaseapp.com",
        projectId: "pactodelloto-8a2fe",
        storageBucket: "pactodelloto-8a2fe.firebasestorage.app",
        messagingSenderId: "962193034546",
        appId: "1:962193034546:web:f81ca47919b54ade69db2b",
        measurementId: "G-41BVZDFQN6"
    };

    // Inicializa Firebase solo si no hay apps creadas
    if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(window.firebaseConfig);
    }

    // Inicializa los servicios que vamos a usar y los expone en window para accesibilidad global
    window.firebaseApp = firebase.app();
    window.auth = firebase.auth();
    window.db = firebase.firestore();
}
