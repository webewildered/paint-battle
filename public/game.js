const CardType = require('./CardType.js');
const Board = require('./board.js');
const EventEmitter = require('events');

//
// Events
// updateBoard(): this.board has changed
// reveal(cardId, deckId): cardId has been revealed to all players, deckId is its index in this.deck
// deal(playerId, cardId): cardId has been dealt to playerId
// play(playerId, cardId): playerId has played and discarded cardId
// beginTurn(playerId): playerId's turn has begun
//
class Game extends EventEmitter
{
    constructor(numPlayers, shuffle)
    {
        super();

        // Constants
        this.size = 299; // Gameboard dimension

        // Initialize the game board
        this.board = new Board(this.size, this.size);
        this.board.clear(numPlayers);

        if (!(numPlayers >= 1 && numPlayers <= 6))
        {
            throw 'Unsupported player count ' + numPlayers;
        }

        // Make a deck of cards
        this.deck = [];
        const countLow = [0, 3, 3, 4, 5, 6, 7][numPlayers];
        const countMed = [0, 5, 5, 5, 6, 7, 8][numPlayers];
        const countHigh = [0, 7, 7, 7, 8, 8, 9][numPlayers];

        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.ERASER, radius: 30.5, name: 'Eraser' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.BOX, width: 45, height: 21, name: 'Box' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.BOX, width: 21, height: 45, name: 'Box' }));
        this.deck = this.deck.concat(Array(countHigh).fill({ type: CardType.LINE, pixels: 140, name: 'Line' }));
        this.deck = this.deck.concat(Array(countMed).fill({ type: CardType.FILL, radius: 4, name: 'Grow' }));
        this.deck = this.deck.concat(Array(countHigh).fill({ type: CardType.PAINT, radius: 4, pixels: 600, name: 'Brush' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.POLY, sides: 3, radius: 25.5, angle: 0.2, name: 'Polygon' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.POLY, sides: 5, radius: 23.5, angle: 0.4, name: 'Polygon' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.POLY, sides: 7, radius: 21.5, angle: 0.6, name: 'Polygon' }));

        // Shuffle the deck on server (shuffle = true), mark all cards hidden on client (shuffle = false)
        let count = this.deck.length;
        this.shuffle = new Array(count);
        for (let i = 0; i < count; i++)
        {
            this.shuffle[i] = shuffle ? i : -1;
        }
        if (shuffle)
        {
            for (let i = 0; i < count; i++)
            {
                let j = Math.floor(i + Math.random() * (count - i));
                let temp = this.shuffle[i];
                this.shuffle[i] = this.shuffle[j];
                this.shuffle[j] = temp;
            }
        }

        // Initialize the draw pile
        count -= count % numPlayers; // Equal number of cards for each player
        this.pile = new Array(count);
        for (let i = 0; i < count; i++)
        {
            this.pile[i] = i;
        }

        // Create the players
        this.players = new Array(numPlayers);
        for (let i = 0; i < numPlayers; i++)
        {
            this.players[i] = { hand: [], disconnected: false };
        }
        this.numConnected--;
    }

    getCard(cardId)
    {
        return this.deck[this.shuffle[cardId]]
    }

    //
    // EXTERNAL functions
    //

    begin()
    {
        // Put some starting spots on the board
        let numPlayers = this.players.length;
        let center = Math.floor(this.size / 2); // Gameboard middle pixel index
        for (let i = 0; i < numPlayers; i++)
        {
            let x = Math.floor(center + Math.cos(i * Math.PI * 2 / numPlayers) * this.size / 3);
            let y = Math.floor(center + Math.sin(i * Math.PI * 2 / numPlayers) * this.size / 3);
            this.board.circle(x, y, 8.5, i);
        }

        this.emit('updateBoard');

        // Deal cards to each player
        for (let i = 0; i < this.players.length; i++)
        {
            this.deal(i);
            this.deal(i);
            this.deal(i);
        }

        // Start the first player's turn
        this.currentPlayer = -1;
        this.nextTurn();
    }

    reveal(cardId, deckId)
    {
        this.shuffle[cardId] = deckId;
        this.emit('reveal', cardId);
    }

    // returns true on success, false on failure
    play(action)
    {
        // Make sure the card belongs to the current player
        if (!this.players[this.currentPlayer].hand.includes(action.cardId))
        {
            throw 'Game.play() failed';
        }

        // Get the card data
        let card = this.getCard(action.cardId);
        if (card == null)
        {
            throw 'Game.play() failed';
        }

        // Perform the right action for the card
        switch (card.type)
        {
            case CardType.CIRCLE:
            case CardType.ERASER:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                let color = (card.type == CardType.CIRCLE) ? this.currentPlayer : this.players.length;
                this.board.circle(action.x, action.y, card.radius, color);
                break;
            case CardType.BOX:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                this.board.box(action.x, action.y, card.width, card.height, this.currentPlayer);
                break;
            case CardType.POLY:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                this.board.poly(action.x, action.y, card.sides, card.radius, card.angle, this.currentPlayer);
                break;
            case CardType.LINE:
                if (!this.startOk(action.x, action.y) || action.x2 == null || action.y2 == null)
                {
                    throw 'Game.play() failed';
                }
                this.board.line(action.x, action.y, action.x2, action.y2, card.pixels, this.currentPlayer);
                break;
            case CardType.PAINT:
                if (action.points == null || action.points.length == 0 || action.points.length > card.pixels || !this.startOk(action.points[0].x, action.points[0].y))
                {
                    throw 'Game.play() failed';
                }
                for (let i = 1; i < action.points.length; i++)
                {
                    if (!this.coordsOk(action.points[i].x, action.points[i].y))
                    {
                        throw 'Game.play() failed';
                    }
                }
                let p = card.pixels;
                let r = card.radius;
                let paintBoard = new Board(this.size, this.size);
                paintBoard.clear(this.players.length);
                for (let i = 0; i < action.points.length; i++)
                {
                    if (p <= 0)
                    {
                        throw 'Game.play() failed'; // too many points
                    }

                    let j = Math.max(i - 1, 0);
                    let p2 = paintBoard.paint(action.points[j].x, action.points[j].y, action.points[i].x, action.points[i].y, r, p, this.currentPlayer);
                    p = Math.min(p2, p - 1);
                }
                this.board.add(paintBoard, this.currentPlayer);
                break;
            case CardType.FILL:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                this.board.flood(action.x, action.y, card.radius, this.currentPlayer);
                break;
            default:
                throw 'Game.play() failed';
        }

        this.emit('updateBoard');
        this.emit('reveal', action.cardId);
        
        // Remove the card from the player's hand
        let player = this.players[this.currentPlayer];
        player.hand.splice(player.hand.indexOf(action.cardId), 1);
        this.emit('play', this.currentPlayer, action.cardId);

        this.nextTurn();
    }

    // Handle disconnects
    removePlayer(playerId)
    {
        if (--this.numConnected == 1)
        {
            // TODO game is over
        }

        this.players[playerId].disconnected = true;

        // TODO - handle if it's that player's turn
    }

    //
    // INTERNAL functions
    //

    // Deal one card from the pile to a player
    deal(playerId)
    {
        if (this.pile.length)
        {
            let cardId = this.pile.pop();
            this.emit('deal', playerId, cardId);
            this.players[playerId].hand.push(cardId);
        }
    }

    nextTurn()
    {
        for (let i = 0; i < this.players.length; i++)
        {
            this.currentPlayer = (this.currentPlayer + 1) % this.players.length;             
            if (!this.players[this.currentPlayer].disconnected) // just skip DC'd players
            {
                this.deal(this.currentPlayer);
                this.emit('beginTurn', this.currentPlayer);
                break;
            }
        }
    }

    coordsOk(x, y)
    {
        return x > -100000 && x < 100000 && y > -100000 && y < 100000;
    }

    startOk(x, y)
    {
        return (this.board.get(x, y) == this.currentPlayer || this.board.count(this.players.length + 1)[this.currentPlayer] == 0);
    }
}

module.exports = Game;
