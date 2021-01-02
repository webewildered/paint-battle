// requires draw.js, game.js, lobby.js all dumped into the global scope

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

// Globals
var client;
var game;

//
// Global helpers
//

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
    begin(socket, playerNames, localPlayerId)
    {
        this.socket = socket;
        this.localPlayerId = localPlayerId;

        // Create the game
        let numPlayers = playerNames.length;
        const shuffle = this.isLocalGame();
        game = new Game(this, numPlayers, shuffle);

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
            this.previewPalette[i] = rgba(0xcccccccc);
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
        this.pile.x = boardSize + 20;
        this.pile.y = 10;
        this.app.stage.addChild(this.pile);

        this.pileCard = new CCard(-1);
        this.pile.addChild(this.pileCard.graphics);

        this.pileText = new PIXI.Text(game.deck.length + '', {fontFamily : 'Arial', fontSize: 24, fill : colors[this.id]});
        this.pile.addChild(this.pileText);

        // Create players
        this.players = new Array(numPlayers);
        for (let i = 0; i < numPlayers; i++)
        {
            let x = 10;
            let y = i ? 0 : (playerHeight + boardSize);
            let name = playerNames[i];
            let local = (this.isLocalGame() || i == localPlayerId);
            this.players[i] = new CPlayer(i, name, local);
        }

        if (!this.isLocalGame())
        {
            // Forward server actions to the game
            socket.on('play', (action) =>
            {
                // Read any reveals attached to the action
                for (let reveal of action.reveals)
                {
                    this.onReveal(reveal.cardId, reveal.deckId);
                }
                
                // Play the action
                game.play(action);
            });

            // Listen for server reveals
            socket.on('reveal', (cardId, deckId) =>
            {
                this.onReveal(cardId, deckId);
            });

            // Listen for player disconnects
            socket.on('removePlayer', (playerId) =>
            {
                game.removePlayer(playerId);
            });
        }

        // Begin the game
        game.begin();

        socket.emit('ready');

        this.onResize(); // pixi scales incorrectly when res != 1, resize now to fix it
        window.onresize = () => this.onResize();
    }
    
    isLocalGame()
    {
        return (this.localPlayerId == -1);
    }

    onResize()
    {
        let w = window.innerWidth;
        let h = window.innerHeight;
        this.app.resize(w, h);
        this.app.view.style.width = w;
        this.app.view.style.height = h;
        this.app.renderer.resize(w, h);
        client.layout();
    }

    onReveal(cardId, deckId)
    {
        game.shuffle[cardId] = deckId;

        let cCard = hiddenCards[cardId];
        if (cCard != null)
        {
            cCard.updateGraphics();
            hiddenCards.delete(cardId);
        }
    }

    layout()
    {
        this.boardContainer.x = 10;
        this.boardContainer.y = Math.floor((window.innerHeight - this.boardContainer.height) / 2);

        let playerX = this.boardContainer.x + this.boardContainer.width + 10;
        for (let i = 0; i < this.players.length; i++)
        {
            this.players[i].container.x = playerX;
            this.players[i].container.y = this.boardContainer.y + i * 200 + 10;
        }
    }

    setCursorStyle(cursorStyle)
    {
        document.body.style.cursor = cursorStyle;
        this.app.renderer.plugins.interaction.cursorStyles.default = cursorStyle;
        this.app.renderer.plugins.interaction.cursorStyles.hover = cursorStyle;
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

    //
    // Game listener implementation
    //

    beginTurn(playerId)
    {
        if (this.players[playerId].local)
        {
            this.players[playerId].chooseCard();
        }
    }

    deal(playerId, cardId)
    {
        this.players[playerId].addCard(cardId, this.pile.x, this.pile.y);
        
        this.pileText.text = game.deck.length + '';
        this.pileText.x = this.pileCard.graphics.width - this.pileText.width - 10;
        this.pileText.y = 10;
    }

    discard(playerId, cardId)
    {
        this.players[playerId].removeCard(cardId);
    }

    reveal(playerId, cardId)
    {
        // do nothing, only need to act on remote reveals, which are handled by onReveal()
    }

    updateBoard()
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

        this.name = new PIXI.Text(name, {fontFamily : 'Arial', fontSize: 24, fill : colors[this.id], align : 'left'});
        this.container.addChild(this.name);

        this.count = new PIXI.Text('0px', {fontFamily : 'Arial', fontSize: 18, fill : 0x333333, align : 'left'});
        this.count.x = this.name.x + this.name.width + 10;
        this.count.y = this.name.y + this.name.height - this.count.height;
        this.container.addChild(this.count);

        client.app.stage.addChild(this.container);
    }

    setCount(count)
    {
        this.count.text = count + 'px';
    }

    chooseCard()
    {
        for (let i = 0; i < this.cards.length; i++)
        {
            this.cards[i].setActive(true, (cardId) =>
            {
                for (let i = 0; i < this.cards.length; i++)
                {
                    this.cards[i].setActive(false);
                }
                client.playCard(cardId);
            });
        }
    }

    addCard(cardId, x, y)
    {
        let card = new CCard(cardId);
        this.container.addChild(card.graphics);
        card.setPosition(x - this.container.x, y - this.container.y);
        this.cards.push(card);
        this.updateTargets();
    }

    removeCard(cardId)
    {
        // Find the card
        let cardIndex = 0;
        for (cardIndex = 0; cardIndex < this.cards.length; cardIndex++)
        {
            if (this.cards[cardIndex].id == cardId)
            {
                break;
            }
        }

        let card = this.cards[cardIndex];
        this.cards.splice(cardIndex, 1);
        this.container.removeChild(card.graphics);
        card.destroy();

        this.updateTargets();
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
var hiddenCards = new Map();
class CCard
{
    constructor(id)
    {
        this.id = id;
        this.graphics = new PIXI.Graphics();
        this.targetX = 0;
        this.targetY = 0;
        this.updateGraphics(false);
        this.graphics.on('mouseup', () =>
        {
            if (this.callback)
            {
                this.callback(this.id);
            }
        });
        
        this.graphics.on('mouseover', () =>
        {
            this.updateGraphics(true);
        });
        
        this.graphics.on('mouseout', () =>
        {
            this.updateGraphics(false);
        });

        let card = game.getCard(this.id);
        if (card == null)
        {
            hiddenCards[this.id] = this;
        }

        client.app.ticker.add(this.update, this);
    }

    destroy()
    {
        hiddenCards.delete(this.id);
        client.app.ticker.remove(this.update, this);
        this.graphics.destroy();
    }

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

    setActive(active, callback = null)
    {
        this.graphics.interactive = active;
        this.callback = callback;
        this.updateGraphics(false);
    }

    updateGraphics(over)
    {
        this.graphics.removeChildren();
        if (this.texture != null)
        {
            this.texture.destroy();
        }
        
        let card = game.getCard(this.id);
        
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

            let cardName = (card.name == null) ? card.type : card.name;
            let text = new PIXI.Text(cardName, {fontFamily : 'Arial', fontSize: 24, fill : 0x222222, align : 'left'});
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

    setPosition(x, y)
    {
        this.graphics.x = x;
        this.graphics.y = y;
        this.targetX = x;
        this.targetY = y;
    }

    setTarget(x, y)
    {
        this.targetX = x;
        this.targetY = y;
    }
}
