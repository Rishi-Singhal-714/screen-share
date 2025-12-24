const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store rooms and users
const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'join':
                    handleJoin(ws, data);
                    break;
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                case 'screen-share-started':
                case 'screen-share-ended':
                    broadcastToRoom(data.roomId, ws, data);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleJoin(ws, data) {
    const { roomId, userId } = data;
    
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }
    
    rooms.get(roomId).add({
        ws,
        userId
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'joined',
        roomId,
        userId
    }));
    
    // Update user list for all in room
    updateUserList(roomId);
}

function updateUserList(roomId) {
    if (!rooms.has(roomId)) return;
    
    const users = Array.from(rooms.get(roomId)).map(u => u.userId);
    
    // Send updated user list to everyone in the room
    rooms.get(roomId).forEach(user => {
        user.ws.send(JSON.stringify({
            type: 'user-list',
            users: users
        }));
    });
}

function broadcastToRoom(roomId, senderWs, message) {
    if (!rooms.has(roomId)) return;
    
    rooms.get(roomId).forEach(user => {
        // Don't send back to the sender
        if (user.ws !== senderWs) {
            user.ws.send(JSON.stringify(message));
        }
    });
}

function handleDisconnect(ws) {
    // Find and remove user from all rooms
    for (const [roomId, users] of rooms.entries()) {
        for (const user of users) {
            if (user.ws === ws) {
                users.delete(user);
                
                // Notify others in the room
                users.forEach(u => {
                    u.ws.send(JSON.stringify({
                        type: 'user-left',
                        userId: user.userId
                    }));
                });
                
                // Update user list
                if (users.size === 0) {
                    rooms.delete(roomId);
                } else {
                    updateUserList(roomId);
                }
                break;
            }
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Open in multiple browsers to test screen sharing!`);
});
