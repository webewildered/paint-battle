import { Rules, Action, Reveal, Game } from './game';
import { Socket, Server } from 'socket.io';
import { GameEvent, GameLog } from './protocol';

module.exports = function(http: Server)
{
    var io = require('socket.io')(http);
    var rooms = new Map<string, Room>();

    class Player
    {
        constructor(public name: string, public key: string, public socket: Socket) {} 
    }

    class Room
    {
        key: string;
        players: Player[];
        ready: number;
        game: Game|undefined;
        log: GameEvent[] = [];
        reveals: Reveal[] = [];

        constructor(key: string)
        {
            this.key = key;
            this.players = [];
            this.ready = 0;
        }

        getPlayerIdFromKey(key: string)
        {
            for (let i = 0; i < this.players.length; i++)
            {
                if (this.players[i].key === key)
                {
                    return i;
                }
            }
            return -1;
        }

        getPlayerId(socket: Socket)
        {
            for (let i = 0; i < this.players.length; i++)
            {
                if (this.players[i].socket === socket)
                {
                    return i;
                }
            }
            return -1;
        }

        broadcastMessage(event: string, ...args: any[])
        {
            this.relayMessage(undefined, event, ...args);
        }

        relayMessage(source: Player|undefined, event: string, ...args: any[])
        {
            if (this.game)
            {
                this.log.push(new GameEvent(event, args));
            }
            this.broadcast((socket: Socket, name: string) =>
            {
                socket.emit(event, ...args);
            }, source);
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

    const keyLength = 6;
    function makeKey(): string
    {
        const keyChars = 'bcdfghjklmnpqrstvwxyz';
        let key = '';
        for (let i = 0; i < keyLength; i++)
        {
            key += keyChars[Math.floor(Math.random() * keyChars.length)];
        }
        return key;
    };

    // When a player connects
    io.on('connection', (socket: Socket) => 
    {
        // When a player joins or creates a room
        socket.on('join', (name: string, keyIn: string | undefined, playerKeyIn: string | undefined) =>
        {
            // Find or create the room
            const tries = 5;
            let joinRoom: Room|undefined;
            let key: string = '';
            if (!keyIn || keyIn.length === 0)
            {
                // Generate a random key
                for (let i = 0; i < tries; i++)
                {
                    key = makeKey();
                    if (!rooms.has(key)) // Check for key collision
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
            else if (keyIn.length === keyLength)
            {
                key = keyIn.toLowerCase();
                joinRoom = rooms.get(key);
            }
            
            // If the room wasn't found, return an error
            if (!joinRoom)
            {
                socket.emit('error');
                return;
            }
            
            let room: Room = joinRoom;

            // Listen for game events from the player's socket
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
                    //room.game.removePlayer(playerId);
                }
                else
                {
                    // Remove the player completely
                    room.players.splice(playerId, 1);
                }
                
                // Notify the other players
                room.broadcastMessage('removePlayer', playerId);
            });

            socket.on('play', (action: Action) =>
            {
                let playerId = room.getPlayerId(socket);
                if (playerId < 0)
                {
                    console.log('play from unknown socket');
                    return;
                }

                let game = room.game;
                if (!game || game.currentPlayer !== playerId)
                {
                    console.log(key + ':' + playerId + ' play error');
                    return;
                }

                // Try to play the action
                let step;
                try
                {
                    action.reveals = []; // Client may not send the server reveals
                    step = game.play(action);
                    if (!step) { throw new Error('no step'); }
                }
                catch (error)
                {
                    // Failed - bug or cheating
                    console.log(key + ':' + playerId + ' play error ' + error);
                    room.reveals = [];
                    return;
                    // TODO -- then what, DC the player?
                }

                // Run the action to completion
                while (step()) {}

                // Forward the action to the other players
                action.reveals = room.reveals;
                room.relayMessage(room.players[playerId], 'play', action);
                room.reveals = [];
            });
            
            // If the game already began, try to rejoin the player
            if (room.game)
            {
                let game = room.game;
                // Generate the log
                let names: string[] = [];
                for (const player of room.players)
                {
                    names.push(player.name);
                }
                let log = new GameLog(names, game.rules, room.log);

                let playerId = (playerKeyIn && playerKeyIn.length === keyLength) ? room.getPlayerIdFromKey(playerKeyIn) : -1;
                if (playerId < 0)
                {
                    // Return the log for debugging
                    socket.emit('log', log);
                    return;
                }

                // Replay the game messages for the rejoined player
                let player = room.players[playerId];
                player.socket = socket;
                socket.emit('join', key, playerKeyIn, names.slice(0, playerId));
                for (let i = playerId + 1; i < room.players.length; i++)
                {
                    socket.emit('addPlayer', room.players[i].name);
                }
                socket.emit('start', game.rules);
                socket.on('ready', () =>
                {
                    // Notify the player of cards in their hand
                    for (const cardId of game.players[])

                    // Notify the player of all events preceding the current turn
                    for (const event of log.events)
                    {
                        socket.emit(event.event, ...event.args);
                    }
                });

                return;
            }

            // Check that a valid name was provided
            if (!name || typeof(name) !== 'string' || name.length === 0)
            {
                socket.emit('error');
                return;
            }

            // Notify the other players in the room and collect their names
            let playerNames: string[] = [];
            room.broadcast((socket: Socket, playerName: string) =>
            {
                socket.emit('addPlayer', name);
                playerNames.push(playerName);
            });

            // Generate a key for the new player
            let playerKey: string | undefined;
            for (let i = 0; i < tries; i++)
            {
                playerKey = makeKey();
                if (room.getPlayerIdFromKey(playerKey) < 0)
                {
                    break;
                }
                playerKey = undefined;
            }
            if (!playerKey)
            {
                socket.emit('error');
                return;
            }

            // Send the joining player confirmation and the other players' names
            socket.emit('join', key, playerKey, playerNames);
            room.players.push(new Player(name, playerKey, socket));

            // Listen for game start
            socket.on('start', (rulesIn: Rules) =>
            {
                // Validate rules
                let rules: Rules = {
                    blocking: (rulesIn && rulesIn.blocking),
                    size: (rulesIn && rulesIn.size > 0 && rulesIn.size < 600) ? rulesIn.size: 299
                };

                // Check if the sender is host
                let playerId = room.getPlayerId(socket);
                if (playerId !== 0)
                {
                    console.log('received start message from a non-host player');
                    return;
                }
                
                // Broadcast the start message
                room.broadcastMessage('start', rules);
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

                game.on('deal', (playerId: number, cardId: number) =>
                {
                    let player = room.players[playerId];
                    player.socket.emit('reveal', new Reveal(cardId, game.shuffle[cardId]));
                    console.log(key + ':' + playerId + ' reveal ' + cardId);
                });

                game.on('reveal', (cardId: number) =>
                {
                    room.reveals.push({cardId:cardId, deckId:game.shuffle[cardId]});
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
                if (room.ready === room.players.length)
                {
                    room.game.begin();
                    room.broadcastMessage('ready');
                }
            });
        });
    });
};