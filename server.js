const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store the current state
let currentState = {
    activePart: null,
    color: '#333333',
    text: '等待中...'
};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send the current state to the newly connected client
    socket.emit('state-update', currentState);

    // Listen for state changes from the controller
    socket.on('change-part', (data) => {
        currentState = data;
        io.emit('state-update', currentState);
    });

    // 歌曲切換事件
    socket.on('change-song', (num) => {
        io.emit('song-update', num);
    });

    // 反覆事件
    socket.on('repeat', () => {
        io.emit('repeat');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`On your local network, access via http://<YOUR_IP_ADDRESS>:${PORT}`);
});
