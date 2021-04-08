import * as PIXI from 'pixi.js-legacy';
import { CardType, Card, BoxCard, PolyCard, LineCard, PaintCard, CutCard, Rules, Action, Reveal, Game } from './game';
import { Point, Aabb, Board } from './board';
import { GameEvent } from './protocol';
const EventEmitter = require('events');
const Color = require('color');

// Constants
const colors = [ // Player colors
    0x3d1defff, // player 0 rgba
    0xed0730ff, // player 1 rgba
    0x23d100ff, // etc
    0xffd800ff,
    0x9028ccff,
    0xff7c3aff,
    0xffffffff  // blank
];

let cardPalette = [
    [0x22, 0x22, 0x22, 0xff],
    [0xff, 0xff, 0xff, 0xff]
];

const cardWidth = 100;
const cardHeight = 150;

type Socket = SocketIOClient.Emitter;

let game: Game;
let client: Client;
let app: PIXI.Application;

//
// Global helpers
//

function decay(dt: number, rate: number): number
{
    return Math.exp(dt * Math.log(rate));
}

function decay1d(value: number, target: number, dt: number, rate: number = 0.9, floor: number = 0.1): number
{
    let diff = value - target;
    let frac = decay(dt, rate);
    diff *= frac;
    if (Math.abs(diff) < floor)
    {
        return target;
    }
    return target + diff;
}

function decay2d(point: Point, target: Point, dt: number, rate: number = 0.9, floor: number = 0.1): Point
{
    let diff = point.sub(target);
    let dist = diff.length();
    let frac = decay(dt, rate);
    if (dist * frac < floor)
    {
        return target.clone();
    }
    return target.add(diff.mul(new Point(frac)));
}

// Render a board to a PIXI texture
function rtt(board: Board, palette: number[][], buffer: Uint8ClampedArray|undefined = undefined)
{
    buffer = board.render(palette, buffer);
    let imageData = new ImageData(buffer, board.width);

    let canvas = document.createElement('canvas');
    canvas.width = board.width;
    canvas.height = board.height;
    let ctx = canvas.getContext("2d");
    if (!ctx)
    {
        throw new Error('getContext("2d") failed');
    }
    ctx.putImageData(imageData, 0, 0);
    const options = { scaleMode: PIXI.SCALE_MODES.NEAREST };
    let texture = PIXI.Texture.from(canvas, options);
    return texture;
}

// Returns a Board representing what the card will allow the player to draw
function renderCard(card: Card, on: number, off: number)
{
    // Determine the dimensions required
    let w = 0;
    let h = 0;
    switch (card.type)
    {
        case CardType.Circle:
        case CardType.Paint:
        case CardType.Poly:
        case CardType.Eraser:
        case CardType.Dynamite:
        {
            w = Math.floor(card.radius) * 2 + 1;
            h = w;
            break;
        }
        case CardType.Box:
        {
            let boxCard = card as BoxCard;
            w = Math.floor(boxCard.width);
            h = Math.floor(boxCard.height);
            break;
        }
        case CardType.Cut:
        {
            let cutCard = card as CutCard;
            w = Math.floor(cutCard.width);
            h = Math.floor(cutCard.height);
            break;
        }
        default:
        {
            w = 1;
            h = 1;
            break;
        }
    }
    
    if (w % 2 === 0 || h % 2 === 0)
    {
        throw new Error('unexpected even dimension'); // unhandled ambiguity in choosing the middle pixel
    }
    
    let board = new Board(w, h);
    board.clear(off);
    let center = new Point(Math.floor((w - 1) / 2), Math.floor((h - 1) / 2));

    switch (card.type)
    {
        case CardType.Circle:
        case CardType.Paint:
        case CardType.Eraser:
        {
            board.drawCircle(center, card.radius, on);
            break;
        }
        case CardType.Box:
        case CardType.Cut:
        {
            board.drawBox(center, w, h, on);
            break;
        }
        case CardType.Poly:
        {
            let polyCard = card as PolyCard;
            board.drawPoly(center, polyCard.sides, polyCard.radius, polyCard.angle, on);
            break;
        }
    }

    return board;
}

export class Client extends EventEmitter
{
    socket: Socket;
    localPlayerId: number;
    palette: number[][];
    previewPalette: number[][];
    players: CPlayer[];

    scale: number;
    
    buffer: Uint8ClampedArray;
    overlayBuffer: Uint8ClampedArray;

    boardContainer: PIXI.Container;
    boardGraphics: PIXI.Graphics;
    boardSprite: PIXI.Sprite;
    overlayBoard: Board;
    overlaySprite: PIXI.Sprite;
    cursor: PIXI.Sprite | undefined;
    previewCursor: PIXI.Sprite | undefined;
    cursorMask: PIXI.Graphics;
    
    pile: PIXI.Container;
    pileCard: CCard;
    pileText: PIXI.Text;
    status: PIXI.Text;
    cancel: PIXI.Graphics;

    constructor(socket: Socket, playerNames: string[], localPlayerId: number, rules: Rules, init: GameEvent[] = [])
    {
        super();
        
        this.socket = socket;
        this.localPlayerId = localPlayerId;

        this.scale = Math.floor(600 / rules.size);

        // Create the game
        let numPlayers = playerNames.length;
        const shuffle = this.isLocalGame();
        game = new Game(numPlayers, shuffle, rules);

        //
        // Listen for events from the game
        //

        game.on('updateBoard', () =>
        {
            this.updateBoard();
        });

        game.on('deal', (playerId: number, cardId: number) =>
        {
            this.players[playerId].addCard(cardId, this.pile.x, this.pile.y);
            this.updatePile();
        });

        game.on('play', (playerId: number, cardId: number) =>
        {
            this.players[playerId].play(cardId);
        });

        let interactive = false;
        let setTurn = (playerId: number) =>
        {
            if (!interactive)
            {
                return;
            }
            if (this.players[playerId].local)
            {
                this.status.text = 'Your turn - play a card!';
                this.players[playerId].setEnabled(true);
            }
            else
            {
                this.status.text = this.players[playerId].name + '\'s turn';
            }
        };
        game.on('beginTurn', setTurn);

        // Create the app
        app = new PIXI.Application({
            width: window.innerWidth, height: window.innerHeight, backgroundColor: 0xeeeeee, resolution: window.devicePixelRatio || 1, antialias: true
        });
        document.body.appendChild(app.view);

        app.ticker.add(this.updateMouse, this);

        // Create the color palettes        
        function rgba(color: number)
        {
            return [Math.floor(color / 0x1000000), Math.floor(color / 0x10000) & 0xff, Math.floor(color / 0x100) & 0xff, color & 0xff];
        }
        this.palette = new Array(numPlayers + 1);
        this.previewPalette = new Array(this.palette.length + 1);
        for (let i = 0; i < numPlayers; i++)
        {
            this.palette[i] = rgba(colors[i]);
            let previewColor = Color.rgb(this.palette[i].slice(0, 3)).lighten(0.7).rgb();
            this.previewPalette[i] = [...previewColor.array(), 0xaa];
        }
        this.palette[numPlayers] = rgba(colors[colors.length - 1]);
        this.previewPalette[numPlayers] = rgba(0);
        this.previewPalette[numPlayers + 1] = rgba(0x222222ff);

        //
        // Board display
        //

        // Container for the board and everything tied to its position
        this.boardContainer = new PIXI.Container();
        this.boardContainer.scale.set(this.scale, this.scale);
        app.stage.addChild(this.boardContainer);

        this.cursorMask = new PIXI.Graphics();
        this.cursorMask.beginFill(0xffffff);
        this.cursorMask.drawRect(0, 0, game.size, game.size);
        this.cursorMask.isMask = true;
        this.boardContainer.addChild(this.cursorMask);

        // Game board display
        this.buffer = new Uint8ClampedArray(game.board.bufferSize(1));
        this.boardGraphics = new PIXI.Graphics();
        this.boardContainer.addChild(this.boardGraphics);
        this.boardSprite = new PIXI.Sprite();
        this.boardSprite.interactive = true;
        this.boardContainer.addChild(this.boardSprite);

        // Board overlay for preview of player actions
        this.overlayBuffer = new Uint8ClampedArray(game.board.bufferSize(1));
        this.overlayBoard = new Board(game.size, game.size);
        this.overlaySprite = new PIXI.Sprite();
        this.overlaySprite.visible = false;
        this.boardContainer.addChild(this.overlaySprite);

        //
        // Setup mouse events
        //
        
        this.boardSprite.on('mousedown', (event: PIXI.InteractionEvent) =>
        {
            this.emit('boardClick', this.getBoardPosition(event.data));
        });
        
        app.stage.interactive = true;
        app.stage.on('mousemove', (event: PIXI.InteractionEvent) =>
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
        this.cancel.on('mousedown', (event: PIXI.InteractionEvent) =>
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
            let local = (this.isLocalGame() || i === localPlayerId);
            this.players[i] = new CPlayer(i, name, local);
        }

        app.ticker.add(this.update, this);

        // Begin the game
        game.begin();

        // Run the initial events
        for (const event of init)
        {
            switch (event.event)
            {
                case 'play':
                {
                    let step = game.play(event.args[0])!;
                    while (step()) {}
                    break;
                }
                case 'reveal': game.reveal(event.args[0]); break;
            }
        }

        // Enable interaction
        interactive = true;
        setTurn(game.currentPlayer);

        // Listen for events from the server
        if (!this.isLocalGame())
        {
            // Card revealed
            let onReveal = (reveal: Reveal) => { game.reveal(reveal); };
            socket.on('reveal', onReveal);

            // Another player played a card
            socket.on('play', (action: Action) =>
            {
                // Play the action
                this.animateStep(game.play(action));
            });

            // Another player left the game
            socket.on('removePlayer', (playerId: number) =>
            {
                //game.removePlayer(playerId);
            });

            socket.on('disconnect', () =>
            {
                app.stage.removeChildren();
                let dcText = new PIXI.Text('Disconnected', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
                dcText.x = (app.view.width - dcText.width) / 2;
                dcText.y = (app.view.height - dcText.height) / 2;
                app.stage.addChild(dcText);
            });
        }

        // Listen for window resizes
        let onResize = () =>
        {
            let w = window.innerWidth;
            let h = window.innerHeight;
            app.resize();
            app.view.style.width = w.toString();
            app.view.style.height = h.toString();
            app.renderer.resize(w, h);
            this.layout();
        };
        window.onresize = onResize;
        onResize(); // pixi scales incorrectly when res != 1, resize now to fix it
        
        client = this; // TODO get rid of the globals?
    }
    
    textureReport()
    {
        let pixels = 0;
        let count = 0;
        for (const propertyName in PIXI.utils.BaseTextureCache)
        {
            const t = PIXI.utils.BaseTextureCache[propertyName];
            count++;
            pixels += t.width * t.height;
        }
        console.log(count + ' textures ' + pixels + ' pixels');
    }

    // Returns the position of the mouse in board-space, {x:int, y:int}
    // Either pass a mouse event.data, or call without arguments to use the current mouse position
    getBoardPosition(interactionData = app.renderer.plugins.interaction.mouse): Point
    {
        let point = interactionData.getLocalPosition(this.boardSprite);
        return new Point(point.x, point.y).floor();
    }
    
    // Returns true if this game is run entirely in the client, with no server connection
    isLocalGame() { return (this.localPlayerId === -1); }
    
    update()
    {
        let y = 10;
        for (const player of this.players)
        {
            player.container.y = y;
            y += player.container.height + 10;
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
            this.players[i].container.y = 10 + i * 200 + 10;
        }

        this.status.x = 10;
        this.status.y = this.boardContainer.y + this.boardContainer.height + 10;
        
        this.cancel.x = 10;
        this.cancel.y = this.status.y + this.status.height + 10;
    }

    setCursorStyle(cursorStyle: string)
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

    updateMouse()
    {
        if (this.dirty)
        {
            this.updateOverlayBoard();
        }

        this.updateCursor();
    }

    playCard(cardId: number)
    {
        // Create a cursor for the chosen card
        let card = game.getCard(cardId) as Card;
        this.setCursor(renderCard(card, 0, 1));
        
        // Update the status
        this.status.text = 'Playing ' + card.name + ' - click on the board to draw, starting on your own color!';
        this.cancel.visible = true;

        let endCancel = () =>
        {
            this.cancel.visible = false;
            this.removeAllListeners('cancel');
        };

        let playAction = (action: Action) => this.animateStep(this.playAction(action));

        // Set the card's event listener
        let listener: (point: Point) => void;
        let onCancel = () => { this.off('boardClick', listener); }; // default cancel handler, some are more complicated
        switch (card.type)
        {
            // Single-click cards with no special visualization
            case CardType.Eraser:
                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (playPoint)
                    {
                        this.off('boardClick', listener);
                        playAction(new Action(cardId, [playPoint]));
                        this.clearCursor();
                    }
                };
                break;
                
            case CardType.Circle:
            case CardType.Box:
            case CardType.Poly:
            {
                this.beginPreview();
                
                let lastPoint = new Point(-1);
                let update = () =>
                {
                    let point = this.getBoardPosition();
                    if (!point.equal(lastPoint))
                    {
                        lastPoint = point;
                        this.overlayBoard.clear(this.players.length);
                        let playPoint = this.getPlayPosition(point);
                        if (playPoint)
                        {
                            this.immediateStep(game.draw(new Action(cardId, [playPoint]), this.overlayBoard));
                        }
                        this.updateOverlayBoard();
                    }
                };
                app.ticker.add(update);
                
                onCancel = () =>
                {
                    this.off('boardClick', listener);
                    app.ticker.remove(update);
                };

                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (playPoint)
                    {
                        this.off('boardClick', listener);
                        app.ticker.remove(update);
                        playAction(new Action(cardId, [playPoint]));
                        this.endPreview();
                    }
                };
                break;
            }

            // Line - two clicks with line visualization after the first click
            case CardType.Line:
            {
                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (!playPoint)
                    {
                        return;
                    }
                    endCancel();
                    this.off('boardClick', listener);
                    this.beginPreview();

                    // Update the visualization each frame to show the line to the current mouse position
                    let lastPoint = new Point(-1);
                    let update = () =>
                    {
                        let point2 = this.getBoardPosition();
                        if (!point2.equal(lastPoint))
                        {
                            lastPoint = point2;
                            this.overlayBoard.clear(this.players.length);
                            let p = (card as LineCard).pixels;
                            this.immediateStep(game.draw(new Action(cardId, [playPoint!, point2]), this.overlayBoard));
                            this.updateOverlayBoard();
                        }
                    };
                    app.ticker.add(update);

                    // Listen for the second click
                    listener = (point2) =>
                    {
                        // 2nd point
                        this.off('boardClick', listener);
                        app.ticker.remove(update);
                        playAction(new Action(cardId, [playPoint!, point2]));
                        this.endPreview();
                    };
                    this.on('boardClick', listener);
                };
                break;
            }

            // Paint - two clicks with visualization after the first click
            case CardType.Paint:
            {
                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (!playPoint)
                    {
                        return;
                    }
                    endCancel();
                    this.off('boardClick', listener);
                    this.beginPreview();

                    // Draw incrementally as the player moves the mouse
                    let paintPoints: Point[] = [];
                    let paintPixels = (card as PaintCard).pixels;
                    let last: Point = playPoint;
                    let paintTo = (target: Point) =>
                    {
                        paintPoints.push(target);
                        let result = this.overlayBoard.paintf(last, target, card.radius, paintPixels, game.currentPlayer, 
                            (point: Point) => game.isOpen(point, game.currentPlayer));
                        paintPixels = Math.min(result.pixels, paintPixels - 1);
                        this.dirty = true;
                        last = target;
                    };

                    // Draw the first point
                    paintTo(playPoint);

                    // Update the visualization on mouse move
                    let moveListener = (target: Point) =>
                    {
                        if (!last)
                        {
                            last = target;
                        }
                        else if (target.x === last.x && target.y === last.y)
                        {
                            return;
                        }

                        let testLine = (point: Point) =>
                        {
                            let reachedPoint = false;
                            this.overlayBoard.linef(point, target, true, false, (linePoint: Point) =>
                            {
                                if (!game.isOpen(linePoint, game.currentPlayer)) { return false; }
                                reachedPoint = linePoint.equal(target); // TODO this breaks clamp, don't know if the line reached the clamped point
                                return true;
                            });
                            return reachedPoint;
                        };

                        // Search for a path from the last point
                        let found = false;
                        this.overlayBoard.floodf(last, (point: Point, getPath: () => Point[]) =>
                        {
                            const maxDistanceSq = 25; // Search within a 5px radius
                            if (found || !game.isOpen(point, game.currentPlayer) || last.distanceSquared(point) > maxDistanceSq)
                            {
                                return false;
                            }

                            if (testLine(point))
                            {
                                found = true;
                                let path = getPath();
                                path.reverse();
                                path.push(point); // path implicitly ends with point, we need to paint to there
                                path.push(target); // after reaching the end of the path, straigh line to target
                                for (const pathPoint of path)
                                {
                                    if (pathPoint.equal(last))
                                    {
                                        continue;
                                    }
                                    paintTo(pathPoint);
                                    if (paintPixels <= 0)
                                    {
                                        break;
                                    }
                                }
                                return false;
                            }

                            return true;
                        });

                        if (paintPixels <= 0)
                        {
                            // Stop painting, same as if the user clicked. Point is unused.
                            listener(new Point(0, 0));
                        }
                        else
                        {
                            this.status.text = 'Painting (' + paintPixels + 'px left)';
                        }
                    };
                    this.on('mouseMove', moveListener);

                    // Stop painting on click
                    listener = (point: Point) =>
                    {
                        this.off('mouseMove', moveListener);
                        this.off('boardClick', listener);

                        // Clear the preview
                        this.overlayBoard.clear(this.players.length);
                        this.updateOverlayBoard();
                
                        playAction(new Action(cardId, paintPoints));
                        
                        this.endPreview();
                    };
                    this.on('boardClick', listener);
                };
                break;
            }

            // Grow - single click with visualization of the range that will be extended
            case CardType.Grow:
            {
                this.beginPreview();

                // Update the visualization each frame to show the line to the current mouse position
                let lastPoint = new Point(-1);
                let update = () =>
                {
                    let point = this.getBoardPosition();
                    if (!point.equal(lastPoint))
                    {
                        lastPoint = point;
                        let floodBoard = this.overlayBoard.buffer(this.palette.length - 1);
                        floodBoard.drawFlood(game.board, point, game.currentPlayer);
                        this.overlayBoard.outline(game.currentPlayer, game.currentPlayer, this.players.length, floodBoard);
                        this.updateOverlayBoard();
                    }
                };
                app.ticker.add(update);
                
                onCancel = () =>
                {
                    this.off('boardClick', listener);
                    app.ticker.remove(update);
                };
                
                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (playPoint)
                    {
                        this.off('boardClick', listener);
                        app.ticker.remove(update);
                        
                        playAction(new Action(cardId, [playPoint]));
                        this.endPreview();
                    }
                };
                break;
            }
                
            // Dynamite: animated after click
            case CardType.Dynamite:
            {
                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (playPoint)
                    {
                        // Animate the explosion
                        this.off('boardClick', listener);
                        playAction(new Action(cardId, [playPoint]));
                        this.clearCursor();
                    }
                };
                break;
            }

            // Cut - two clicks with visualization after the first click
            case CardType.Cut:
            {
                listener = (point: Point) =>
                {
                    let playPoint = this.getPlayPosition(point);
                    if (!playPoint)
                    {
                        return;
                    }
                    endCancel();
                    this.off('boardClick', listener);
                    this.beginPreview();

                    // Do the cut directly in the game board, saving a backup so that we can restore it
                    const board = game.board.clone();
                    const cutCard = card as CutCard;
                    const cutAabb = Aabb.box(playPoint, new Point(cutCard.width, cutCard.height));
                    const cutBoard = game.board.cut(cutAabb, game.players.length);
                    this.updateBoard(false);
                    game.updatePixelCounts();

                    // In case the size of the cut was reduced because it wasn't entirely contained in the board, update the cursor
                    const shapeBoard = new Board(cutCard.width, cutCard.height);
                    shapeBoard.clear(1);
                    const aabbOffset = cutAabb.min.max(Point.zero).sub(cutAabb.min);
                    shapeBoard.drawAabb(new Aabb(aabbOffset, aabbOffset.add(cutBoard.size)), 0);
                    this.setCursor(shapeBoard);

                    // Update the visualization each frame to show the line to the current mouse position
                    const offset = cutAabb.min.max(Point.zero).sub(playPoint);
                    let lastPoint = new Point(-1);
                    let update = () =>
                    {
                        let point2 = this.getBoardPosition();
                        point2 = this.getPlayPosition(point2)??point2;
                        if (!point2.equal(lastPoint))
                        {
                            lastPoint = point2;
                            this.overlayBoard.clear(this.players.length);
                            this.overlayBoard.paste(cutBoard, point2.add(offset));
                            this.updateOverlayBoard();
                        }
                    };
                    app.ticker.add(update);

                    // Listen for the second click
                    listener = (point2) =>
                    {
                        // 2nd point
                        let playPoint2 = this.getPlayPosition(point2);
                        if (!playPoint2)
                        {
                            return;
                        }
                        this.off('boardClick', listener);
                        app.ticker.remove(update);
                        game.board.copy(board); // Restore the backup
                        game.updatePixelCounts();
                        playAction(new Action(cardId, [playPoint!, playPoint2]));
                        this.endPreview();
                    };
                    this.on('boardClick', listener);
                };
                break;
            }

            default: throw new Error('Unknown card type');
        }
        this.on('boardClick', listener);

        this.on('cancel', () =>
        {
            onCancel();
            this.endPreview();
            this.status.text = 'Your turn - play a card!';
            this.players[game.currentPlayer].setEnabled(true);
            this.cancel.visible = false;
        });
    }

    // Play an action from local input and send it to the server
    playAction(action: Action)
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
    animateStep(step: (() => boolean)|undefined)
    {
        if (step === undefined)
        {
            return;
        }

        let animate = () =>
        {
            // Step the animation
            if (step())
            {
                // Update the board without updating the count
                const updateCount = false;
                this.updateBoard(updateCount);
            }
            else
            {
                // At the end of the animation
                app.ticker.remove(animate);

                // Check if there is something else to play
                this.animateStep(game.play());
            }
        };
        app.ticker.add(animate);
    }

    immediateStep(step: () => boolean)
    {
        while (step()) {};
    }

    getPlayPosition(point: Point): Point|undefined
    {
        // Keep the point if it's a valid play position
        if (game.startOk(point))
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
                if (game.startOk(new Point(point.x + i, point.y + j)))
                {
                    x += i;
                    y += j;
                    ok = true;
                }
            }
        }
        
        // If no neighbors are valid then we can't play
        // If there are valid neighbors evenly distributed, then there's no single obvious choice where to play
        if (!ok || (x === 0 && y === 0))
        {
            return undefined;
        }

        // Choose a point to try to play in
        let absX = Math.abs(x);
        let absY = Math.abs(y);
        let testPoint = point;
        if (absX >= absY)
        {
            testPoint = new Point(testPoint.x + Math.sign(x), testPoint.y);
        }
        if (absY >= absX)
        {
            testPoint = new Point(testPoint.x, point.y + Math.sign(y));
        }

        // Return the point if it is valid, otherwise return undefined
        return game.startOk(testPoint) ? testPoint : undefined;
    }

    setCursor(shapeBoard: Board)
    {
        this.clearCursor();

        const crossRadius = 3;
        const crossSize = 2 * crossRadius + 1;

        // Take the outline of the shape
        let previewBoard = shapeBoard.buffer();
        previewBoard.outline(0, game.currentPlayer, this.players.length, shapeBoard);
        this.previewCursor = new PIXI.Sprite(rtt(previewBoard, this.previewPalette));
        this.previewCursor.mask = this.cursorMask;
        this.boardContainer.addChild(this.previewCursor);

        // Create a crosshair cursor
        let cursorBoard = new Board(crossSize, crossSize);
        cursorBoard.clear(this.players.length);
        cursorBoard.drawCross(new Point(Math.floor(cursorBoard.width / 2), Math.floor(cursorBoard.height / 2)), crossRadius, this.players.length + 1);
        this.cursor = new PIXI.Sprite(rtt(cursorBoard, this.previewPalette));
        this.cursor.mask = this.cursorMask;
        this.boardContainer.addChild(this.cursor);

        this.updateCursor();

        this.boardGraphics.lineStyle(2, 0xee0000, 1);
        this.boardGraphics.drawRect(-1, -1, this.boardSprite.width + 2, this.boardSprite.height + 2);
    }

    updateCursor()
    {
        if (!this.cursor || !this.previewCursor)
        {
            return;
        }

        let point = this.getBoardPosition();
        this.cursor.x = point.x - Math.floor(this.cursor.width / 2);
        this.cursor.y = point.y - Math.floor(this.cursor.height / 2);
        
        let onBoard = (point.x >= 0 && point.x < game.size && point.y >= 0 && point.y < game.size);
        this.cursor.visible = onBoard;
        this.previewCursor.visible = onBoard;

        let playPosition = this.getPlayPosition(point);
        if (playPosition)
        {
            this.cursor.alpha = 1;
        }
        else
        {
            playPosition = point;
            this.cursor.alpha = 0.5;
        }

        this.previewCursor.x = playPosition.x - Math.floor(this.previewCursor.width / 2);
        this.previewCursor.y = playPosition.y - Math.floor(this.previewCursor.height / 2);

        this.setCursorStyle(onBoard ? "none" : "");
    }

    clearCursor()
    {
        if (this.cursor)
        {
            this.boardContainer.removeChild(this.cursor);
            // @ts-ignore: destroy *does* accept boolean, see documentation
            this.cursor.destroy(true); 
            this.cursor = undefined;
        }
         
        if (this.previewCursor)
        {
            this.boardSprite.removeChild(this.previewCursor);
            // @ts-ignore: destroy *does* accept boolean, see documentation
            this.previewCursor.destroy(true);
            this.previewCursor = undefined;
        }

        this.setCursorStyle("");
        this.boardGraphics.clear();
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
        let oldTexture = this.boardSprite.texture;
        this.boardSprite.texture = rtt(game.board, this.palette, this.buffer);
        oldTexture.destroy(true);
        
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
        this.overlaySprite.texture = rtt(this.overlayBoard, this.previewPalette, this.overlayBuffer);
        oldTexture.destroy(true);
    }
}

class CPlayer
{
    id: number;
    cards: CCard[];
    container: PIXI.Container;
    local: boolean;
    name: string;
    count: number; // Number of pixels
    delta: number; // Change in count from the previous action
    status: PIXI.Text;
    lastPlayed: string;
    mouseOver: boolean;
    scale: number = 1;
    
    static readonly margin = 10;

    constructor(id: number, name: string, local: boolean)
    {
        this.id = id;
        this.cards = [];
        this.container = new PIXI.Container();
        this.local = local;
        this.mouseOver = local;
        this.name = name;

        let nameText = new PIXI.Text(name, {fontFamily : 'Arial', fontSize: 24, fill : colors[this.id], align : 'left'});
        this.container.addChild(nameText);

        this.count = -1;
        this.delta = 0;
        this.status = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 18, fill : 0x333333, align : 'left'});
        this.status.x = nameText.x + nameText.width + CPlayer.margin;
        this.status.y = nameText.y + nameText.height - this.status.height;
        this.container.addChild(this.status);
        this.lastPlayed = '';

        this.container.interactive = true;
        this.container.on('mousemove', (event: PIXI.InteractionEvent) =>
        {
            let point = event.data.getLocalPosition(this.container);
            this.mouseOver = (point.x >= 0 && point.x < this.container.width && point.y >= 0 && point.y < this.container.height);
        });
        
        const enableMouseScale = false;
        let calcScaleTarget = () => (this.local || (this.mouseOver && enableMouseScale)) ? 1 : 0.3;
        this.scale = calcScaleTarget();
        
        app.ticker.add((delta: number) =>
        {
            let scaleTarget = calcScaleTarget();
            if (this.scale !== scaleTarget)
            {
                this.scale = decay1d(this.scale, scaleTarget, delta, 0.75, 0.01 * scaleTarget);
                for (const card of this.cards)
                {
                    card.scale = this.scale;
                }
            }

            this.updateCardTargets();
        });

        app.stage.addChild(this.container);
    }

    updateCardTargets()
    {
        let x = CPlayer.margin;
        for (const card of this.cards)
        {
            card.target = new Point(x, 34);
            x += card.graphics.width + CPlayer.margin;
        }
    }

    updateStatus()
    {
        let statusStr = this.count + 'px';

        if (this.delta !== 0)
        {
            let sign = (this.delta >= 0) ? '+' : '';
            statusStr = statusStr + ' (' + sign + this.delta + ')';
        }

        if (this.lastPlayed.length)
        {
            statusStr = statusStr + ' last played: ' + this.lastPlayed;
        }

        this.status.text = statusStr;
    }

    setCount(count: number)
    {
        this.delta = (this.count >= 0) ? (count - this.count) : 0;
        this.count = count;
        this.updateStatus();
    }

    setEnabled(enabled: boolean)
    {
        this.cards.forEach(card => { card.setEnabled(enabled); });
    }

    addCard(cardId: number, x: number, y: number)
    {
        let card = new CCard(cardId);
        this.container.addChild(card.graphics);
        card.position = new Point(x - this.container.x, y - this.container.y);
        card.scale = this.scale;
        this.cards.push(card);
        this.updateCardTargets();
        
        card.on('click', (cardId: number) =>
        {
            this.setEnabled(false);
            client.playCard(cardId);
        });
    }

    play(cardId: number)
    {
        // Find the card and remove it
        let cardIndex = this.cards.findIndex(card => card.cardId === cardId);
        let card = this.cards[cardIndex];
        this.cards.splice(cardIndex, 1);
        this.container.removeChild(card.graphics);
        card.destroy();

        // Report the last card played in the status
        let gameCard = game.getCard(cardId) as Card;
        this.lastPlayed = gameCard.name;
        this.updateStatus();
    }
}

// Map hidden card IDs to their CCards, in order to update the graphics on reveal
class CCard extends EventEmitter
{
    cardId: number;
    graphics: PIXI.Graphics;
    enabled: boolean = false;
    mouseOver: boolean = false;
    private _target: Point = Point.zero;
    private _scale: number = 1;
    private _scaleTarget: number = 1;
    snap: boolean = false; // if true, position and scale snap to targets instantly rather than animating
    dirty: boolean = true; // if true, graphics need to be updated

    constructor(cardId: number)
    {
        super();

        this.cardId = cardId;
        this.graphics = new PIXI.Graphics();

        //
        // Handle mouse events
        //

        this.graphics.on('mouseup', () =>
        {
            if (this.enabled)
            {
                this.emit('click', cardId);
            }
        });
        
        this.graphics.on('mouseover', () =>
        {
            this.mouseOver = true;
            this.dirty = true;
        });
        
        this.graphics.on('mouseout', () =>
        {
            this.mouseOver = false;
            this.dirty = true;
        });

        // Handle reveal
        game.on('reveal', (cardId: number) =>
        {
            if (cardId === this.cardId)
            {
                this.dirty = true;
            }
        });

        // Add to ticker for animated position updates
        app.ticker.add(this.update, this);
    }
    
    // Call to destroy graphics resources
    destroy()
    {
        app.ticker.remove(this.update, this);
         //@ts-expect-error: think this is a problem in pixi .d.ts
        this.graphics.destroy(true);
    }

    // Hepler getters
    getCard() { return game.getCard(this.cardId); }
    isHidden() { return !this.getCard(); }

    get position(): Point { return new Point(this.graphics.x, this.graphics.y); }
    set position(position: Point) { this.graphics.x = position.x; this.graphics.y = position.y; }
    get target(): Point { return this._target; }
    set target(target: Point)
    {
        this._target = target.clone();
        if (this.snap)
        {
            this.position = target;
        }
    }
    get scale() { return this._scaleTarget; }
    set scale(scale: number)
    {
        this._scaleTarget = scale;
        if (this.snap)
        {
            this._scale = scale;
            this.dirty = true;
        }
    }

    // Animate position and scale, update graphics
    update(dt: number)
    {
        // Animate position and scale
        this.position = decay2d(this.position, this.target, dt);
        if (this._scale !== this._scaleTarget)
        {
            this._scale = decay1d(this._scale, this._scaleTarget, dt, 0.75, 0.01 * this._scaleTarget);
            this.dirty = true;
        }
        else if (this.position.equal(this.target))
        {
            this.snap = true;
        }

        // Update graphics
        if (this.dirty)
        {
            this.dirty = false;
            
            // Clean up old graphics
            let children = [...this.graphics.children];
            this.graphics.removeChildren();
            for (const c of children)
            {
                //@ts-expect-error: think this is a problem in pixi .d.ts
                c.destroy(true);
            }
            
            let width = this.scale * cardWidth;
            let height = this.scale * cardHeight;
            let radius = 5 + this.scale * 5;
            
            let card = this.getCard();
            
            // Add the card background
            this.graphics.clear();
            this.graphics.lineStyle(2, this.graphics.interactive ? (this.mouseOver ? 0xee0000 : 0x0000ee) : 0x333333, 1);
            this.graphics.beginFill(card ? 0xffffff : 0xaaaaaa);
            this.graphics.drawRoundedRect(0, 0, width, height, radius);
            this.graphics.endFill();

            // Add the card content
            if (!card)
            {
                // Unrevealed card
                let text = new PIXI.Text('?', {fontFamily : 'Arial', fontSize: 24, fill : 0x333333, align : 'left'});
                text.x = Math.floor((width - text.width) / 2);
                text.y = Math.floor((height - text.height) / 2);
                this.graphics.addChild(text);
            }
            else
            {
                let pixels = 0;
                switch (card.type)
                {
                    case CardType.Circle:
                    case CardType.Box:
                    case CardType.Poly:
                    case CardType.Eraser:
                        let board = renderCard(card, 0, 1);
                        pixels = board.count(1)[0];
                        this.texture = rtt(board, cardPalette);
                        let sprite = new PIXI.Sprite(this.texture);
                        sprite.x = Math.floor(this.graphics.width - sprite.width) / 2;
                        sprite.y = Math.floor(this.graphics.height - sprite.height) / 2;
                        this.graphics.addChild(sprite);
                        break;
                    case CardType.Line:
                        pixels = (card as PaintCard).pixels;
                        break;
                    case CardType.Paint:
                        pixels = (card as LineCard).pixels;
                        break;
                    default:
                        break;
                }

                let text = new PIXI.Text(card.name, {fontFamily : 'Arial', fontSize: 24, fill : 0x222222, align : 'left'});
                text.x = Math.floor((width - text.width) / 2);
                text.y = Math.floor(10);
                this.graphics.addChild(text);

                let pxString = ((pixels === 0) ? '*' : pixels) + 'px';
                let pxText = new PIXI.Text(pxString, {fontFamily : 'Arial', fontSize: 18, fill : 0x222222, align : 'left'});
                pxText.x = Math.floor((width - pxText.width) / 2);
                pxText.y = Math.floor(height - pxText.height - 10);
                this.graphics.addChild(pxText);
            }
        }
    }

    setEnabled(enabled: boolean)
    {
        this.enabled = enabled;
        this.graphics.interactive = enabled;
        if (!enabled)
        {
            this.mouseOver = false;
        }
        this.dirty = true;
    }
}
