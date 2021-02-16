import { Game } from './game';
import { Socket } from 'socket.io';

module.exports = function(http: any) //TODO.ts http type
{
    var io = require('socket.io')(http);
    var rooms = new Map<string, Room>();

    class Player
    {
        name: string;
        socket: Socket;
        
        constructor(name: string, socket: Socket)
        {
            this.name = name;
            this.socket = socket;
        }
    }

    class Room
    {
        key: string;
        players: Player[];
        ready: number;
        game: Game|undefined;

        constructor(key: string)
        {
            this.key = key;
            this.players = [];
            this.ready = 0;
        }

        getPlayerId(socket: Socket)
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

        // Call f for each connected player except sourcePlayer 
        broadcast(f: (socket: Socket, name: string) => any, sourcePlayer: Player|undefined = undefined)
        {
            for (const player of this.players)
            {
                if (player.socket && player !== sourcePlayer)
                {
                    f(player.socket, player.name);
                }
            }
        }
    }

    // When a player connects
    io.on('connection', (socket: Socket) => 
    {
        // When a player joins or creates a room
        socket.on('join', (name, key) =>
        {
            const keyLength = 6;
            const keyChars = 'bcdfghjklmnpqrstvwxyz';

            // Find or create the room
            let joinRoom: Room|undefined;
            if (key.length == 0)
            {
                // Generate a random key
                const tries = 5;
                for (let i = 0; i < tries; i++)
                {
                    for (let i = 0; i < keyLength; i++)
                    {
                        key += keyChars[Math.floor(Math.random() * keyChars.length)];
                    }

                    // Check for key collision
                    if (!rooms.has(key))
                    {
                        // Create the room
                        joinRoom = new Room(key);
                        rooms.set(key, joinRoom);
                        break;
                    }
                    
                    // Try again
                    key = '';
                }
            }
            else if (key.length == 6)
            {
                key = key.toLowerCase();
                joinRoom = rooms.get(key);
            }
            
            // If the room wasn't found or the game already started, give up
            if (!joinRoom || joinRoom.game)
            {
                socket.emit('error');
                return;
            }
            let room: Room = joinRoom;

            // Notify the other players in the room and collect their names
            let playerNames: string[] = [];
            room.broadcast((socket: Socket, playerName: string) =>
            {
                socket.emit('addPlayer', name);
                playerNames.push(playerName);
            });

            // Send the joining player confirmation and the other players' names
            socket.emit('join', key, playerNames);
            room.players.push(new Player(name, socket));

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
                
                console.log(key + ':' + playerId + ' disconnect');

                // Remove the player from the room
                if (room.game)
                {
                    // Notify the game to skip the player
                    room.game.removePlayer(playerId);
                }
                else
                {
                    // Remove the player completely
                    room.players.splice(playerId, 1);
                }
                
                // Notify the other players
                room.broadcast((socket: Socket) => socket.emit('removePlayer', playerId));
            });

            // Listen for game start
            socket.on('start', (rulesIn) =>
            {
                // Validate rules
                let rules = {
                    blocking: (rulesIn && rulesIn.blocking)
                };

                // Check if the sender is host
                let playerId = room.getPlayerId(socket);
                if (playerId != 0)
                {
                    console.log('received start message from a non-host player');
                    return;
                }
                
                // Broadcast the start message
                room.broadcast((socket: Socket) => socket.emit('start', rules));
                console.log(key + ':' + playerId + ' start');

                // Ignore duplicate messages
                if (room.game)
                {
                    console.log('received duplicate start message');
                    return;
                }

                // Close the room to new entrants/starts
                room.broadcast((socket: Socket) => socket.removeAllListeners('start'));

                //
                // Create the game and listen for its events
                //

                const shuffle = true;
                let game = new Game(room.players.length, shuffle, rules);
                room.game = game;
                let reveals: any[] = []; // List of reveals to send with the next play message
                // TODO.ts reveal type

                game.on('deal', (playerId: number, cardId: number) =>
                {
                    let player = room.players[playerId];
                    player.socket.emit('reveal', cardId, game.shuffle[cardId]);
                    console.log(key + ':' + playerId + ' reveal ' + cardId);
                });

                game.on('reveal', (cardId: number) =>
                {
                    reveals.push({cardId:cardId, deckId:game.shuffle[cardId]});
                });

                game.on('beginTurn', (playerId: number) =>
                {
                    // On a player's turn, listen for their action
                    let player = room.players[playerId];
                    player.socket.on('play', (action) =>
                    {
                        console.log(key + ':' + playerId + ' play');

                        // Stop listening
                        player.socket.removeAllListeners('play');

                        // Try to play the action
                        let step;
                        try
                        {
                            step = game.play(action);
                            if (!step) { throw new Error('no step'); }
                        }
                        catch (error)
                        {
                            // Failed - bug or cheating
                            console.log(key + ':' + playerId + ' play error ' + error);
                            reveals.length = 0;
                            return;
                            // TODO -- then what, DC the player?
                        }

                        // Run the action to completion
                        while (step()) {}

                        // Forward the action to the other players
                        action.reveals = reveals;
                        room.broadcast((socket: Socket) => socket.emit('play', action), player);
                        reveals.length = 0;
                    });
                });
            });

            socket.on('ready', () =>
            {
                if (!room.game)
                {
                    console.log(key + ':' + room.getPlayerId(socket) + ' ready error');
                    return;
                }
                console.log(key + ':' + room.getPlayerId(socket) + ' ready');
                room.ready++;
                if (room.ready == room.players.length)
                {
                    room.game.begin();
                    room.broadcast((socket: Socket) => socket.emit('ready'));
                }
            });
        });
    });
}