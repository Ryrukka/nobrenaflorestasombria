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

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      if (!rooms[roomId]) {
        rooms[roomId] = { host: socket.id, players: [] };
      }
      rooms[roomId].players.push(socket.id);
      
      // Notify the player if they are the host
      socket.emit("room-joined", { 
        isHost: rooms[roomId].host === socket.id,
        roomId 
      });

      // Notify others in the room
      socket.to(roomId).emit("player-joined", socket.id);
      console.log(`User ${socket.id} joined room ${roomId}`);
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
      for (const roomId in rooms) {
        const room = rooms[roomId];
        const index = room.players.indexOf(socket.id);
        if (index !== -1) {
          room.players.splice(index, 1);
          socket.to(roomId).emit("player-left", socket.id);
          
          // If host left, assign a new host
          if (room.host === socket.id && room.players.length > 0) {
            room.host = room.players[0];
            io.to(room.host).emit("became-host");
          }

          if (room.players.length === 0) {
            delete rooms[roomId];
          }
          break;
        }
      }
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
