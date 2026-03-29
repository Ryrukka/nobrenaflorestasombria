import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  const PORT = 3000;

  // Gerenciamento de Salas
  const rooms: Record<string, { host: string; players: string[] }> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("createRoom", (roomCode) => {
      if (rooms[roomCode]) {
        socket.emit("error", "Sala já existe");
        return;
      }
      rooms[roomCode] = { host: socket.id, players: [socket.id] };
      socket.join(roomCode);
      socket.emit("roomCreated", roomCode);
      console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    socket.on("joinRoom", (roomCode) => {
      const room = rooms[roomCode];
      if (!room) {
        socket.emit("error", "Sala não encontrada");
        return;
      }
      if (room.players.length >= 2) {
        socket.emit("error", "Sala cheia");
        return;
      }
      room.players.push(socket.id);
      socket.join(roomCode);
      socket.emit("roomJoined", { roomCode, isHost: false });
      io.to(roomCode).emit("playerJoined", socket.id);
      console.log(`User ${socket.id} joined room ${roomCode}`);
    });

    // Sincronização de Estado
    socket.on("playerUpdate", ({ roomCode, state }) => {
      socket.to(roomCode).emit("remotePlayerUpdate", { id: socket.id, ...state });
    });

    socket.on("worldUpdate", ({ roomCode, worldState }) => {
      // Apenas o Host envia o estado do mundo (inimigos, ondas)
      socket.to(roomCode).emit("syncWorld", worldState);
    });

    socket.on("playerAction", ({ roomCode, action }) => {
      socket.to(roomCode).emit("remoteAction", { id: socket.id, ...action });
    });

    socket.on("disconnecting", () => {
      for (const roomCode of socket.rooms) {
        if (rooms[roomCode]) {
          rooms[roomCode].players = rooms[roomCode].players.filter(id => id !== socket.id);
          if (rooms[roomCode].players.length === 0) {
            delete rooms[roomCode];
          } else if (rooms[roomCode].host === socket.id) {
            rooms[roomCode].host = rooms[roomCode].players[0];
            io.to(rooms[roomCode].host).emit("becomeHost");
          }
          io.to(roomCode).emit("playerLeft", socket.id);
        }
      }
    });
  });

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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
