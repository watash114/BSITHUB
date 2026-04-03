// ==========================================
// Firebase Real-time Messaging for BSITHUB
// Simple Message Queue System
// ==========================================

var firebaseConfig = {
    apiKey: "AIzaSyDqCLKvwD3j9z_EQCzHrtcGXOpYgXPm3yw",
    authDomain: "bsithub-1974a.firebaseapp.com",
    databaseURL: "https://bsithub-1974a-default-rtdb.firebaseio.com",
    projectId: "bsithub-1974a",
    storageBucket: "bsithub-1974a.firebasestorage.app",
    messagingSenderId: "790480652401",
    appId: "1:790480652401:web:38e18646da4869c3da73d0"
};

var firebaseApp = null;
var firebaseDb = null;
var firebaseInitialized = false;

function initFirebase() {
    if (firebaseInitialized) return true;
    
    try {
        if (typeof firebase === 'undefined') {
            console.log('Firebase SDK not loaded yet, retrying in 500ms...');
            setTimeout(initFirebase, 500);
            return false;
        }
        
        if (typeof firebase.database !== 'function') {
            console.log('Firebase database SDK not loaded yet, retrying in 500ms...');
            setTimeout(initFirebase, 500);
            return false;
        }
        
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            firebaseApp = firebase.app();
        }
        
        firebaseDb = firebase.database();
        firebaseInitialized = true;
        console.log('Firebase initialized successfully!');
        return true;
    } catch (e) {
        console.error('Firebase init error:', e);
        console.log('Retrying in 1 second...');
        setTimeout(initFirebase, 1000);
        return false;
    }
}

// ==========================================
// SEND MESSAGE - Simple approach
// ==========================================
function sendMsgToFirebase(msg) {
    return new Promise(function(resolve, reject) {
        function trySend() {
            if (!firebaseDb) {
                console.log('Firebase not ready, retrying sendMsgToFirebase in 1 second...');
                setTimeout(trySend, 1000);
                return;
            }
            
            // Store message under: messages/{chatId}/{messageId}
            var path = 'messages/' + msg.chatId + '/' + msg.id;
            firebaseDb.ref(path).set(msg)
                .then(resolve)
                .catch(reject);
        }
        trySend();
    });
}

// ==========================================
// LISTEN FOR MESSAGES - Real-time
// ==========================================
var activeListeners = {};

function listenChat(chatId, onNewMessage) {
    if (!firebaseDb) {
        console.log('Firebase not ready, retrying listenChat in 1 second...');
        setTimeout(function() { listenChat(chatId, onNewMessage); }, 1000);
        return;
    }
    
    // Remove old listener
    if (activeListeners[chatId]) {
        activeListeners[chatId].off();
    }
    
    var ref = firebaseDb.ref('messages/' + chatId);
    activeListeners[chatId] = ref;
    
    ref.on('child_added', function(snapshot) {
        var msg = snapshot.val();
        if (msg) {
            console.log('New msg received:', msg.text);
            onNewMessage(msg);
        }
    });
    
    ref.on('child_changed', function(snapshot) {
        var msg = snapshot.val();
        if (msg) {
            onNewMessage(msg);
        }
    });
    
    console.log('Listening for messages in:', chatId);
}

function stopListenChat(chatId) {
    if (activeListeners[chatId]) {
        activeListeners[chatId].off();
        delete activeListeners[chatId];
    }
}

// ==========================================
// LOAD ALL MESSAGES FOR CHAT
// ==========================================
function loadChatMessages(chatId) {
    return new Promise(function(resolve) {
        function tryLoad() {
            if (!firebaseDb) {
                console.log('Firebase not ready, retrying loadChatMessages in 1 second...');
                setTimeout(tryLoad, 1000);
                return;
            }
            
            firebaseDb.ref('messages/' + chatId)
                .once('value')
                .then(function(snap) {
                    var msgs = [];
                    if (snap.val()) {
                        snap.forEach(function(child) {
                            msgs.push(child.val());
                        });
                    }
                    msgs.sort(function(a, b) {
                        return new Date(a.timestamp) - new Date(b.timestamp);
                    });
                    resolve(msgs);
                })
                .catch(function() {
                    resolve([]);
                });
        }
        tryLoad();
    });
}

// ==========================================
// SYNC CHAT TO ALL PARTICIPANTS
// ==========================================
function syncChat(chat) {
    if (!chat) return;
    
    function trySync() {
        if (!firebaseDb) {
            console.log('Firebase not ready, retrying syncChat in 1 second...');
            setTimeout(trySync, 1000);
            return;
        }
        
        // Store chat data
        firebaseDb.ref('chats/' + chat.id).set(chat);
        
        // Add chat reference to each participant
        chat.participants.forEach(function(userId) {
            firebaseDb.ref('userChats/' + userId + '/' + chat.id).set({
                id: chat.id,
                addedAt: new Date().toISOString()
            });
        });
        
        console.log('Chat synced:', chat.id);
    }
    trySync();
}

// ==========================================
// GET USER'S CHATS FROM FIREBASE
// ==========================================
function getUserChats(userId) {
    return new Promise(function(resolve) {
        function tryLoad() {
            if (!firebaseDb) {
                console.log('Firebase not ready, retrying getUserChats in 1 second...');
                setTimeout(tryLoad, 1000);
                return;
            }
            
            firebaseDb.ref('userChats/' + userId)
                .once('value')
                .then(function(snap) {
                    var chatIds = [];
                    if (snap.val()) {
                        Object.keys(snap.val()).forEach(function(id) {
                            chatIds.push(id);
                        });
                    }
                    resolve(chatIds);
                })
                .catch(function() {
                    resolve([]);
                });
        }
        tryLoad();
    });
}

// ==========================================
// LISTEN FOR NEW CHATS
// ==========================================
function listenNewChats(userId, onNewChat) {
    function tryListen() {
        if (!firebaseDb) {
            console.log('Firebase not ready, retrying listenNewChats in 1 second...');
            setTimeout(tryListen, 1000);
            return;
        }
        
        firebaseDb.ref('userChats/' + userId).on('child_added', function(snap) {
            var chatRef = snap.val();
            if (chatRef) {
                // Get full chat data
                firebaseDb.ref('chats/' + chatRef.id).once('value').then(function(chatSnap) {
                    if (chatSnap.val()) {
                        onNewChat(chatSnap.val());
                    }
                });
            }
        });
    }
    tryListen();
}

// ==========================================
// TYPING INDICATOR
// ==========================================
function setTyping(chatId, userId, isTyping) {
function setTyping(chatId, userId, isTyping) {
    function trySet() {
        if (!firebaseDb) {
            setTimeout(trySet, 1000);
            return;
        }
        
        if (isTyping) {
            firebaseDb.ref('typing/' + chatId + '/' + userId).set(true);
            setTimeout(function() {
                firebaseDb.ref('typing/' + chatId + '/' + userId).remove();
            }, 3000);
        } else {
            firebaseDb.ref('typing/' + chatId + '/' + userId).remove();
        }
    }
    trySet();
}

function listenTyping(chatId, myUserId, callback) {
    function tryListen() {
        if (!firebaseDb) {
            setTimeout(tryListen, 1000);
            return;
        }
        
        firebaseDb.ref('typing/' + chatId).on('value', function(snap) {
            var typing = snap.val();
            if (typing) {
                Object.keys(typing).forEach(function(uid) {
                    if (uid !== myUserId) {
                    callback(uid);
                }
            });
        }
    });
}

// ==========================================
// ONLINE STATUS
// ==========================================
function goOnline(userId) {
    function tryGo() {
        if (!firebaseDb) {
            setTimeout(tryGo, 1000);
            return;
        }
        
        firebaseDb.ref('online/' + userId).set({
            online: true,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
        
        firebaseDb.ref('online/' + userId).onDisconnect().set({
            online: false,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
    }
    tryGo();
}

function goOffline(userId) {
    function tryGo() {
        if (!firebaseDb) {
            setTimeout(tryGo, 1000);
            return;
        }
        
        firebaseDb.ref('online/' + userId).set({
            online: false,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
    }
    tryGo();
}

console.log('Firebase module loaded');
