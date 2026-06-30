const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public')); // Ton HTML va dans /public

const rooms = {};
const ORB_COUNT = 200;
const MAP_SIZE = 4000;

function createRoom(roomId) {
  rooms[roomId] = {
    players: {},
    orbs: Array.from({length: ORB_COUNT}, () => ({
      x: Math.random() * MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      size: 5 + Math.random() * 5,
      color: `hsl(${Math.random()*360},100%,50%)`
    }))
  };
}

io.on('connection', (socket) => {
  let currentRoom = 'room1';
  if (!rooms[currentRoom]) createRoom(currentRoom);

  // Nouveau joueur
  socket.on('join', (data) => {
    rooms[currentRoom].players[socket.id] = {
      id: socket.id,
      x: Math.random() * MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      angle: 0,
      segments: [{x: 0, y: 0}],
      size: 10,
      score: 0,
      name: data.name || 'Anon',
      skin: data.skin || 'Classique',
      speed: 2
    };
    socket.join(currentRoom);
  });

  // Mouvement
  socket.on('move', (angle) => {
    const p = rooms[currentRoom].players[socket.id];
    if (!p) return;
    p.angle = angle;
    p.x += Math.cos(angle) * p.speed;
    p.y += Math.sin(angle) * p.speed;
    
    // Bordure map
    p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
    p.y = Math.max(0, Math.min(MAP_SIZE, p.y));
    
    // Ajoute segment queue
    p.segments.unshift({x: p.x, y: p.y});
    if (p.segments.length > p.size * 3) p.segments.pop();
  });

  // Boost espace
  socket.on('boost', (isBoosting) => {
    const p = rooms[currentRoom].players[socket.id];
    if (!p) return;
    if (isBoosting && p.size > 10) {
      p.speed = 4;
      p.size -= 0.1; // Tu perds de la masse
    } else {
      p.speed = 2;
    }
  });

  // Manger orbe
  socket.on('eatOrb', (orbIndex) => {
    const p = rooms[currentRoom].players[socket.id];
    if (!p ||!rooms[currentRoom].orbs[orbIndex]) return;
    p.size += 0.5;
    p.score += 10;
    // Respawn orbe
    rooms[currentRoom].orbs[orbIndex] = {
      x: Math.random() * MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      size: 5 + Math.random() * 5,
      color: `hsl(${Math.random()*360},100%,50%)`
    };
  });

  // Collision = mort
  socket.on('died', (killerId) => {
    const p = rooms[currentRoom].players[socket.id];
    if (!p) return;
    io.to(currentRoom).emit('killFeed', {
      killer: rooms[currentRoom].players[killerId]?.name || 'Mur',
      victim: p.name
    });
    // Transforme le serpent en orbes
    p.segments.forEach(seg => {
      rooms[currentRoom].orbs.push({
        x: seg.x, y: seg.y, size: 8, color: '#FF0000'
      });
    });
    delete rooms[currentRoom].players[socket.id];
    socket.emit('dead', { score: p.score });
  });

  socket.on('disconnect', () => {
    if (rooms[currentRoom]?.players[socket.id]) {
      delete rooms[currentRoom].players[socket.id];
    }
  });
});

// Envoie l’état 20x/sec à tous
setInterval(() => {
  Object.keys(rooms).forEach(roomId => {
    io.to(roomId).emit('state', rooms[roomId]);
  });
}, 50);

server.listen(process.env.PORT || 3000, () => console.log('🐍 Snake Arena.IO on'));
