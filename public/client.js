const PIXI = require('pixi.js-legacy')
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
function rtt(board, scale, palette, buffer = null)
{
    buffer = board.render(scale, palette, buffer);
    let imageData = new ImageData(buffer, scale * board.width);
    
    let canvas = document.createElement('canvas');
    canvas.width = scale * board.width;
    canvas.height = scale * board.height;
    let ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    let texture = PIXI.Texture.from(canvas);
    return texture;
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
        case CardType.DYNAMITE:
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
            board.drawCircle(x, y, card.radius, on);
            break;
        case CardType.BOX:
            board.drawBox(x, y, w, h, on);
            break;
        case CardType.POLY:
            board.drawPoly(x, y, card.sides, card.radius, card.angle, on);
            break;
    }

    return board;
}

class Client extends EventEmitter
{
    constructor()
    {
        super();
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
            this.updateBoard();
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
        app = new PIXI.Application({
            width: window.innerWidth, height: window.innerHeight, backgroundColor: 0xeeeeee, resolution: window.devicePixelRatio || 1, antialias: true
        });
        document.body.appendChild(app.view);

        app.ticker.add(this.updateMouse, this);

        // Create the color palettes        
        function rgba(color)
        {
            return [Math.floor(color / 0x1000000), Math.floor(color / 0x10000) & 0xff, Math.floor(color / 0x100) & 0xff, color & 0xff];
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
        app.stage.addChild(this.boardContainer);

        // Game board display
        let boardSize = game.size * 2;
        this.buffer = new Uint8ClampedArray(boardSize * boardSize * 4);//new Uint8Array(boardSize * boardSize * 4);
        this.boardGraphics = new PIXI.Graphics();
        this.boardContainer.addChild(this.boardGraphics);
        this.boardSprite = new PIXI.Sprite();
        this.boardSprite.interactive = true;
        this.boardContainer.addChild(this.boardSprite);

        // Board overlay for preview of player actions
        this.overlayBuffer = new Uint8ClampedArray(boardSize * boardSize * 4);//new Uint8Array(boardSize * boardSize * 4);
        this.overlayBoard = new Board(game.size, game.size);
        this.overlaySprite = new PIXI.Sprite();
        this.overlaySprite.visible = false;
        this.boardContainer.addChild(this.overlaySprite);

        //
        // Setup mouse events
        //
        
        this.onBoardMouseDown = null;
        this.boardSprite.on('mousedown', (event) =>
        {
            this.emit('boardClick', this.getBoardPosition(event.data));
        });
        
        app.stage.interactive = true;
        app.stage.on('mousemove', (event) =>
        {
            this.emit('mouseMove', this.getBoardPosition(event.data));
        });

        // Create the draw pile
        this.pile = new PIXI.Container;
        this.pile.x = 10;
        this.pile.y = 10;
        app.stage.addChild(this.pile);

        this.pileCard = new CCard(-1);
        this.pile.addChild(this.pileCard.graphics);

        this.pileText = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
        this.pile.addChild(this.pileText);
        this.updatePile();

        // Create the status bar
        this.status = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
        app.stage.addChild(this.status);

        // Create the cancel button
        this.cancel = new PIXI.Graphics;
        this.cancel.interactive = true;
        this.cancel.lineStyle(2, 0x333333, 1);
        this.cancel.beginFill(0xffffff);
        this.cancel.drawRoundedRect(0, 0, 200, 50, 5);
        this.cancel.endFill();
        this.cancel.on('mousedown', (event) =>
        {
            this.emit('cancel');
        });
        app.stage.addChild(this.cancel);
        let cancelText = new PIXI.Text('Cancel', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
        cancelText.x = Math.floor((this.cancel.width - cancelText.width) / 2);
        cancelText.y = Math.floor((this.cancel.height - cancelText.height) / 2);
        this.cancel.addChild(cancelText);
        this.cancel.visible = false;

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
                this.animateStep(game.play(action));
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
            app.resize(w, h);
            app.view.style.width = w;
            app.view.style.height = h;
            app.renderer.resize(w, h);
            client.layout();
        }
        window.onresize(); // pixi scales incorrectly when res != 1, resize now to fix it
    }

    // Returns the position of the mouse in board-space, {x:int, y:int}
    // Either pass a mouse event.data, or call without arguments to use the current mouse position
    getBoardPosition(interactionData = app.renderer.plugins.interaction.mouse)
    {
        let point = interactionData.getLocalPosition(this.boardSprite);
        return { x: Math.floor(point.x / 2), y: Math.floor(point.y / 2) };
    }
    
    // Returns true if this game is run entirely in the client, with no server connection
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
        
        this.cancel.x = 10;
        this.cancel.y = this.status.y + this.status.height + 10;
    }

    setCursorStyle(cursorStyle)
    {
        document.body.style.cursor = cursorStyle;
        app.renderer.plugins.interaction.cursorStyles.default = cursorStyle;
        app.renderer.plugins.interaction.cursorStyles.hover = cursorStyle;
    }

    updatePile()
    {
        this.pileText.text = game.pile.length + '';
        this.pileText.x = this.pileCard.graphics.width - this.pileText.width - 10;
        this.pileText.y = 10;
    }

    updateMouse(delta)
    {
        if (this.dirty)
        {
            this.updateOverlayBoard();
        }

        if (this.cursor != null)
        {
            this.updateCursor();
        }
    }

    playCard(cardId)
    {
        // Create a cursor for the chosen card
        let card = game.getCard(cardId);
        this.setCursor(card);
        
        // Update the status
        this.status.text = 'Playing ' + cardName(card) + ' - click on the board to draw, starting on your own color!';
        this.cancel.visible = true;

        let endCancel = () =>
        {
            this.cancel.visible = false;
            this.removeAllListeners('cancel');
        }

        let playAction = (action) => this.animateStep(this.playAction(action));

        // Set the card's event listener
        let listener = null;
        let onCancel = () => { this.off('boardClick', listener); }; // default cancel handler, some are more complicated
        switch (card.type)
        {
            // Single-click cards with no special visualization
            case CardType.CIRCLE:
            case CardType.BOX:
            case CardType.ERASER:
                listener = (point) =>
                {
                    point = this.getPlayPosition(point);
                    if (point == null)
                    {
                        return;
                    }

                    this.off('boardClick', listener);
                    playAction({cardId:cardId, x:point.x, y:point.y});
                    this.clearCursor();
                }
                break;
                
            case CardType.POLY:
                listener = (point) =>
                {
                    point = this.getPlayPosition(point);
                    if (point == null)
                    {
                        return;
                    }

                    this.off('boardClick', listener);
                    playAction({cardId:cardId, x:point.x, y:point.y});
                    this.clearCursor();
                }
                break;

            // Line - two clicks with line visualization after the first click
            case CardType.LINE:
                listener = (point) =>
                {
                    point = this.getPlayPosition(point);
                    if (point == null)
                    {
                        return;
                    }
                    endCancel();
                    this.off('boardClick', listener);
                    this.beginPreview();

                    // Update the visualization each frame to show the line to the current mouse position
                    let update = () =>
                    {
                        let point2 = this.getBoardPosition();
                        this.overlayBoard.clear(this.previewPalette.length - 1);
                        this.overlayBoard.drawLine(point.x, point.y, point2.x, point2.y, card.pixels, 0);
                        this.updateOverlayBoard();
                    }
                    app.ticker.add(update);

                    // Listen for the second click
                    listener = (point2) =>
                    {
                        // 2nd point
                        this.off('boardClick', listener);
                        app.ticker.remove(update);
                        playAction({cardId:cardId, x:point.x, y:point.y, x2:point2.x, y2:point2.y});
                        this.endPreview();
                    };
                    this.on('boardClick', listener);
                }
                break;
            
            // Paint - two clicks with visualization after the first click
            case CardType.PAINT:
                listener = (point) =>
                {
                    point = this.getPlayPosition(point);
                    if (point == null)
                    {
                        return;
                    }
                    endCancel();
                    this.off('boardClick', listener);
                    this.beginPreview();

                    // Update the visualization on mouse move
                    let paintPoints = [];
                    let paintPixels = card.pixels;
                    let last = undefined;
                    let moveListener = (point) =>
                    {
                        if (!last)
                        {
                            last = point;
                        }
                        else if (point.x == last.x && point.y == last.y)
                        {
                            return;
                        }
                        paintPoints.push(point);
                        let result = this.overlayBoard.paintf(last.x, last.y, point.x, point.y, card.radius, paintPixels, game.currentPlayer,
                            (u, v) => game.isOpen(u, v, game.currentPlayer));
                        last = { x: result.x, y: result.y };
                        paintPixels = Math.min(result.p, paintPixels - 1);
                        this.dirty = true;
                        if (paintPixels <= 0)
                        {
                            // Stop painting, same as if the user clicked
                            listener();
                        }
                        else
                        {
                            this.status.text = 'Painting (' + paintPixels + 'px left)';
                        }
                    }
                    this.on('mouseMove', moveListener);

                    // Stop painting on click
                    listener = (point) =>
                    {
                        this.off('mouseMove', moveListener);
                        this.off('boardClick', listener);

                        // Clear the preview
                        this.overlayBoard.clear(this.previewPalette.length - 1);
                        this.updateOverlayBoard();
                
                        this.onBoardMouseDown = null;
                        playAction({cardId:cardId, points:paintPoints});
                        
                        this.endPreview();
                    }
                    this.on('boardClick', listener);

                    // Fake a mouse move event to draw in the start position immediately
                    moveListener(point);
                }
                break;

            // Grow - single click with visualization of the range that will be extended
            case CardType.GROW:
                this.beginPreview();

                // Update the visualization each frame to show the line to the current mouse position
                let update = () =>
                {
                    let point = this.getBoardPosition();
                    let floodBoard = this.overlayBoard.buffer(this.palette.length - 1);
                    floodBoard.drawFlood(game.board, point.x, point.y, game.currentPlayer);
                    this.overlayBoard.outline(game.currentPlayer, 0, this.previewPalette.length - 1, floodBoard);
                    this.updateOverlayBoard();
                }
                app.ticker.add(update);
                
                listener = (point) =>
                {
                    point = this.getPlayPosition(point);
                    if (point == null)
                    {
                        return;
                    }
                    this.off('boardClick', listener);
                    app.ticker.remove(update);
                    
                    playAction({cardId:cardId, x:point.x, y:point.y});
                    this.endPreview();
                }
                break;
                
            // Dynamite: animated after click
            case CardType.DYNAMITE:
                listener = (point) =>
                {
                    point = this.getPlayPosition(point);
                    if (point == null)
                    {
                        return;
                    }

                    // Animate the explosion
                    this.off('boardClick', listener);
                    playAction({cardId:cardId, x:point.x, y:point.y});
                    this.clearCursor();
                }
                break;
        }
        this.on('boardClick', listener);

        this.on('cancel', () =>
        {
            onCancel();
            this.status.text = 'Your turn - play a card!'
            this.players[game.currentPlayer].setEnabled(true);
            this.cancel.visible = false;
        });
    }

    // Play an action from local input and send it to the server
    playAction(action)
    {
        this.removeAllListeners('cancel');
        this.cancel.visible = false;

        // Tell both the local and remove game about the action
        let step = game.play(action);
        if (!this.isLocalGame())
        {
            this.socket.emit('play', action);
        }

        return step;
    }

    // Animate a stepping function
    animateStep(step)
    {
        let animate = () =>
        {
            // Step the animation
            let updateCount = false;
            if (!step())
            {
                // At the end of the animation: update the count and remove from the ticker
                updateCount = true;
                app.ticker.remove(animate);
            }
            this.updateBoard(updateCount);
        };
        app.ticker.add(animate);
    }

    getPlayPosition(point)
    {
        // Keep the point if it's a valid play position
        if (game.startOk(point.x, point.y))
        {
            return point;
        }

        // Check the neighboring play positions
        let x = 0;
        let y = 0;
        let ok = false;
        for (let i = -1; i <= 1; i++)
        {
            for (let j = -1; j <= 1; j++)
            {
                if (game.startOk(point.x + i, point.y + j))
                {
                    x += i;
                    y += j;
                    ok = true;
                }
            }
        }
        
        // If no neighbors are valid then we can't play
        // If there are valid neighbors evenly distributed, then there's no single obvious choice where to play
        if (!ok || (x == 0 && y == 0))
        {
            return null;
        }

        // Choose a point to try to play in
        let absX = Math.abs(x);
        let absY = Math.abs(y);
        let testPoint = point;
        if (absX >= absY)
        {
            testPoint.x = point.x + Math.sign(x);
        }
        if (absY >= absX)
        {
            testPoint.y = point.y + Math.sign(y);
        }

        // Return the point if it is valid, otherwise return null
        return game.startOk(testPoint.x, testPoint.y) ? testPoint : null;
    }

    setCursor(card)
    {
        this.clearCursor();

        const crossRadius = 3;
        const crossSize = 2 * crossRadius + 1;

        // Create a crosshair cursor
        let cursorBoard = new Board(crossSize, crossSize);
        cursorBoard.clear(this.previewPalette.length - 1);
        cursorBoard.drawCross(Math.floor(cursorBoard.width / 2), Math.floor(cursorBoard.height / 2), crossRadius, 0);
        this.cursor = new PIXI.Sprite(rtt(cursorBoard, scale, this.previewPalette));
        this.boardSprite.addChild(this.cursor);

        // Draw the card's shape to a board.  (This will return an empty board if there is no shape).
        let shapeBoard = renderCard(card, 0, this.previewPalette.length - 1, crossSize);

        // Take the outline of the shape
        let previewBoard = new Board(shapeBoard.width, shapeBoard.height);
        previewBoard.outline(0, 0, this.previewPalette.length - 1, shapeBoard);
        this.previewCursor = new PIXI.Sprite(rtt(previewBoard, scale, this.previewPalette));
        this.boardSprite.addChild(this.previewCursor);

        this.updateCursor();

        this.boardGraphics.lineStyle(2, 0xee0000, 1);
        this.boardGraphics.drawRect(-1, -1, this.boardSprite.width + 2, this.boardSprite.height + 2);
    }

    updateCursor()
    {
        let point = this.getBoardPosition();
        this.cursor.x = scale * (point.x - Math.floor(this.cursor.width / (2 * scale)));
        this.cursor.y = scale * (point.y - Math.floor(this.cursor.height / (2 * scale)));
        
        let onBoard = (point.x >= 0 && point.x < game.size && point.y >= 0 && point.y < game.size);
        this.cursor.visible = onBoard;
        this.previewCursor.visible = onBoard;

        let playPosition = this.getPlayPosition(point);
        if (playPosition == null)
        {
            playPosition = point;
            this.cursor.alpha = 0.5;
        }
        else
        {
            this.cursor.alpha = 1;
        }

        this.previewCursor.x = scale * (playPosition.x - Math.floor(this.previewCursor.width / (2 * scale)));
        this.previewCursor.y = scale * (playPosition.y - Math.floor(this.previewCursor.height / (2 * scale)));

        this.setCursorStyle(onBoard ? "none" : "");
    }

    clearCursor()
    {
        if (this.cursor != null)
        {
            this.boardSprite.removeChild(this.cursor);
            this.cursor.destroy();
            this.cursor = null;
            
            this.boardSprite.removeChild(this.previewCursor);
            this.previewCursor.destroy();
            this.previewCursor = null;

            this.setCursorStyle("");

            this.boardGraphics.clear();
        }
    }

    beginPreview()
    {
        this.overlayBoard.clear(this.players.length);
        this.updateOverlayBoard();
        this.overlaySprite.visible = true;
    }

    endPreview()
    {
        this.clearCursor();
        this.overlaySprite.visible = false;
    }
    
    updateBoard(updateCount = true)
    {
        let oldTexture = this.overlaySprite.texture;
        this.boardSprite.texture = rtt(game.board, scale, this.palette, this.buffer);
        oldTexture.destroy();
        
        if (updateCount)
        {
            let count = game.board.count(this.players.length + 1);
            for (let i = 0; i < this.players.length; i++)
            {
                this.players[i].setCount(count[i]);
            }
        }
    }

    updateOverlayBoard()
    {
        let oldTexture = this.overlaySprite.texture;
        this.overlaySprite.texture = rtt(this.overlayBoard, scale, this.previewPalette, this.overlayBuffer);
        oldTexture.destroy();
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

        app.stage.addChild(this.container);
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
        app.ticker.add(this.update, this);
    }
    
    // Call to destroy graphics resources
    destroy()
    {
        app.ticker.remove(this.update, this);
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
