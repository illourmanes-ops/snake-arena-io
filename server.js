const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const MAP_SIZE = 5000;
const ORB_COUNT = 200;

let rooms = {
  default: {
    players: {},
    orbs: []
  }
};

let currentRoom = 'default';

// Créer les orbes au start
for (let i = 0; i < ORB_COUNT; i++) {
  rooms[currentRoom].orbs.push({
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    size: 5 + Math.random() * 5,
    color: `hsl(${Math.random()*360},100%,50%)`
  });
}

io.on('connection', (socket) => {
  console.log('Joueur connecté:', socket.id);

  socket.on('join', (data) => {
    rooms[currentRoom].players[socket.id] = {
      id: socket.id,
      x: MAP_SIZE/2 + Math.random()*200-100,
      y: MAP_SIZE/2 + Math.random()*200-100,
      angle: 0,
      segments: [],
      size: 12,
      score: 0,
      name: data.name? data.name.substring(0,12) : 'Anon',
      speed: 2.5,
      color: data.color || `hsl(${Math.random()*360},100%,50%)`
    };
    socket.join(currentRoom);
    socket.emit('state', rooms[currentRoom]);
  });

  socket.on('move', (angle) => {
    if (rooms[currentRoom].players[socket.id]) {
      rooms[currentRoom].players[socket.id].angle = angle;
    }
  });

  socket.on('boost', (boosting) => {
    if (rooms[currentRoom].players[socket.id]) {
      rooms[currentRoom].players[socket.id].speed = boosting? 5 : 2.5;
    }
  });

  socket.on('eatOrb', (orbIndex) => {
    const player = rooms[currentRoom].players[socket.id];
    const orbs = rooms[currentRoom].orbs;
    if (player && orbs[orbIndex]) {
      player.score += Math.floor(orbs[orbIndex].size);
      player.size += 0.2;
      orbs[orbIndex] = {
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        size: 5 + Math.random() * 5,
        color: `hsl(${Math.random()*360},100%,50%)`
      };
    }
  });

  socket.on('died', (killerId) => {
    const victim = rooms[currentRoom].players[socket.id];
    const killer = rooms[currentRoom].players[killerId];
    if (victim && killer) {
      io.to(currentRoom).emit('killFeed', {
        killer: killer.name,
        victim: victim.name,
        killerColor: killer.color
      });
      io.to(socket.id).emit('dead', { score: victim.score });
      delete rooms[currentRoom].players[socket.id];
    }
  });

  socket.on('disconnect', () => {
    delete rooms[currentRoom].players[socket.id];
  });
});

// Boucle du jeu : mouvement + envoi état
setInterval(() => {
  const room = rooms[currentRoom];
  for (let id in room.players) {
    const p = room.players[id];
    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;
    p.x = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_SIZE - p.size, p.y));

    p.segments.unshift({x: p.x, y: p.y});
    if (p.segments.length > p.size * 3) p.segments.pop();
  }
  io.to(currentRoom).emit('state', room);
}, 33);

http.listen(PORT, () => {
  console.log(`🐍 Snake Arena.IO running on ${PORT}`);
});
