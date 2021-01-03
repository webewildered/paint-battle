// This requires the socket.io.js client in the global scope
const Client = require('./client.js');

// Entry point.
// Manages the lobby UI in index.html.
$(function()
{
    let host = false;
    let socket = null;
    let key = '';
    let localPlayerId = -1;
    let lobbyPlayers = [];

    //
    // Helper functions
    //

    function addPlayer(name)
    {
        let li = $('<li>').text(name);
        if (lobbyPlayers.length == 0)
        {
            li.append(' (host)');
        }
        $('#playerList').append(li);
        lobbyPlayers.push({name: name, li: li});
    }

    function becomeHost()
    {
        $('#startForm').show();
        $('#startForm').submit(function()
        {
            socket.emit('start');
            return false; // Don't reload the page
        });
    }

    function startGame()
    {
        $('#lobby').hide();
        $('#playerList').empty();

        let playerNames = [];
        lobbyPlayers.forEach(player => playerNames.push(player.name));
        client = new Client();
        client.begin(socket, playerNames, localPlayerId);
    }
    
    // Join an existing lobby or create a new one
    socket = io();
    let joinForm = $('#joinForm');
    let localForm = $('#localForm');
    key = document.location.search.slice(1);
    if (key.length == 6)
    {
        host = false;
        $('#joinButton').text("Join game");
    }
    else
    {
        // Testing option - quick start a local game
        localForm.show();
        localForm.submit(function()
        {
            socket.close();
            joinForm.hide();
            localForm.hide();
            let numPlayers = $('#localPlayersInput').val();
            localPlayerId = -1;
            lobbyPlayers = [];
            for (let i = 0; i < numPlayers; i++)
            {
                addPlayer('Player ' + (i + 1));
            }
            startGame();
            return false;
        });
        host = true;
    }
    
    // Show the lobby once the player joins
    joinForm.show();
    joinForm.submit(function()
    {
        joinForm.hide();
        localForm.hide();
        
        let playerName = $('#nameInput').val();

        // When I enter the lobby
        socket.on('join', (gameKey, players) =>
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
            if (players.length == 0)
            {
                becomeHost();
            }
        });

        // When another player enters the lobby
        socket.on('addPlayer', (name) =>
        {
            addPlayer(name);
        });

        // When another player leaves the lobby
        socket.on('removePlayer', (id) =>
        {
            lobbyPlayers[id].li.remove();
            lobbyPlayers.splice(id, 1);
            if (id == 0)
            {
                lobbyPlayers[0].li.append(' (host)');
            }
            if (localPlayerId > id)
            {
                localPlayerId--;
                if (localPlayerId == 0)
                {
                    becomeHost();
                }
            }
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
        socket.on('start', startGame);

        // Send first message to the server
        socket.emit('join', playerName, key);

        // Don't reload the page
        return false;
    });
});
