import { Point, PaintStep, ReusableBuffer, Board } from './board';
import { EventEmitter } from 'events';

export enum CardType
{
    Circle,
    Box,
    Poly,
    Line,
    Paint,
    Grow,
    Eraser,
    Dynamite
}

export class Card
{
    constructor(type: CardType, name: string, radius: number = 0)
    {
        this.type = type;
        this.name = name;
        this._radius = radius;
    }

    get radius(): number
    {
        if (this._radius <= 0)
        {
            throw new Error('Card "' + this.name + '" does not have a valid radius');
        }
        return this._radius;
    }
    
    type: CardType;
    name: string;
    private _radius: number;
}

export class CircleCard extends Card
{
    constructor(radius: number)
    {
        super(CardType.Circle, 'Circle', radius);
    }
}

export class BoxCard extends Card
{
    constructor(public width: number, public height: number)
    {
        super(CardType.Box, 'Box');
    }
}

export class PolyCard extends Card
{
    constructor(sides: number, radius: number, angle: number)
    {
        super(CardType.Poly, 'Poly', radius);
        this.sides = sides;
        this.angle = angle;
    }

    sides: number;
    angle: number;
}

export class LineCard extends Card
{
    constructor(pixels: number)
    {
        super(CardType.Line, 'Line');
        this.pixels = pixels;
    }

    pixels: number;
}

export class PaintCard extends Card
{
    constructor(radius: number, pixels: number)
    {
        super(CardType.Paint, 'Paint', radius);
        this.pixels = pixels;
    }

    pixels: number;
}

export class GrowCard extends Card
{
    constructor(radius: number)
    {
        super(CardType.Grow, 'Grow', radius);
    }
}

export class EraserCard extends Card
{
    constructor(radius: number)
    {
        super(CardType.Eraser, 'Eraser', radius);
    }
}

export class DynamiteCard extends Card
{
    constructor(radius: number)
    {
        super(CardType.Dynamite, 'Dynamite', radius);
    }
}

export class Rules
{
    blocking: boolean = false;
    size: number = 299;
}

export class Reveal
{
    constructor(
        public cardId: number,
        public deckId: number)
    {}
}

export class Action
{
    constructor(
        public cardId: number,
        public points: Point[],
        public reveals: Reveal[] = [])
    {}
}

class Player
{
    constructor(public hand: number[] = [], public disconnected: boolean = false, public pixels: number = 0) {}
}

//
// Events
// updateBoard(): this.board has changed
// reveal(cardId, deckId): cardId has been revealed to all players, deckId is its index in this.deck
// deal(playerId, cardId): cardId has been dealt to playerId
// play(playerId, cardId): playerId has played and discarded cardId
// beginTurn(playerId): playerId's turn has begun
//
export class Game extends EventEmitter
{
    rules: Rules;
    board: Board;
    deck: Card[];
    shuffle: number[];
    pile: number[];
    players: Player[];
    queue: Action[];
    numDisconnected: number;
    currentPlayer: number;
    
    // Temporary buffer for draw
    drawBuffer: ReusableBuffer;

    constructor(numPlayers: number, shuffle: boolean, rules: Rules)
    {
        super();

        // Increase max listeners, so eg. every card can listen for reveal
        this.setMaxListeners(100);

        this.rules = rules;
        this.currentPlayer = -1;

        // Initialize the game board
        this.board = new Board(this.size, this.size);
        this.board.clear(numPlayers);
        this.drawBuffer = new ReusableBuffer(this.board);

        if (!(numPlayers >= 1 && numPlayers <= 6))
        {
            throw new Error('Unsupported player count ' + numPlayers);
        }

        // Make a deck of cards
        this.deck = [];
        const countLow = [0, 3, 3, 4, 5, 6, 7][numPlayers];
        const countMed = [0, 5, 5, 5, 6, 7, 8][numPlayers];
        const countHigh = [0, 7, 7, 7, 8, 8, 9][numPlayers];

        let addCard = (count: number, card: Card) => { this.deck = this.deck.concat(Array<Card>(count).fill(card)); };
        addCard(countLow, new BoxCard(45, 21));
        addCard(countLow, new BoxCard(21, 45));
        addCard(countMed, new LineCard(140));
        addCard(countMed, new GrowCard(4));
        addCard(countHigh, new PaintCard(4, 600));
        addCard(countLow, new PolyCard(3, 25.5, 0.2));
        addCard(countLow, new PolyCard(5, 23.5, 0.4));
        addCard(countLow, new PolyCard(7, 21.5, 0.6));
        addCard(countHigh, new DynamiteCard(20.5));
        
        // Eraser doesn't do anything with blocking enabled
        if (!rules.blocking)
        {
            addCard(countLow, new EraserCard(30.5));
        }

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
            this.players[i] = new Player();
        }
        this.numDisconnected = 0;

        // Queue of pending actions
        this.queue = [];
    }

    get size(): number { return this.rules.size; }

    getCard(cardId: number): Card|undefined
    {
        return this.deck[this.shuffle[cardId]];
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
            this.board.drawCircle(new Point(x, y), 8.5, i);
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
        this.nextTurn();
    }

    reveal(reveal: Reveal)
    {
        this.shuffle[reveal.cardId] = reveal.deckId;
        this.emit('reveal', reveal.cardId);
    }

    isOpen(point: Point, c: number)
    {
        if (this.rules.blocking)
        {
            let b = this.board.get(point);
            return (b === c || b === this.players.length);
        }
        return true;
    }

    draw(action: Action, dest: Board): () => boolean
    {
        // Get the card data
        let card = this.getCard(action.cardId);
        if (!card)
        {
            throw new Error('Game.play() failed: card is invalid');
        }

        dest.matchDimensions(this.board);

        let drawFlood = (start: Point, testColor: number, setColor: number, f: (point: Point) => boolean) => dest.floodfStep(start, (point: Point) =>
        {
            if (this.isOpen(point, testColor) && f(point))
            {
                dest.set(point, setColor);
                return true;
            }
            return false;
        });

        // Perform the right action for the card
        let color = this.currentPlayer;
        switch (card.type)
        {
            case CardType.Circle:
            case CardType.Eraser:
            {
                if (action.points.length !== 1 || !this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed: points are invalid');
                }
                
                let setColor = (card.type === CardType.Circle) ? color : this.players.length;
                const radiusSquared = card.radius * card.radius;
                let start = action.points[0];
                return drawFlood(start, color, setColor, (point: Point) => point.distanceSquared(start) <= radiusSquared);
            }
            case CardType.Box:
            {
                if (action.points.length !== 1 || !this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed: points are invalid');
                }
                let boxCard = card as BoxCard;
                let start = action.points[0];
                let halfExtents = new Point(boxCard.width, boxCard.height).floor().sub(new Point(1)).mul(new Point(0.5));
                let min = start.sub(halfExtents).max(new Point(0));
                let max = start.add(halfExtents).min(new Point(dest.width - 1, dest.height - 1));
                return drawFlood(start, color, color, (point: Point) => point.greaterEqual(min) && max.greaterEqual(point));
            }
            case CardType.Poly:
            {
                if (action.points.length !== 1 || !this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed: points are invalid');
                }
                let polyCard = card as PolyCard;
                let start = action.points[0];
                let polyTest = dest.polyf(start, polyCard.sides, polyCard.radius, polyCard.angle);
                return drawFlood(start, color, color, polyTest);
            }
            case CardType.Line:
            {
                if (action.points.length !== 2 || !this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed: points are invalid');
                }

                const clamp = false;
                const single = false;
                let p = (card as LineCard).pixels;
                let lineStep = dest.linefStep(action.points[0], action.points[1], clamp, single, (point: Point) => 
                {
                    if (!this.isOpen(point, color))
                    {
                        return false;
                    }
                    dest.set(point, color);
                    return --p > 0;
                });
                return () => lineStep(10);
            }
            case CardType.Paint:
            {
                let paintCard = card as PaintCard;
                if (action.points.length === 0 || action.points.length > paintCard.pixels || !this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed: points are invalid');
                }
                
                let pixels = paintCard.pixels; // Number of pixels left
                let i = 0; // Current index in action.points
                let paintPoint = action.points[0]; // position to draw from
                let paintBoard = dest.buffer(this.players.length); // Temporary board where the paint is accumulated
                let paintStep: PaintStep | undefined = undefined;
                return () =>
                {
                    for (let k = 0; k < 5; k++) // 5 steps
                    {
                        // Call paintStep() to get a function will execute segment i of the paint
                        if (!paintStep)
                        {
                            if (i === action.points.length)
                            {
                                break;
                            }
                            if (pixels <= 0)
                            {
                                throw new Error('Game.play() failed'); // too many points
                            }
                            let nextPoint = action.points[i++];
                            paintStep = paintBoard.paintfStep(paintPoint, nextPoint, paintCard.radius, pixels, color, (point: Point) => this.isOpen(point, color));
                        }

                        // Execute one step of the paint
                        let result = paintStep(1);
                        if (result)
                        {
                            // If the segment is done, update the pixel count and mark paintStep undefined to move to the next segment
                            paintStep = undefined;
                            pixels = Math.min(result.pixels, pixels - 1);
                            paintPoint = result.point;
                        }
                    }

                    dest.add(paintBoard, color);
                    return (!!paintStep || i < action.points.length);
                };
            }
            case CardType.Grow:
            {
                if (!this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed');
                }
                
                let growStep = dest.growfStep(action.points[0], (card as GrowCard).radius, color, (point: Point) => this.isOpen(point, color));
                return () => growStep(1);
                break;
            }
            case CardType.Dynamite:
            {
                if (!this.startOk(action.points[0]))
                {
                    throw new Error('Game.play() failed');
                }
                return dest.dynamiteStep(action.points[0], (card as DynamiteCard).radius, this.players.length);
            }
            default:
                throw new Error('Game.play() failed: card type is invalid'); // should never happen even if an invalid message is received
        }
    };

    // returns a stepping function. The function must be called repeatedly to step the game
    // as long as it returns true. Once it returns false, the play is complete.
    // throws on failure -- this should not happen but might if there is a bug or if a player
    // is trying to cheat.
    play(actionIn: Action|undefined = undefined): (()=>boolean)|undefined
    {
        let action: Action;
        if (actionIn)
        {
            action = actionIn;
            this.queue.push(action);
            if (this.queue.length > 1)
            {
                return undefined;
            }
        }
        else if (this.queue.length)
        {
            action = this.queue[0];
        }
        else
        {
            return undefined;
        }

        // Validate the action struct
        if (!Number.isFinite(action.cardId) || !Array.isArray(action.points) || action.points.length > 1000 || 
            !Array.isArray(action.reveals) || action.reveals.length > 1000)
        {
            throw new Error('Game.play() failed: action is invalid');
        }

        // Validate and rebuild points, in case they came from a remote connection
        for (let i = 0; i < action.points.length; i++)
        {
            if (!this.coordsOk(action.points[i]))
            {
                throw new Error('Game.play() failed: points are invalid');
            }
            action.points[i] = new Point(action.points[i].x, action.points[i].y);
        }

        // Make sure the card belongs to the current player
        if (!this.players[this.currentPlayer].hand.includes(action.cardId))
        {
            throw new Error('Game.play() failed: player does not have the card');
        }

        // Do the reveals
        for (const reveal of action.reveals)
        {
            this.reveal(reveal);
        }

        // Make a stepping function that draws the action to the game board
        // This does validation and might throw in case of bad input
        let step = this.draw(action, this.board);

        // Reveal the card played
        this.emit('reveal', action.cardId);
            
        // Remove the card from the player's hand
        let player = this.players[this.currentPlayer];
        player.hand.splice(player.hand.indexOf(action.cardId), 1);
        this.emit('play', this.currentPlayer, action.cardId);

        // Return a stepper that steps the play until finished, then advances the game
        return () =>
        {
            if (step())
            {
                return true;
            }

            this.queue.shift();
            this.emit('updateBoard');
            this.nextTurn();
            return false;
        };
    }

    // Handle disconnects
    removePlayer(playerId: number)
    {
        this.players[playerId].disconnected = true;
        if (++this.numDisconnected === this.players.length - 1)
        {
            // TODO game is over
        }

        // TODO - handle if it's that player's turn
    }

    //
    // INTERNAL functions
    //

    // Deal one card from the pile to a player
    private deal(playerId: number)
    {
        if (this.pile.length)
        {
            let cardId = this.pile.pop()!;
            this.emit('deal', playerId, cardId);
            this.players[playerId].hand.push(cardId);
        }
    }

    private nextTurn()
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
        
        let count = this.board.count(this.players.length + 1);
        for (let i = 0; i < this.players.length; i++)
        {
            this.players[i].pixels = count[i];
        }
    }

    private coordsOk(point: Point)
    {
        return point.x > -100000 && point.x < 100000 && point.y > -100000 && point.y < 100000;
    }

    startOk(point: Point)
    {
        return (this.board.get(point) === this.currentPlayer || this.players[this.currentPlayer].pixels === 0);
    }
}
