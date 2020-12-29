var Board = require('./www/board.js')();
var Game = require('./www/game.js')();
var app = require('express')();
var express = require('express');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var rooms = new Map();

app.use(express.static('C:/Users/maaberne/Documents/Paint/www'));

class Room
{
    constructor()
    {
        this.players = [];
        this.reveals = [];
        this.started = false;
    }

    getPlayerId(socket)
    {
        for (let i = 0; i < this.players.length; i++)
        {
            if (this.players[i].socket == socket)
            {
                return i;
            }
        }

        return -1;
    }

    broadcast(f, sourcePlaye = null)
    {
        // Notify all of the other players, except for the one with the given socket
        this.players.forEach(player => 
        {
            if (player.socket != null && player != sourcePlaye) { f(player); }
        });
    }

    // Listener interface
    updateBoard() {}

    deal(playerId, cardId)
    {
        // Tell the player their card
        this.players[playerId].socket.emit('reveal', cardId, this.game.shuffle[cardId]);
    }

    discard(cardId) {}

    reveal(cardId, deckId)
    {
        this.reveals.push({cardId:cardId, deckId:deckId});
    }

    beginTurn(playerId)
    {
        // On a player's turn, listen for their action
        let player = this.players[playerId];
        player.socket.on('play', (action) =>
        {
            // Stop listening
            player.socket.removeAllListeners('play');

            // Try to play the action
            try
            {
                this.game.play(action);   
            }
            catch (error)
            {
                // Failed - bug or cheating
                console.log('game.play(): ' + error);
                this.reveals.length = 0;
                return;
                // TODO -- then what, DC the player?
            }

            // Forward the action to the other players
            action.reveals = this.reveals;
            this.broadcast(player => player.socket.emit('play', action), player);
            this.reveals.length = 0;
        });
    }
}

// When a player connects
io.on('connection', (socket) => 
{
    let room = null;
    
    // When a player joins or creates a room
    socket.on('join', (name, key) =>
    {
        // Find or create the room
        if (key.length == 0)
        {
            // Generate a random key
            const keyChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            for (let i = 0; i < 5; i++)
            {
                for (let i = 0; i < 6; i++)
                {
                    key += keyChars[Math.floor(Math.random() * keyChars.length)];
                }

                // Check for key collision
                if (rooms[key] == null)
                {
                    break;
                }
                
                key = '';
            }

            // Create the room
            room = new Room();
            rooms[key] = room;
        }
        else if (key.length == 6)
        {
            room = rooms[key];
        }
        
        // If the room wasn't found or the game already started, give up
        if (room == null || room.started)
        {
            socket.emit('error');
            return;
        }

        // Notify the other players in the room and collect their names
        let playerNames = [];
        room.broadcast((player) =>
        {
            player.socket.emit('addPlayer', name);
            playerNames.push(player.name);
        });

        // Join the room
        socket.emit('join', key, playerNames);
        room.players.push({socket: socket, name: name, connected: true});

        // Notify the other players in case of disconnect
        socket.on('disconnect', () =>
        {
            // Find the player
            let playerId = room.getPlayerId(socket);
            if (playerId < 0)
            {
                console.log('disconnecting player not found in room');
                return;
            }

            // Remove the player from the room
            if (room.started)
            {
                // Mark the player disconnected
                room.players[playerId].socket = null;
                room.game.removePlayer(playerId);
            }
            else
            {
                // Remove the player completely
                room.players.splice(playerId, 1);
            }
            
            // Notify the other players
            room.broadcast(player => player.socket.emit('removePlayer', playerId));
        });

        // Listen for game start
        socket.on('start', () =>
        {
            // Check if the sender is host
            let playerId = room.getPlayerId(socket);
            if (playerId == 0)
            {
                room.broadcast(player => player.socket.emit('start'));
            }
            else
            {
                console.log('received start message from a non-host player');
                return;
            }

            // Ignore duplicate messages
            if (room.started)
            {
                console.log('received duplicate start message');
                return;
            }

            // Close the room to new entrants/starts
            room.started = true;
            room.broadcast(player => player.socket.removeAllListeners('start'));

            // Create the game
            const shuffle = true;
            room.game = new Game(room, room.players.length, shuffle);
            room.game.begin();
        });
    });
});

http.listen(3000, () => 
{
    console.log('listening on *:3000');
});

