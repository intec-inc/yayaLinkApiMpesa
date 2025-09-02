const firebase = require('firebase/app');

const firebaseApp = firebase.initializeApp({
    apiKey: "AIzaSyDHvnTIY1x17KWrHuszJmJyvQCbNilC4Uk",
    authDomain: "yayananies.firebaseapp.com",
    projectId: "yayananies",
    storageBucket: "yayananies.appspot.com",
    messagingSenderId: "934333898387",
    appId: "1:934333898387:web:415ae3b8c0585bd271b766",
    measurementId: "G-676Y2E1CSE"
});
const db = firebase.firestore();
const user = db.collection("user");
module.exports = user;