// This requires the socket.io.js client in the global scope
import { GameEvent, GameLog } from './protocol';
import { Client } from './client';
import { Rules } from './game';
import { Socket } from 'socket.io-client';
import * as io from 'socket.io-client';
import { EventEmitter } from 'events';

type Socket = SocketIOClient.Socket;

class FakeSocket implements SocketIOClient.Emitter
{
    private emitter: EventEmitter;

    constructor()
    {
        this.emitter = new EventEmitter();
    }

    on( event: string, fn: Function ): SocketIOClient.Emitter
    {
        this.emitter.on(event, fn as (...args: any[]) => void);
        return this;
    }

    emit( event: string, ...args: any[] ): SocketIOClient.Emitter
    {
        this.emitter.emit(event, ...args);
        return this;
    }

    // Unimplemented stuff
    addEventListener( event: string, fn: Function ): SocketIOClient.Emitter { throw new Error('Not implemented'); }
    once( event: string, fn: Function ): SocketIOClient.Emitter { throw new Error('Not implemented'); }
    off( event: string, fn?: Function ): SocketIOClient.Emitter { throw new Error('Not implemented'); }
    removeListener( event: string, fn?: Function ): SocketIOClient.Emitter { throw new Error('Not implemented'); }
    removeEventListener( event: string, fn?: Function ): SocketIOClient.Emitter { throw new Error('Not implemented'); }
    removeAllListeners(): SocketIOClient.Emitter { throw new Error('Not implemented'); }
    listeners( event: string ):Function[] { throw new Error('Not implemented'); }
    hasListeners( event: string ):boolean { throw new Error('Not implemented'); }
}

class LobbyPlayer
{
    constructor(name: string, li: JQuery<HTMLElement>)
    {
        this.name = name;
        this.li = li;
    }
    name: string;
    li: JQuery<HTMLElement>;
}

// Entry point.
// Manages the lobby UI in index.html.
$(function()
{
    let host = false;
    let key = '';
    let localPlayerId = -1;
    let lobbyPlayers: LobbyPlayer[] = [];
    let webSocket = io() as Socket;
    let socket: SocketIOClient.Emitter = webSocket;
    
    //
    // Helper functions
    //

    function addPlayer(name: string)
    {
        let li = $('<li>').text(name);
        if (lobbyPlayers.length === 0)
        {
            li.append(' (host)');
        }
        $('#playerList').append(li);
        lobbyPlayers.push(new LobbyPlayer(name, li));
    }

    function getRules(): Rules
    {
        let scale = $('#scaleRule').val() as number;
        let size = Math.round(600 / scale);
        size -= (1 - size % 2); // make odd
        return {
            blocking: $('#blockingRule').is(':checked'),
            size: size
        };
    }

    function becomeHost()
    {
        $('#rulesForm').show();
        $('#startForm').show().on('submit', function()
        {
            if (!socket)
            {
                throw new Error('becomeHost() failed');
            }
            socket.emit('start', getRules());
            return false; // Don't reload the page
        });
    }

    function startGame(playerNames: string[], localPlayerId: number, rules: Rules)
    {
        $('#lobby').hide();
        $('#rulesForm').hide();
        $('#playerList').empty();

        new Client(socket, playerNames, localPlayerId, rules);
    }
    
    // Join an existing lobby or create a new one
    key = document.location.search.slice(1);
    if (key.length === 6)
    {
        host = false;
        $('#joinButton').text("Join game");
    }
    else
    {
        let hideAll = () =>
        {
            $('#joinForm').hide();
            $('#localForm').hide();
            $('#rulesForm').hide();
            $('#replayForm').hide();
        };

        // Testing option - quick start a local game
        $('#rulesForm').show();
        $('#localForm').show().on('submit', () =>
        {
            hideAll();
            webSocket.close();
            let numPlayers = $('#localPlayersInput').val() as number;
            let playerNames: string[] = [];
            for (let i = 0; i < numPlayers; i++)
            {
                playerNames.push('Player ' + (i + 1));
            }
            startGame(playerNames, -1, getRules());
            return false;
        });
        host = true;

        // Testing option - replay a log of a previous game
        $('#replayForm').show();
        $('#replayFile').on('change', (event) =>
        {
            // Read the replay file
            const target = event.target as HTMLInputElement;
            if (!target.files || target.files.length !== 1)
            {
                return;
            }
            const file = target.files[0];
            if (file.type !== 'application/json')
            {
                console.log('Unexpected file type ' + file.type);
            }
            const reader = new FileReader();
            reader.addEventListener('load', (event: ProgressEvent<FileReader>) =>
            {
                if (!event.target || !event.target.result || typeof(event.target.result) !== 'string')
                {
                    console.log('Could not load file');
                    return;
                }
                let log = JSON.parse(event.target.result) as GameLog;

                hideAll();
                webSocket.close();
                let fakeSocket = new FakeSocket();
                socket = fakeSocket;

                // TODO player ID 0 so that the client's game won't shuffle, figure out a better way
                startGame(log.players, 0, log.rules);
                for (const gameEvent of log.events)
                {
                    fakeSocket.emit(gameEvent.event, ...gameEvent.args);
                }
            });
            reader.readAsText(file);
        });
    }
    
    // Show the lobby once the player joins
    $('#joinForm').show().on('submit', () =>
    {
        $('#joinForm').hide();
        $('#localForm').hide();
        
        let playerName = $('#nameInput').val() as string;

        // When I enter the lobby
        socket.on('join', (gameKey: string, players: string[]) =>
        {
            $('#lobby').show();
            key = gameKey;
            localPlayerId = players.length;
            lobbyPlayers = [];
            let url = window.location.origin + window.location.pathname + '?' + key;
            $('#gameUrl').html(url).attr('href', url);
            for (let i = 0; i < players.length; i++)
            {
                addPlayer(players[i]);
            }
            addPlayer(playerName);
            if (players.length === 0)
            {
                becomeHost();
            }
        });

        // When another player enters the lobby
        socket.on('addPlayer', (name: string) =>
        {
            addPlayer(name);
        });

        // When another player leaves the lobby
        socket.on('removePlayer', (id: number) =>
        {
            lobbyPlayers[id].li.remove();
            lobbyPlayers.splice(id, 1);
            if (id === 0)
            {
                lobbyPlayers[0].li.append(' (host)');
            }
            if (localPlayerId > id)
            {
                localPlayerId--;
                if (localPlayerId === 0)
                {
                    becomeHost();
                }
            }
        });

        socket.on('log', (log: GameLog) =>
        {
            let a = $('<a>');
            a.attr('href', 'data:application/json;charset=UTF-8,' + JSON.stringify(log));
            a.attr('download', 'gamelog_' + key + '.json');
            a.text('Download log');
            $('body').append(a);
            a[0].click();
            //a.trigger('click');
        });

        // When the server rejects the join
        socket.on('error', () =>
        {
            let url = window.location.origin + window.location.pathname;
            $('#startUrl').attr('href', url);
            $('#error').show();
        });

        // When the game begins
        // TODO - need to forbid inputs until ready.  can't send any game messages to the server until it tells us it's ready.
        socket.on('start', (rules: Rules) =>
        {
            let playerNames: string[] = [];
            lobbyPlayers.forEach(player => playerNames.push(player.name));
            startGame(playerNames, localPlayerId, rules);
        });

        // Send first message to the server
        socket.emit('join', playerName, key);

        // Don't reload the page
        return false;
    });
});
