// server/index.js (MODIFIED)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Objek untuk menyimpan data semua pengguna yang terhubung
const users = {};

io.on('connection', (socket) => {
  console.log(`Pengguna terhubung: ${socket.id}`);

  // 1. Saat pengguna baru bergabung
  // Inisialisasi data pengguna
  users[socket.id] = {
    id: socket.id,
    latitude: null, // Lokasi awal null
    longitude: null,
  };
  
  // Kirim daftar semua pengguna yang sudah ada ke pengguna baru
  socket.emit('initialUsers', users);

  // Beri tahu semua pengguna lain bahwa ada pengguna baru yang bergabung
  socket.broadcast.emit('userJoined', users[socket.id]);

  // 2. Saat menerima pesan chat (bisa teks atau lokasi)
  socket.on('chatMessage', (msg) => {
    console.log(`Pesan diterima dari ${socket.id}:`, msg.type);
    // Siarkan pesan ke semua pengguna termasuk pengirim
    io.emit('newChatMessage', msg);
  });

  // 3. Saat menerima update lokasi real-time
  socket.on('locationUpdate', (coords) => {
    if (users[socket.id]) {
      users[socket.id].latitude = coords.latitude;
      users[socket.id].longitude = coords.longitude;
      // Siarkan update lokasi ke semua pengguna
      io.emit('locationUpdate', users[socket.id]);
    }
  });

   // --- BARU: MENANGANI KETIKA PENGGUNA BERHENTI BERBAGI ---
  socket.on('sharingStopped', ({ msgId }) => {
    // Siarkan ke semua pengguna bahwa sesi untuk bubble dengan ID ini telah berakhir
    io.emit('locationShareEnded', { msgId });
  });

  // 4. Saat pengguna terputus
  socket.on('disconnect', () => {
    console.log(`Pengguna terputus: ${socket.id}`);
    delete users[socket.id];
    // Beri tahu semua pengguna lain bahwa pengguna ini telah pergi
    io.emit('userDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});