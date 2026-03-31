import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Multiplayer logic
  const rooms: Record<string, { host: string; players: string[] }> = {};

  function broadcastRooms() {
    const roomList = Object.keys(rooms).map(id => ({
      id,
      playerCount: rooms[id].players.length
    }));
    io.emit("rooms-list", roomList);
  }

  function leaveAllRooms(socketId: string) {
    let changed = false;
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.indexOf(socketId);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomId).emit("player-left", socketId);
        
        // If host left, assign a new host
        if (room.host === socketId && room.players.length > 0) {
          room.host = room.players[0];
          io.to(room.host).emit("became-host");
        }

        if (room.players.length === 0) {
          delete rooms[roomId];
        }
        changed = true;
      }
    }
    return changed;
  }

  // Periodic broadcast of rooms to everyone in the lobby
  setInterval(() => {
    broadcastRooms();
  }, 5000);

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    
    // Send current rooms to the new user
    broadcastRooms();

    socket.on("request-rooms", () => {
      broadcastRooms();
    });

    socket.on("join-room", (roomId) => {
      console.log(`User ${socket.id} requesting to join room ${roomId}`);
      
      // Leave previous rooms first
      if (leaveAllRooms(socket.id)) {
        // If we left rooms, broadcast the update
        broadcastRooms();
      }

      socket.join(roomId);
      if (!rooms[roomId]) {
        rooms[roomId] = { host: socket.id, players: [] };
        console.log(`Room ${roomId} created with host ${socket.id}`);
      }
      if (!rooms[roomId].players.includes(socket.id)) {
        rooms[roomId].players.push(socket.id);
      }
      
      // Notify the player if they are the host
      socket.emit("room-joined", { 
        isHost: rooms[roomId].host === socket.id,
        roomId 
      });

      // Notify others in the room
      socket.to(roomId).emit("player-joined", socket.id);
      console.log(`User ${socket.id} joined room ${roomId}. Total players: ${rooms[roomId].players.length}`);
      
      broadcastRooms();
    });

    socket.on("player-update", (data) => {
      const { roomId, ...playerData } = data;
      socket.to(roomId).emit("player-moved", { id: socket.id, ...playerData });
    });

    socket.on("player-attack", (data) => {
      const { roomId, ...attackData } = data;
      socket.to(roomId).emit("remote-attack", { id: socket.id, ...attackData });
    });

    socket.on("sync-game-state", (data) => {
      const { roomId, ...gameState } = data;
      // Only the host should sync the game state
      if (rooms[roomId]?.host === socket.id) {
        socket.to(roomId).emit("game-state-synced", gameState);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      if (leaveAllRooms(socket.id)) {
        broadcastRooms();
      }
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
