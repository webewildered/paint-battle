const CardType = require('./CardType.js');
const Game = require('./game.js');
const Board = require('./board.js');
const EventEmitter = require('events');

// Constants
const scale = 2; // Screen pixels per board pixel
const colors = [ // Player colors
    0x3d1defff, // player 0 rgba
    0xed0730ff, // player 1 rgba
    0x23d100ff, // etc
    0xffd800ff,
    0x9028ccff,
    0xff7c3aff,
    0xffffffff  // blank
];
const maxPlayers = 2;

let cardPalette = [
    [0x22, 0x22, 0x22, 0xff],
    [0xff, 0xff, 0xff, 0xff]
]

const cardWidth = 100;
const cardHeight = 150;
const playerHeight = cardHeight + 20;

//
// Global helpers
//

function cardName(card)
{
    return (card.name == null ? card.type : card.name);
}

// Render a board to a PIXI texture
function rtt(board, scale, palette)
{
    let options = {width: scale * board.width, height: scale * board.height};
    return PIXI.Texture.from(new PIXI.resources.BufferResource(board.render(scale, palette), options));
}

// Returns a Board representing what the card will allow the player to draw
function renderCard(card, on, off, minSize = 0)
{
    // Determine the dimensions required
    let w = 0;
    let h = 0;
    switch (card.type)
    {
        case CardType.CIRCLE:
        case CardType.PAINT:
        case CardType.POLY:
        case CardType.ERASER:
            w = Math.floor(card.radius) * 2 + 1;
            h = w;
            break;
        case CardType.BOX:
            w = Math.floor(card.width);
            h = Math.floor(card.height);
            break;
        default:
            w = minSize;
            h = minSize;
            break;
    }

    // Enforce minSize
    w = Math.max(w, minSize);
    h = Math.max(h, minSize);
    
    if (w % 2 == 0 || h % 2 == 0)
    {
        throw 'unexpected even dimension'; // unhandled ambiguity in choosing the middle pixel
    }
    
    let board = new Board(w, h);
    board.clear(off);
    let x = Math.floor((w - 1) / 2);
    let y = Math.floor((h - 1) / 2);

    switch (card.type)
    {
        case CardType.CIRCLE:
        case CardType.PAINT:
        case CardType.ERASER:
            board.circle(x, y, card.radius, on);
            break;
        case CardType.BOX:
            board.box(x, y, w, h, on);
            break;
        case CardType.POLY:
            board.poly(x, y, card.sides, card.radius, card.angle, on);
            break;
    }

    return board;
}

class Client
{
    constructor()
    {
        console.log('Client()!!!');
    }

    begin(socket, playerNames, localPlayerId)
    {
        this.socket = socket;
        this.localPlayerId = localPlayerId;

        //
        // Create the game and listen for its events
        //

        let numPlayers = playerNames.length;
        const shuffle = this.isLocalGame();
        game = new Game(numPlayers, shuffle);

        game.on('updateBoard', () =>
        {
            game.board.render(scale, this.palette, this.buffer);
            let boardSize = scale * game.size;
            let options = {width: boardSize, height: boardSize};
            let resource = new PIXI.resources.BufferResource(this.buffer, options);
            this.boardSprite.texture = PIXI.Texture.from(resource);
    
            let count = game.board.count(this.players.length + 1);
            for (let i = 0; i < this.players.length; i++)
            {
                this.players[i].setCount(count[i]);
            }
        });

        game.on('deal', (playerId, cardId) =>
        {
            this.players[playerId].addCard(cardId, this.pile.x, this.pile.y);
            this.updatePile();
        });

        game.on('play', (playerId, cardId) =>
        {
            this.players[playerId].play(cardId);
        });

        game.on('beginTurn', (playerId) =>
        {
            if (this.players[playerId].local)
            {
                this.status.text = 'Your turn - play a card!'
                this.players[playerId].setEnabled(true);
            }
            else
            {
                this.status.text = this.players[playerId].name + '\'s turn';
            }
        });

        // Create the app
        this.app = new PIXI.Application({
            width: window.innerWidth, height: window.innerHeight, backgroundColor: 0xeeeeee, resolution: window.devicePixelRatio || 1, antialias: true
        });
        document.body.appendChild(this.app.view);

        this.app.stage.interactive = true;
        this.app.stage.on('mousemove', this.mouseMove, this);
        this.app.ticker.add(this.update, this);

        // Create the color palettes        
        function rgba(color)
        {
            return [color >> 24, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
        }
        this.palette = new Array(numPlayers + 1);
        this.previewPalette = new Array(this.palette.length);
        for (let i = 0; i < numPlayers; i++)
        {
            this.palette[i] = rgba(colors[i]);
            this.previewPalette[i] = rgba(0xaaaaaaff);
        }
        this.palette[numPlayers] = rgba(colors[colors.length - 1]);
        this.previewPalette[numPlayers] = rgba(0);

        //
        // Board display
        //

        // Container for the board and everything tied to its position
        this.boardContainer = new PIXI.Container();
        this.app.stage.addChild(this.boardContainer);

        // Game board display
        let boardSize = game.size * 2;
        this.buffer = new Uint8Array(boardSize * boardSize * 4);
        this.boardGraphics = new PIXI.Graphics();
        this.boardContainer.addChild(this.boardGraphics);
        this.boardSprite = new PIXI.Sprite();
        this.boardSprite.interactive = true;
        this.boardContainer.addChild(this.boardSprite);

        // Board overlay for preview of player actions
        this.overlayBuffer = new Uint8Array(boardSize * boardSize * 4);
        this.overlayBoard = new Board(game.size, game.size);
        this.overlaySprite = new PIXI.Sprite();
        this.overlaySprite.visible = false;
        this.boardContainer.addChild(this.overlaySprite);

        //
        // Mouse interaction setup
        //

        // Collection of mouse moves since the last update
        this.mouseMoves = [];

        this.onBoardMouseUp = null;
        this.boardSprite.on('mouseup', (event) =>
        {
            let point = event.data.getLocalPosition(this.boardSprite);
            if (this.onBoardMouseUp)
            {
                this.onBoardMouseUp(Math.floor(point.x / 2), Math.floor(point.y / 2));
            }
        });
        
        this.onBoardMouseDown = null;
        this.boardSprite.on('mousedown', (event) =>
        {
            let point = event.data.getLocalPosition(this.boardSprite);
            if (this.onBoardMouseDown)
            {
                this.onBoardMouseDown(Math.floor(point.x / 2), Math.floor(point.y / 2));
            }
        });

        // Create the draw pile
        this.pile = new PIXI.Container;
        this.pile.x = 10;
        this.pile.y = 10;
        this.app.stage.addChild(this.pile);

        this.pileCard = new CCard(-1);
        this.pile.addChild(this.pileCard.graphics);

        this.pileText = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
        this.pile.addChild(this.pileText);
        this.updatePile();

        // Create the status bar
        this.status = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
        this.app.stage.addChild(this.status);

        // Create players
        this.players = new Array(numPlayers);
        for (let i = 0; i < numPlayers; i++)
        {
            let name = playerNames[i];
            let local = (this.isLocalGame() || i == localPlayerId);
            this.players[i] = new CPlayer(i, name, local);
        }

        // Begin the game
        game.begin();

        // Listen for events from the server
        if (!this.isLocalGame())
        {
            // Card revealed
            let onReveal = (cardId, deckId) => { game.reveal(cardId, deckId); }
            socket.on('reveal', onReveal);

            // Another player played a card
            socket.on('play', (action) =>
            {
                // Read any reveals attached to the action
                for (let reveal of action.reveals)
                {
                    onReveal(reveal.cardId, reveal.deckId);
                }
                
                // Play the action
                game.play(action);
            });

            // Another player left the game
            socket.on('removePlayer', (playerId) =>
            {
                game.removePlayer(playerId);
            });
            
            // Notify the server that this client is ready to receive messages
            socket.emit('ready');
        }

        // Listen for window resizes
        window.onresize = () =>
        {
            let w = window.innerWidth;
            let h = window.innerHeight;
            this.app.resize(w, h);
            this.app.view.style.width = w;
            this.app.view.style.height = h;
            this.app.renderer.resize(w, h);
            client.layout();
        }
        window.onresize(); // pixi scales incorrectly when res != 1, resize now to fix it
    }
    
    isLocalGame() { return (this.localPlayerId == -1); }

    layout()
    {
        this.boardContainer.x = 10;
        this.boardContainer.y = Math.floor((window.innerHeight - this.boardContainer.height) / 2);

        let playerX = this.boardContainer.x + this.boardContainer.width + 10;
        for (let i = 0; i < this.players.length; i++)
        {
            this.players[i].container.x = playerX;
            this.players[i].container.y = 10 + i * 200 + 10;
        }

        this.status.x = 10;
        this.status.y = this.boardContainer.y + this.boardContainer.height + 10;
    }

    setCursorStyle(cursorStyle)
    {
        document.body.style.cursor = cursorStyle;
        this.app.renderer.plugins.interaction.cursorStyles.default = cursorStyle;
        this.app.renderer.plugins.interaction.cursorStyles.hover = cursorStyle;
    }

    updatePile()
    {
        this.pileText.text = game.pile.length + '';
        this.pileText.x = this.pileCard.graphics.width - this.pileText.width - 10;
        this.pileText.y = 10;
    }

    update(delta)
    {
        if (this.mouseMoves.length == 0)
        {
            return;
        }

        let point = this.mouseMoves[this.mouseMoves.length - 1];
        this.lastPoint = point;

        if (this.cursor != null)
        {
            this.updateCursor();
        }

        if (this.preview)
        {
            let card = game.deck[game.shuffle[this.currentCardId]];
            switch (card.type)
            {
                case CardType.LINE:
                    this.overlayBoard.clear(this.previewPalette.length - 1);
                    this.overlayBoard.line(this.xPivot, this.yPivot, point.x, point.y, card.pixels, 0);
                    break;
                case CardType.FILL:
                    let isoBoard = new Board(this.overlayBoard.width, this.overlayBoard.height);
                    isoBoard.isolate(point.x, point.y, game.currentPlayer, this.palette.length - 1, game.board);
                    this.overlayBoard.outline(game.currentPlayer, 0, this.previewPalette.length - 1, isoBoard);
                    break;
                case CardType.PAINT:
                    let last = null;
                    for (let i = 0; i < this.mouseMoves.length; i++)
                    {
                        let next = this.mouseMoves[i];
                        if (this.paintPoints.length == 0)
                        {
                            last = next;
                        }
                        else
                        {
                            last = this.paintPoints[this.paintPoints.length - 1];
                            if (next.x == last.x && next.y == last.y)
                            {
                                continue;
                            }
                        }
                        this.paintPoints.push(next);
                        let paintPixels = this.overlayBoard.paint(last.x, last.y, next.x, next.y, card.radius, this.paintPixels, game.currentPlayer);
                        this.paintPixels = Math.min(paintPixels, this.paintPixels - 1);
                        if (this.paintPixels <= 0)
                        {
                            this.endPaint();
                            break;
                        }
                        else
                        {
                            this.status.text = 'Painting (' + this.paintPixels + 'px left)';
                        }
                    }
                    break;
                default:
                    throw 'preview unexpected card type';
            }
            this.updateOverlayBoard();
        }

        this.mouseMoves.length = 0;
    }

    playCard(cardId)
    {
        // Create a cursor for the chosen card
        let card = game.getCard(cardId);
        this.setCursor(card);
        
        // Update the status
        this.status.text = 'Playing ' + cardName(card) + ' - click on the board to draw, starting on your own color!';

        // Set the card's event listener
        switch (card.type)
        {
            // Single-click cards with no special visualization
            case CardType.CIRCLE:
            case CardType.BOX:
            case CardType.POLY:
            case CardType.ERASER:
                this.onBoardMouseDown = (x, y) =>
                {
                    if (!game.startOk(x, y))
                    {
                        return;
                    }

                    this.onBoardMouseDown = null;
                    this.playAction({cardId:cardId, x:x, y:y});
                    this.clearCursor();
                }
                break;

            // Line - two clicks with line visualization after the first click
            case CardType.LINE:
                this.onBoardMouseDown = (x, y) =>
                {
                    if (!game.startOk(x, y))
                    {
                        return;
                    }

                    // 1st point
                    this.xPivot = x;
                    this.yPivot = y;
                    this.beginPreview();
                    this.onBoardMouseDown = (x, y) =>
                    {
                        // 2nd point
                        this.onBoardMouseDown = null;
                        this.playAction({cardId:cardId, x:this.xPivot, y:this.yPivot, x2:x, y2:y});
                        this.endPreview();
                    };
                }
                break;
            
            // Paint - two clicks with visualization after the first click
            case CardType.PAINT:
                this.onBoardMouseDown = (x, y) =>
                {
                    if (!game.startOk(x, y))
                    {
                        return;
                    }
                    
                    // Setup the paint visualization
                    this.beginPreview();
                    this.paintPoints = [];
                    this.mouseMoves = [{x:x, y:y}]; // Fake a mouse move event to draw in the start position
                    this.paintPixels = card.pixels;
                    this.onBoardMouseDown = (x, y) =>
                    {
                        this.endPaint();
                    };
                }
                break;

            // Fill - single click with visualization of the range that will be extended
            case CardType.FILL:
                this.beginPreview();
                this.onBoardMouseDown = (x, y) =>
                {
                    if (!game.startOk(x, y))
                    {
                        return;
                    }
                    this.onBoardMouseDown = null;
                    this.playAction({cardId:cardId, x:x, y:y});
                    this.endPreview();
                }
                break;
        }
        
        // Save the card for any visualization logic in update()
        this.currentCardId = cardId;
    }

    playAction(action)
    {
        // Tell both the local and remove game about the action
        game.play(action);
        if (!this.isLocalGame())
        {
            this.socket.emit('play', action);
        }
    }

    setCursor(card)
    {
        this.clearCursor();

        // Draw the card's shape to a board.  (This will return an empty board if there is no shape).
        const crossRadius = 3;
        const crossSize = 2 * crossRadius + 1;
        let shapeBoard = renderCard(card, 0, this.previewPalette.length - 1, crossSize);

        // Take the outline of the shape, and then add a crosshair to it.
        let cursorBoard = new Board(shapeBoard.width, shapeBoard.height);
        cursorBoard.outline(0, 0, this.previewPalette.length - 1, shapeBoard);
        cursorBoard.crosshair(Math.floor(shapeBoard.width / 2), Math.floor(shapeBoard.height / 2), crossRadius, 0);

        this.cursor = new PIXI.Sprite(rtt(cursorBoard, scale, this.previewPalette));
        this.boardSprite.addChild(this.cursor);

        this.updateCursor();

        this.boardGraphics.lineStyle(2, 0xee0000, 1);
        this.boardGraphics.drawRect(-1, -1, this.boardSprite.width + 2, this.boardSprite.height + 2);
    }

    updateCursor()
    {
        let point = this.lastPoint;
        this.cursor.x = scale * (point.x - Math.floor(this.cursor.width / (2 * scale)));
        this.cursor.y = scale * (point.y - Math.floor(this.cursor.height / (2 * scale)));
        
        let onBoard = (point.x >= 0 && point.x < game.size && point.y >= 0 && point.y < game.size);
        this.cursor.visible = onBoard;
        this.cursor.alpha = (game.startOk(point.x, point.y) ? 1 : 0.5);
        this.setCursorStyle(onBoard ? "none" : "");
    }

    clearCursor()
    {
        if (this.cursor != null)
        {
            this.boardSprite.removeChild(this.cursor);
            this.cursor.destroy();
            this.cursor = null;
            this.setCursorStyle("");

            this.boardGraphics.clear();
        }
    }

    beginPreview()
    {
        this.preview = true;
        this.overlayBoard.clear(this.players.length);
        this.updateOverlayBoard();
        this.overlaySprite.visible = true;
    }

    endPreview()
    {
        this.preview = false;
        this.clearCursor();
        this.overlaySprite.visible = false;
    }

    endPaint()
    {
        // Clear the preview
        this.previewPaint = false;
        this.overlayBoard.clear(this.previewPalette.length - 1);
        this.updateOverlayBoard();

        this.onBoardMouseDown = null;
        this.playAction({cardId:this.currentCardId, points:this.paintPoints});
        
        this.endPreview();
    }

    mouseMove(event)
    {
        let point = event.data.getLocalPosition(this.boardSprite);
        this.mouseMoves.push({x:Math.floor(point.x / scale), y:Math.floor(point.y / scale)});
    }

    updateOverlayBoard()
    {
        this.overlayBoard.render(scale, this.previewPalette, this.overlayBuffer);
        let boardSize = scale * game.size;
        let options = {width: boardSize, height: boardSize};
        let resource = new PIXI.resources.BufferResource(this.overlayBuffer, options);
        this.overlaySprite.texture = PIXI.Texture.from(resource);
    }
}

class CPlayer
{
    constructor(id, name, local)
    {
        this.id = id;
        this.cards = [];
        this.container = new PIXI.Container();
        this.local = local;
        this.name = name;

        let nameText = new PIXI.Text(name, {fontFamily : 'Arial', fontSize: 24, fill : colors[this.id], align : 'left'});
        this.container.addChild(nameText);

        this.count = -1;
        this.delta = 0;
        this.status = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 18, fill : 0x333333, align : 'left'});
        this.status.x = nameText.x + nameText.width + 10;
        this.status.y = nameText.y + nameText.height - this.status.height;
        this.container.addChild(this.status);
        this.lastPlayed = null;

        client.app.stage.addChild(this.container);
    }

    updateStatus()
    {
        let statusStr = this.count + 'px';

        if (this.delta != 0)
        {
            let sign = (this.delta >= 0) ? '+' : '';
            statusStr = statusStr + ' (' + sign + this.delta + ')';
        }

        if (this.lastPlayed != null)
        {
            statusStr = statusStr + ' last played: ' + this.lastPlayed;
        }

        this.status.text = statusStr;
    }

    setCount(count)
    {
        this.delta = (this.count >= 0) ? (count - this.count) : 0;
        this.count = count;
        this.updateStatus();
    }

    setEnabled(enabled)
    {
        this.cards.forEach(card => { card.setEnabled(enabled); });
    }

    addCard(cardId, x, y)
    {
        let card = new CCard(cardId);
        this.container.addChild(card.graphics);
        card.setPosition(x - this.container.x, y - this.container.y);
        this.cards.push(card);
        this.updateTargets();
        
        card.on('click', (cardId) =>
        {
            this.setEnabled(false);
            client.playCard(cardId);
        });
    }

    play(cardId)
    {
        // Find the card and remove it
        let cardIndex = this.cards.findIndex(card => card.cardId == cardId);
        let card = this.cards[cardIndex];
        this.cards.splice(cardIndex, 1);
        this.container.removeChild(card.graphics);
        card.destroy();
        this.updateTargets();

        // Report the last card played in the status
        let gameCard = game.getCard(cardId);
        this.lastPlayed = cardName(gameCard);
        this.updateStatus();
    }

    updateTargets()
    {
        for (let i = 0; i < this.cards.length; i++)
        {
            this.cards[i].setTarget(10 + i * 110, 34);
        }
    }
}

// Map hidden card IDs to their CCards, in order to update the graphics on reveal
class CCard extends EventEmitter
{
    constructor(cardId)
    {
        super();

        this.cardId = cardId;
        this.graphics = new PIXI.Graphics();
        this.enabled = false;
        this.mouseOver = false;
        this.targetX = 0;
        this.targetY = 0;
        this.updateGraphics();

        //
        // Handle mouse events
        //

        this.graphics.on('mouseup', () =>
        {
            if (this.enabled)
            {
                this.emit('click', cardId)
            }
        });
        
        this.graphics.on('mouseover', () =>
        {
            this.mouseOver = true;
            this.updateGraphics();
        });
        
        this.graphics.on('mouseout', () =>
        {
            this.mouseOver = false;
            this.updateGraphics();
        });

        // Handle reveal
        game.on('reveal', cardId =>
        {
            if (cardId == this.cardId)
            {
                this.updateGraphics();
            }
        });

        // Add to ticker for animated position updates
        client.app.ticker.add(this.update, this);
    }
    
    // Call to destroy graphics resources
    destroy()
    {
        client.app.ticker.remove(this.update, this);
        this.graphics.destroy();
    }

    // Hepler getters
    getCard() { return game.getCard(this.cardId); }
    isHidden() { return getCard() == null; }

    // Set the position immediately
    setPosition(x, y)
    {
        this.graphics.x = x;
        this.graphics.y = y;
        this.targetX = x;
        this.targetY = y;
    }

    // Set the position to animate to
    setTarget(x, y)
    {
        this.targetX = x;
        this.targetY = y;
    }

    // Animates position
    update(delta)
    {
        let dx = this.graphics.x - this.targetX;
        let dy = this.graphics.y - this.targetY;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist == 0)
        {
            return;
        }
        const gainPerFrame = 0.1;
        const exp = -Math.log(1 - gainPerFrame);
        let ratio = Math.exp(-delta * exp);
        let newDist = ratio * dist;
        if (newDist < 0.25)
        {
            ratio = 0;
            newDist = 0;
        }
        dx *= ratio;
        dy *= ratio;
        this.graphics.x = this.targetX + dx;
        this.graphics.y = this.targetY + dy;
    }

    setEnabled(enabled)
    {
        this.enabled = enabled;
        this.graphics.interactive = enabled;
        if (!enabled)
        {
            this.mouseOver = false;
        }
        this.updateGraphics(false);
    }

    updateGraphics(over)
    {
        this.graphics.removeChildren();
        if (this.texture != null)
        {
            this.texture.destroy();
        }
        
        let card = this.getCard();
        
        // Add the card background
        this.graphics.clear();
        this.graphics.lineStyle(2, this.graphics.interactive ? (over ? 0xee0000 : 0x0000ee) : 0x333333, 1);
        this.graphics.beginFill(card == null ? 0xaaaaaa : 0xffffff);
        this.graphics.drawRoundedRect(0, 0, cardWidth, cardHeight, 10);
        this.graphics.endFill();

        // Add the card content
        if (card == null)
        {
            // Unrevealed card
            let text = new PIXI.Text('?', {fontFamily : 'Arial', fontSize: 24, fill : 0x333333, align : 'left'});
            text.x = Math.floor((cardWidth - text.width) / 2);
            text.y = Math.floor((cardHeight - text.height) / 2);
            this.graphics.addChild(text);
        }
        else
        {
            let pixels = 0;
            switch (card.type)
            {
                case CardType.CIRCLE:
                case CardType.BOX:
                case CardType.POLY:
                case CardType.ERASER:
                    let board = renderCard(card, 0, 1, 0);
                    pixels = board.count(1)[0];
                    this.texture = rtt(board, 1, cardPalette);
                    let sprite = new PIXI.Sprite(this.texture);
                    sprite.x = Math.floor(this.graphics.width - sprite.width) / 2;
                    sprite.y = Math.floor(this.graphics.height - sprite.height) / 2;
                    this.graphics.addChild(sprite);
                    break;
                case CardType.LINE:
                case CardType.PAINT:
                    pixels = card.pixels;
                default:
                    break;
            }

            let text = new PIXI.Text(cardName(card), {fontFamily : 'Arial', fontSize: 24, fill : 0x222222, align : 'left'});
            text.x = Math.floor((cardWidth - text.width) / 2);
            text.y = Math.floor(10);
            this.graphics.addChild(text);

            let pxString = ((pixels == 0) ? '*' : pixels) + 'px';
            let pxText = new PIXI.Text(pxString, {fontFamily : 'Arial', fontSize: 18, fill : 0x222222, align : 'left'});
            pxText.x = Math.floor((cardWidth - pxText.width) / 2);
            pxText.y = Math.floor(cardHeight - pxText.height - 10);
            this.graphics.addChild(pxText);
        }
    }
}

module.exports = Client;
