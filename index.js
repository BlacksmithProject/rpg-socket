require('dotenv').config();

const app = require('express')();
const cors = require('cors');
const https = require('https');
const querystring = require('querystring');

const server = require('http').createServer(app);

app.use(cors((req) => {
  return {
    origin: req.headers.origin
  }
}));

const io = require('socket.io')(server, {
  serveClient: false,
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false
});

let games = [];
let playerSockets = {};

io.on('connection', (socket) => {
  const gameId = socket.handshake.query.gameId;
  socket.on('message', function(message) {
    // On first player
    if (!playerSockets.hasOwnProperty(socket.id)) {
      playerSockets[socket.id] = [];
    }
    if (!games.hasOwnProperty(gameId)) {
      games[gameId] = new Set();
    }

    // Add player to playerSockets and games
    playerSockets[socket.id][gameId] = message.player;
    games[gameId].add(message.player);

    // Send message to Mercure
    sendMessage(gameId, Array.from(games[gameId]));
  })
  socket.on('disconnect', function() {
    // On server restart, no one is registered, on client's reload, disconnect may be triggered with no player registered
    // Just making sure there is something to remove before removing attempt
    if (
      !playerSockets.hasOwnProperty(socket.id)
      || !playerSockets[socket.id].hasOwnProperty(gameId)
      || !games.hasOwnProperty(gameId)
    ) {
      return;
    }

    // Remove player from playerSockets and games
    games[gameId].delete(playerSockets[socket.id][gameId]);
    delete playerSockets[socket.id][gameId];

    // Send message to mercure
    sendMessage(gameId, Array.from(games[gameId]));
  })
});

server.listen(3000);

function sendMessage(gameId, players) {
  const postData = querystring.stringify({
    'topic': `game/${gameId}/${process.env.BASE_TOPIC}`,
    'data': JSON.stringify({ players: players }),
  });

  const req = https.request({
    hostname: process.env.MERCURE_HOSTNAME,
    port: '443',
    path: process.env.MERCURE_PATH,
    method: 'POST',
    headers: {
        Authorization: `Bearer ${process.env.MERCURE_JWT}`,
        // the JWT must have a mercure.publish key containing an array of targets (can be empty for public updates)
        // the JWT key must be shared between the hub and the server
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
    }
  }, /* optional response handler */);
  req.write(postData);
  req.end();
}