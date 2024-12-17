const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const users = {}; // Store user data (dots, positions, etc.)

// Use the absolute path to your project directory
const publicPath = path.join(__dirname, 'public');

// Serve static files from 'public' directory
app.use(express.static(publicPath));

// Default route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Add the new user with a default position
    users[socket.id] = {
        id: socket.id, 
        x: 100, 
        y: 100, 
        status: 'online' 
    };
    console.log('Current users:', Object.keys(users));

    // Send existing users and their statuses to the new user
    socket.emit('existingUsers', Object.values(users));

    // Broadcast to ALL clients that a new user has joined
    socket.broadcast.emit('userJoined', users[socket.id]);

    // Broadcast new user's status to others
    io.emit('statusUpdate', { id: socket.id, status: 'online' });

    // Handle status updates
    socket.on('statusChange', ({ id, status }) => {
        if (users[id]) {
            users[id].status = status;
            io.emit('statusUpdate', { id, status }); // Broadcast to all clients
        }
    });

    socket.on("updatePosition", ({ id, x, y }) => {

        if (users[id]) {
            users[id].x = x;
            users[id].y = y;
            console.log(`Position updated for ${id}: (${x}, ${y})`)

            socket.broadcast.emit("updatePosition", { id, x, y });
        }
    });

    socket.on('updateStatus', ({ status }) => {
        if (users[socket.id]) {
            users[socket.id].status = status;
            console.log(`Broadcasting ${socket.id}'s status as ${status}`); // Debugging log
            io.emit('statusUpdate', { id: socket.id, status });
        }
    });  

    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete users[socket.id];
        socket.broadcast.emit('userLeft', socket.id);
    });
});

// Start the server
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});