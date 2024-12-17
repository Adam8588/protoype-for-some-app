const socket = io();

let userId = null;
const dots = {}; // Store dots for all users
const peerConnections = {}; // Store peer connections for video chats
const localStreams = {}; // Store local video streams

const gameContainer = document.getElementById('gameContainer');
const videoContainer = document.createElement('div');
videoContainer.id = 'videoContainer';
videoContainer.style.position = 'absolute';
videoContainer.style.width = '300px';
videoContainer.style.height = '200px';
videoContainer.style.border = '1px solid black';
videoContainer.style.backgroundColor = '#fff';
videoContainer.style.resize = 'both';
videoContainer.style.overflow = 'auto';
videoContainer.style.top = '10px';
videoContainer.style.right = '10px';
document.body.appendChild(videoContainer);

// Make video container draggable
let isDraggingVideo = false;
videoContainer.addEventListener('mousedown', (event) => {
    isDraggingVideo = true;
    videoContainer.style.cursor = 'grabbing';
    const shiftX = event.clientX - videoContainer.getBoundingClientRect().left;
    const shiftY = event.clientY - videoContainer.getBoundingClientRect().top;

    function onMouseMove(e) {
        if (isDraggingVideo) {
            videoContainer.style.left = `${e.pageX - shiftX}px`;
            videoContainer.style.top = `${e.pageY - shiftY}px`;
        }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', () => {
        isDraggingVideo = false;
        videoContainer.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
    });
});

// Enable dragging for the user's dot
function enableDragging(dot, dotId) {
    if (dotId !== userId) return;

    let isDragging = false;

    dot.style.cursor = "grab";

    dot.addEventListener("mousedown", (event) => {
        isDragging = true;
        dot.style.cursor = "grabbing";

        // Prevent default behavior to avoid text selection
        event.preventDefault();
    });

    document.addEventListener("mousemove", (event) => {
        if (isDragging) {
            const gameRect = gameContainer.getBoundingClientRect();

            // Ensure the dot stays within the game container
            const x = Math.min(
                Math.max(0, event.pageX - gameRect.left - dot.offsetWidth / 2),
                gameRect.width - dot.offsetWidth
            );
            const y = Math.min(
                Math.max(0, event.pageY - gameRect.top - dot.offsetHeight / 2),
                gameRect.height - dot.offsetHeight
            );

            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;

            // Emit the new position to the server
            socket.emit("updatePosition", { id: userId, x, y });

            checkProximity();
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            dot.style.cursor = "grab";
        }
    });
}

let positionQueue = {};

// Create a dot for the current user and enable dragging
function createDot(id, x = 100 , y = 100) {
    if (dots[id]) {
        console.warn(`Dot for user ${id} already exists.`);
        return;
    }

    console.log(`Creating dot for user: ${id} at (${x}, ${y})`);

    const dot = document.createElement("div");
    dot.classList.add("dot");
    dot.dataset.id = id;
    dot.style.position = "absolute";
    dot.style.width = "20px";
    dot.style.height = "20px";
    dot.style.borderRadius = "50%";
    dot.style.backgroundColor = id === userId ? "blue" : "red";
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;

    dots[id] = dot;

    // Add status element
    const status = document.createElement('div');
    status.classList.add('status');
    status.style.position = 'absolute';
    status.style.top = '25px';
    status.style.left = '0';
    status.style.fontSize = '10px';
    status.style.textAlign = 'center';
    status.style.width = '100%';
    

    dot.appendChild(status);
    gameContainer.appendChild(dot);
    console.log('Current dots:', dots);

    enableDragging(dot, id);

    // Apply queued updates if any
    if (positionQueue[id]) {
        console.log(`Applying queued position update for ${id}`);
        const { x, y } = positionQueue[id];
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        delete positionQueue[id];
    }
}

// Check proximity between dots
function checkProximity() {
    const userDot = dots[userId];
    const userRect = userDot.getBoundingClientRect();

    for (const [id, dot] of Object.entries(dots)) {
        if (id !== userId) {
            const otherRect = dot.getBoundingClientRect();
            const distance = Math.sqrt(
                Math.pow(userRect.x - otherRect.x, 2) +
                Math.pow(userRect.y - otherRect.y, 2)
            );

            if (distance < 50 && !peerConnections[id]) { // Start chat
                startVideoChat(id);
            } else if (distance >= 50 && peerConnections[id]) { // Stop chat
                stopVideoChat(id);
            }
        }
    }
}
// Online/Idle/In another tab
let userStatus = 'online'; // Default status
let idleTimeout;
let isIdle = false;

// Function to set user status
function updateStatus(newStatus) {
    console.log(`Emitting status: ${newStatus}`); // Debugging log
    socket.emit('updateStatus', { status: newStatus });
}

// Handle visibility change (switching tabs)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        updateStatus('in another tab');
    } else {
        updateStatus(isIdle ? 'idle' : 'online');
    }
});

// Handle user activity to detect idle state
function resetIdleTimer() {
    if (isIdle) {
        isIdle = false;
        updateStatus('online');
    }
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        isIdle = true;
        updateStatus('idle');
    }, 10000); // 10 seconds idle threshold
}

// Monitor user activity for idle detection
['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach((event) => {
    document.addEventListener(event, resetIdleTimer);
});

// Initial status
updateStatus('online');

// Listen for status updates from the server
socket.on('statusUpdate', ({ id, status }) => {
    if (dots[id]) {
        const dot = dots[id];
        
        // Create or update the status indicator
        let statusIndicator = dot.querySelector('.status-indicator');
        if (!statusIndicator) {
            // Create a new span for the status indicator
            statusIndicator = document.createElement('span');
            statusIndicator.className = 'status-indicator';
            statusIndicator.style.position = 'absolute';
            statusIndicator.style.bottom = '-20px';
            statusIndicator.style.left = '50%';
            statusIndicator.style.transform = 'translateX(-50%)';
            statusIndicator.style.fontSize = '12px';
            statusIndicator.style.fontWeight = 'bold';
            dot.appendChild(statusIndicator);
        }

        // Update the text and color based on status
        statusIndicator.textContent = status.toUpperCase(); // Example: ONLINE, IDLE, IN ANOTHER TAB
        statusIndicator.style.color =
            status === 'online' ? 'green' :
            status === 'idle' ? 'orange' :
            'red'; // Default: red for "in another tab"
    }

    console.log(`Status update received for ${id}: ${status}`); // Debugging log

    if (dots[id]) {
        const statusElement = dots[id].querySelector('.status');
        if (statusElement) {
            statusElement.textContent = status; // Update status text
        }
    }
});

// WebRTC setup
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startVideoChat(targetId) {
    console.log(`Starting video chat with ${targetId}`);

    const peerConnection = new RTCPeerConnection(config);
    peerConnections[targetId] = peerConnection;

    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreams[targetId] = localStream;

    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    // Create and show local video
    const localVideo = document.createElement('video');
    localVideo.srcObject = localStream;
    localVideo.autoplay = true;
    localVideo.muted = true; // Prevent echo
    localVideo.style.width = '100%';
    videoContainer.appendChild(localVideo);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('iceCandidate', { targetId, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        remoteVideo.style.width = '100%';
        videoContainer.appendChild(remoteVideo);
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { targetId, offer });
}

function stopVideoChat(targetId) {
    if (peerConnections[targetId]) {
        peerConnections[targetId].close();
        delete peerConnections[targetId];
    }

    if (localStreams[targetId]) {
        localStreams[targetId].getTracks().forEach((track) => track.stop());
        delete localStreams[targetId];
    }

    // Remove video elements
    while (videoContainer.firstChild) {
        videoContainer.removeChild(videoContainer.firstChild);
    }
}

// Handle signaling
socket.on('offer', async ({ senderId, offer }) => {
    const peerConnection = new RTCPeerConnection(config);
    peerConnections[senderId] = peerConnection;

    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreams[senderId] = localStream;

    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('iceCandidate', { targetId: senderId, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        remoteVideo.style.width = '100%';
        videoContainer.appendChild(remoteVideo);
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { targetId: senderId, answer });
});

socket.on('answer', async ({ senderId, answer }) => {
    if (peerConnections[senderId]) {
        await peerConnections[senderId].setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('iceCandidate', async ({ senderId, candidate }) => {
    if (peerConnections[senderId]) {
        await peerConnections[senderId].addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Handle socket events
socket.on('connect', () => {
    userId = socket.id;
    console.log(`Connected as: ${userId}`);
    createDot(userId, 100, 100);
});

socket.on('userJoined', (userData) => {
    console.log(`User joined: ${JSON.stringify(userData)}`);
    if (!dots[userData.id]) { 
        console.log(`Creating dot for new user: ${userData.id}`);
        createDot(userData.id, userData.x, userData.y);
    } else {
        console.log(`Dot for user ${userData.id} already exists.`)
    }
});

socket.on('existingUsers', (existingUsers) => {
    console.log('Existing users:', existingUsers);
    existingUsers.forEach(user => {
        if (!dots[user.id] && user.id !== userId) {
            console.log(`Creating dot for existing user: ${user.id}`);
            createDot(user.id, user.x, user.y);
        }
    });
});

// Listen for position updates from other users
socket.on("updatePosition", ({ id, x, y }) => {
    console.log(`Update position for ${id}: (${x}, ${y})`);
    if (dots[id]) {
        dots[id].style.left = `${x}px`;
        dots[id].style.top = `${y}px`;
    } else {
        console.log(`Dot for user ${id} not found!`);
        positionQueue[id] = { x, y };
    }
});

socket.on('userLeft', (id) => {
    stopVideoChat(id);
    if (dots[id]) {
        gameContainer.removeChild(dots[id]);
        delete dots[id];
    } else {
        console.warn(`Tried to remove non-existent dot for ${id}`);
    }
});
