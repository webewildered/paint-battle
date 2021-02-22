import PriorityQueue from "priorityqueue";

export class Point
{
    constructor(
        public readonly x: number,
        public readonly y: number = x)
    {
    }
    
    get array() { return [this.x, this.y]; }

    unary(f: (a: number) => number): Point
    {
        return new Point(f(this.x), f(this.y));
    }

    binary(point: Point, f: (a: number, b: number) => number): Point
    {
        return new Point(f(this.x, point.x), f(this.y, point.y));
    }

    add(point: Point) { return this.binary(point, (a: number, b: number) => a + b); }
    sub(point: Point) { return this.binary(point, (a: number, b: number) => a - b); }
    mul(point: Point) { return this.binary(point, (a: number, b: number) => a * b); }
    div(point: Point) { return this.binary(point, (a: number, b: number) => a / b); }
    min(point: Point) { return this.binary(point, (a: number, b: number) => Math.min(a, b)); }
    max(point: Point) { return this.binary(point, (a: number, b: number) => Math.max(a, b)); }
    dot(point: Point) { return this.mul(point).sum(); }
    abs() { return this.unary((a: number) => Math.abs(a)); }
    sign() { return this.unary((a: number) => Math.sign(a)); }
    floor() { return this.unary((a: number) => Math.floor(a)); }
    ceil() { return this.unary((a: number) => Math.ceil(a)); }
    sum() { return this.x + this.y; }
    lengthSquared() { return this.dot(this); }
    distanceSquared(point: Point) { return this.sub(point).lengthSquared(); }

    equal(point: Point): boolean
    {
        return this.x === point.x && this.y === point.y;
    }

    clone(): Point
    {
        return new Point(this.x, this.y);
    }
}

class Node extends Point
{
    constructor(point: Point, cost: number)
    {
        super(point.x, point.y);
        this.cost = cost;
    }
    
    cost: number;
};

export class PaintResult
{
    constructor(
        public point: Point,    // Last point painted
        public pixels: number   // Number of pixels remaining
    )
    {}
}

export type PaintStep = (steps: number) => PaintResult | undefined;

export class Board
{
    size: Point;
    data: number[];

    constructor(width: number, height: number)
    {
        this.size = new Point(width, height);
        this.data = new Array<number>(width * height);
    }

    //
    // Accessors
    //

    get width(): number { return this.size.x; }
    get height(): number { return this.size.y; }

    getIndex(point: Point): number
    {
        return point.x + point.y * this.width;
    }

    get(point: Point): number|undefined
    {
        if (point.x >= 0 && point.x < this.width && point.y >= 0 && point.y < this.height)
        {
            return this.data[this.getIndex(point)];
        }
        return undefined;
    }

    set(point: Point, c: number)
    {
        this.data[this.getIndex(point)] = c;
    }

    //
    // Iterators
    // These are constant functions that call a user function f for each pixel on the board satisfying some condition
    //

    // Calls f(i) for each pixel
    allf(f: (i: number) => any)
    {
        for (let i = 0; i < this.data.length; i++)
        {
            f(i);
        }
    }

    // Calls f(u, v) for each pixel (u, v) with ||(x, y) - (u, v)|| <= r
    circlef(center: Point, radius: number, f: (point: Point) => any)
    {
        let p = Math.floor(radius);
        for (let u = Math.max(-p, -center.x); u <= Math.min(p, this.width - 1 - center.x); u++)
        {
            let q = Math.floor(Math.sqrt(radius * radius - u * u));
            for (let v = Math.max(-q, -center.y); v <= Math.min(q, this.height - 1 - center.y); v++)
            {
                f(center.add(new Point(u, v)));
            }
        }
    }
    
    linefStep(start: Point, end: Point, clamp: boolean, single: boolean, f: (point: Point) => any): (steps: number) => boolean
    {
        // Line origin and direction
        let dir = end.sub(start);
        let pos = start.floor().array; // Current point on the line
        let stop = end.array; // Line stops if it reaches this point

        // absolute value and sign of direction
        let absDir = dir.abs().array;
        let absSlope = [absDir[1] / absDir[0], absDir[0] / absDir[1]]; // dy/dx, dx/dy
        let signDir = dir.sign().array;

        // Distance until the next pixel in each direction
        let dist = [0.5, 0.5];
        const size = this.size.array;

        // Previous step was in the x direction (0), y direction (1), or neither (nMove)
        const nMove = -1;
        let lastMove = nMove;

        return (numSteps) =>
        {
            while (numSteps > 0)
            {
                // Check if the end of the line was reached
                let final = (pos[0] === stop[0] && pos[1] === stop[1]);
                if (final)
                {
                    lastMove = nMove; // Always draw the end pixel
                }

                // Helper: move(0) moves in x, move(1) moves in y
                let move = (i: number) =>
                {
                    let j = 1 - i;
                    
                    // Check for diagonal step
                    if (single && lastMove !== i && lastMove !== nMove)
                    {
                        // Skip the last pixel
                        lastMove = nMove;
                    }
                    else
                    {
                        if (!f(new Point(pos[0], pos[1])))
                        {
                            final = true;
                            return;
                        }
                        numSteps--;
                        lastMove = i;
                    }

                    // move in x
                    dist[j] -= dist[i] * absSlope[i];
                    dist[i] = 1;
                    pos[i] += signDir[i];
                
                    // Check for collision with left/right edge
                    if (pos[i] < 0 || pos[i] >= size[i])
                    {
                        if (clamp && absDir[j] !== 0)
                        {
                            pos[i] = Math.min(Math.max(pos[i], 0), size[i] - 1);
                            stop[i] = pos[i];
                            absDir[i] = absSlope[0] = absSlope[1] = 0;
                        }
                        else
                        {
                            final = true;
                        }
                    }
                };

                // Check whether the line crosses x or y boundary next and move in that direction
                let moveDir = dist[0] * absDir[1] < dist[1] * absDir[0] ? 0 : 1;
                move(moveDir);
                
                if (final)
                {
                    return false;
                }
            }

            return true;
        };
    }

    // Optimization for dijkstrafStep to avoid constant realloc and clear
    dijkstraBuffer: Board | undefined;
    
    // Returns a function that will execute dijkstraf() in steps, increasing the maximum cost each time it is called by a
    // delta that you pass in (defaults to 1).  The step function returns false when it is complete.
    dijkstrafStep(start: Point, maxCost: number, f: (point: Point) => Node[])
    {
        // Buffer tracking whether each pixel has been visited.  0 = no, 1 = yes
        let visited: Board;
        if (this.dijkstraBuffer)
        {
            visited = this.dijkstraBuffer;
            this.dijkstraBuffer = undefined;
        }
        else
        {
            visited = this.buffer(0);
        }
        
        // Visit pixels in cost order beginning from the start point
        let queue = new PriorityQueue({ comparator: function(a: Node, b: Node) { return b.cost - a.cost; }}); // lower cost -> higher priority
        queue.enqueue(new Node(start, 0));

        // Track the bounding box of pixels visited
        let min: Point = start;
        let max: Point = start;

        // Return a stepping function
        let stepCost = 0;
        return (deltaCost = 1) =>
        {
            stepCost += deltaCost;
            while (queue.length)
            {
                if (queue.peek().cost > stepCost)
                {
                    return true;
                }
                let item = queue.dequeue() as Node;
                if (visited.get(item) === 0)
                {
                    visited.set(item, 1);
                    min = min.min(item);
                    max = max.max(item);
                    let neighbors = f(item);
                    for (const neighbor of neighbors)
                    {
                        neighbor.cost += item.cost;
                        if (neighbor.cost < maxCost)
                        {
                            queue.enqueue(neighbor);
                        }
                    }
                }
            }

            // Clear the buffer and save it for possible reuse
            if (!this.dijkstraBuffer)
            {
                for (let x = min.x; x <= max.x; x++)
                {
                    for (let y = min.y; y <= max.y; y++)
                    {
                        visited.set(new Point(x, y), 0);
                    }
                }
                this.dijkstraBuffer = visited;
            }
            
            return false;
        };
    }

    // Dijstra's algorithm.  Visits pixels starting from (x, y) in order by cost and calls f() at each one.
    // f(u, v, addNeighbor) receives the coordinates of the visited pixel and a function addNeighbor(u, v, cost)
    // which can be used to specify neighboring pixels and the cost to reach them from the current one.  f is
    // never called more than once for the same pixel.
    dijkstraf(start: Point, maxCost: number, f: (point: Point) => Node[])
    {
        this.dijkstrafStep(start, maxCost, f)(maxCost);
    }

    // Returns a function that will execute floodf() in steps.
    // Works the same as dijkstrafStep().
    floodfStep(start: Point, f: (point: Point) => boolean)
    {
        return this.dijkstrafStep(start, Infinity, (point: Point) =>
        {
            if (!f(point)) { return []; }
            return [
                new Node(point.add(new Point(-1, 0)), 1),
                new Node(point.add(new Point(1, 0)), 1),
                new Node(point.add(new Point(0, -1)), 1),
                new Node(point.add(new Point(0, 1)), 1),
            ];
        });
    }

    // Flood fill - calls f(u, v) for every pixel reachable through a series of horizontal and vertical steps from (x, y) such that f returns true for every
    // other pixel on the path.  f() is never called more than once for the same pixel.
    floodf(start: Point, f: (point: Point) => boolean)
    {
        this.floodfStep(start, f)(Infinity);
    }

    // Returns a function that will execute growf() in steps.
    // Works the same as dijkstrafStep().
    growfStep(start: Point, r: number, c: number, f: (point: Point) => boolean)
    {
        // Grow must start on a pixel of color c
        if (this.get(start) !== c)
        {
            return (steps: number) => false;
        }

        // Copy the flood fill of c at start to a board
        let off = c + 1; // just need any value other than c
        let floodBoard = new Board(this.width, this.height);
        floodBoard.clear(off);
        floodBoard.drawFlood(this, start, c);

        // Create a board to draw the grow fill to, initially blank
        let growBoard = new Board(this.width, this.height);
        growBoard.clear(off);

        // Search outwards from the flooded region
        let sqrt2 = Math.sqrt(2);
        return this.dijkstrafStep(start, r, (point: Point) =>
        {
            if (!f(point)) { return []; }

            // Draw the pixel
            this.set(point, c);

            // Move through the flood region for free
            let neighbor = (point: Point, cost: number) => new Node(point, floodBoard.get(point) === c ? 0 : cost);
            
            // Visit neighbors in cardinal + diagonal directions
            return [
                neighbor(point.add(new Point(1, 0)), 1),
                neighbor(point.add(new Point(1, 1)), sqrt2),
                neighbor(point.add(new Point(0, 1)), 1),
                neighbor(point.add(new Point(-1, 1)), sqrt2),
                neighbor(point.add(new Point(-1, 0)), 1),
                neighbor(point.add(new Point(-1, -1)), sqrt2),
                neighbor(point.add(new Point(0, -1)), 1),
                neighbor(point.add(new Point(1, -1)), sqrt2)
            ];
        });
    }

    // Sets every pixel to color c that is within r pixels of the continuous region of color c containing (x, y).
    // The continuous region is determined by flood().  The distances of pixels from that region are determined by
    // movement in the 8 cardinal + ordinal directions, a rough approximation of euclidean distance.
    growf(point: Point, r: number, c: number, f: (point: Point) => boolean)
    {
        this.growfStep(point, r, c, f)(Infinity);
    }

    //
    // Drawing
    //
    
    // Draw a circle of color c centered at (x, y) with radius r
    drawCircle(center: Point, r: number, c: number)
    {
        this.circlef(center, r, (point: Point) =>
        {
            this.set(point, c);
        });
    }
    
    // Draw a box of color c centered at x, y with dimensions w, h
    drawBox(center: Point, w: number, h: number, c: number)
    {
        let halfW = Math.floor((w - 1) / 2);
        let halfH = Math.floor((h - 1) / 2);
        for (let u = Math.max(-halfW, -center.x); u <= Math.min(halfW, this.width - 1 - center.x); u++)
        {
            for (let v = Math.max(-halfH, -center.y); v <= Math.min(halfH, this.height - 1 - center.y); v++)
            {
                this.set(center.add(new Point(u, v)), c);
            }
        }
    }
    
    // Draw a regular polygon of color c inscribed in the circle centered at x, y with radius r, oriented with angle a
    drawPoly(center: Point, s: number, r: number, a: number, c: number)
    {
        // Point (u, v) is on the plane if au + bv + c = 0
        // Planes are the infinite lines that the edges of the polygon lie on
        let planes = new Array(s);
        let rInner = r * Math.cos(Math.PI / s);
        for (let i = 0; i < s; i++)
        {
            let angle = i * 2 * Math.PI / s + a;
            let cos = Math.cos(angle);
            let sin = Math.sin(angle);
            planes[i] = {a: cos, b: sin, c: -cos * center.x - center.y * sin - rInner};
        }

        this.circlef(center, r, (point: Point) =>
        {
            for (let i = 0; i < s; i++)
            {
                let plane = planes[i];
                if (plane.a * point.x + plane.b * point.y + plane.c > 0)
                {
                    return;
                }
            }
            this.set(point, c);
        });
    }
    
    // Returns a stepping function that implements drawLine
    drawLineStep(start: Point, end: Point, p: number, c: number)
    {
        const clamp = false;
        const single = false;
        return this.linefStep(start, end, clamp, single, (point: Point) => 
        {
            this.set(point, c);
            if (--p === 0)
            {
                return false;
            }
            return true;
        });
    }
    
    // Draw a 1-pixel line of color c, from the center of (x, y) to the center of (ex, ey) or until it reaches p pixels.
    drawLine(start: Point, end: Point, p: number, c: number)
    {
        return this.drawLineStep(start, end, p, c)(Infinity);
    }
    
    // Returns a stepping function that implements paint
    // The function takes the number of steps to execute and returns undefined if stepping should continue, or
    // the paintf result if finished.
    paintfStep(start: Point, end: Point, r: number, p: number, c: number, f: (point: Point) => boolean): PaintStep
    {
        const clamp = true;
        const single = false;
        let current = start;
        let rSquared = r * r;
        const lineStep = this.linefStep(start, end, clamp, single, (point: Point) => 
        {
            console.log('line at ' + point.x + ', ' + point.y);
            // Check if the line gets blocked
            if (!f(point)) { return false; }

            // Remember the last successful line pixel
            current = point;

            // Floodfill a circle centered at the line pixel
            this.floodf(point, (point: Point) =>
            {
                // Check if the pixel is within the circle and not blocked by f
                if (point.distanceSquared(current) <= rSquared && f(point))
                {
                    // Only count pixels that are not already set
                    if (this.get(point) !== c)
                    {
                        this.set(point, c);
                        p--;
                    }
                    return true;
                }
                return false;
            });

            // Check if the pixel budget is empty
            if (p <= 0)
            {
                return false;
            }

            // Continue stepping
            return true;
        });

        return (steps: number) =>
        {
            if (lineStep(steps))
            {
                return undefined;
            }
            return new PaintResult(current, p);
        };
    }
    
    // Draw a circular brush of radius r and color c along the line from (x, y) to (ex, ey), until one of:
    // 1) the end is reached
    // 2) the number of newly set pixels reaches p
    // 3) f(u, v) returns false for a point (u, v) on the line
    // The circle is drawn by floodfill of points for which f() returns true, starting from each point on the line.
    // Returns a struct with:
    // - (x, y) the last successfully drawn point on the line
    // - p the number of pixels left over (may be negative)
    paintf(start: Point, end: Point, r: number, p: number, c: number, f: (point: Point) => boolean): PaintResult
    {
        return this.paintfStep(start, end, r, p, c, f)(Infinity) as PaintResult;
    }
    
    // Draw a crosshair centered at (x, y) with radius r and color c
    drawCross(center: Point, r: number, c: number)
    {
        for (let u = Math.max(-r, -center.x); u <= Math.min(r, this.width - 1 - center.x); u++)
        {
            this.set(center.add(new Point(u, 0)), c);
        }
        for (let v = Math.max(-r, -center.y); v <= Math.min(r, this.height - 1 - center.y); v++)
        {
            this.set(center.add(new Point(0, v)), c);
        }
    }

    // Copies the continuous (by cardinal movement) c-colored region of src containing (x, y) to this
    drawFlood(src: Board, start: Point, c: number)
    {
        src.floodf(start, (point: Point) =>
        {
            if (src.get(point) === c)
            {
                this.set(point, c);
                return true;
            }
            return false;
        });
    }

    // Sets pixels on the borders of regions of mask-colored pixels on board to on, and all other pixels to off
    outline(mask: number, on: number, off: number, src: Board)
    {
        this.matchDimensions(src);
        for (let u = 0; u < this.width; u++)
        {
            for (let v = 0; v < this.height; v++)
            {
                let point = new Point(u, v);
                let c = (src.get(point) === mask && (
                    src.get(new Point(u - 1, v)) !== mask || 
                    src.get(new Point(u + 1, v)) !== mask || 
                    src.get(new Point(u, v - 1)) !== mask || 
                    src.get(new Point(u, v + 1)) !== mask))
                    ? on : off;
                this.set(point, c);
            }
        }
    }

    // Push pixels outwards from a central point
    dynamite(center: Point, r: number, e: number)
    {
        let step = this.dynamiteStep(center, r, e);
        while (step()) {}
        return false;
    }
    
    // Return a stepping function that incrementally applies dynamite().
    // Call the stepping function until it returns false.
    // This can be used to animate the process.
    dynamiteStep(center: Point, r: number, e: number)
    {
        let area = Math.PI * r * r;

        let rounds = 10;
        let stepsPerRound = Math.floor(Math.PI * r);
        let steps = rounds * stepsPerRound;
        let anglePerStep = 2 * rounds * Math.PI / (steps - 1);

        let i = 0;
        return () =>
        {
            if (i >= steps)
            {
                return false;
            }
            let n = i + stepsPerRound;
            for (; i < n; i++)
            {
                let angle = i * anglePerStep;
                let dir = new Point(Math.cos(angle), Math.sin(angle));
                let rInt = Math.floor(r / rounds);
                let queue = new Array(Math.floor(rInt)).fill(e);
                let pressure = 0.5;
                let end = center.add(dir.mul(new Point(r * 100))).floor();
                let rSq = r * r;

                const clamp = true;
                const single = true;
                this.linefStep(center, end, clamp, single, (point: Point) =>
                {
                    let diff = point.sub(center);
                    let distSq = diff.dot(diff);

                    let c = this.get(point);
                    this.set(point, queue.shift());
                    if (distSq > rSq)
                    {
                        if (c === e)
                        {
                            pressure += 0.33;
                        }
                        else
                        {
                            pressure += 0.9;
                        }
                        if (pressure > 1)
                        {
                            pressure -= 1;
                            queue.push(c);
                        }
                        return (queue.length > 0);
                    }
                    else
                    {
                        queue.push(c);
                        return true;
                    }
                })(Infinity);
            }
            return true;
        };
    }

    //
    // Composition
    //
    
    // Sets every pixel to c.
    clear(c: number)
    {
        this.allf((i) => { this.data[i] = c; });
    }

    // Copies src into this.  Src must have the same dimensions as this.
    copy(src: Board)
    {
        this.matchDimensions(src);
        this.allf((i) => { this.data[i] = src.data[i]; });
    }

    // Returns a new board with the same dimensions as this
    buffer(c: number|undefined = undefined)
    {
        let board = new Board(this.width, this.height);
        if (c !== undefined)
        {
            board.clear(c);
        }
        return board;
    }

    // Returns a copy of this
    clone()
    {
        let board = this.buffer();
        board.copy(this);
        return board;
    }

    // For every pixel of src set to c, sets the same pixel in this board to c.  Src must have the same dimensions as this.
    add(src: Board, c: number)
    {
        this.matchDimensions(src);
        this.allf((i) =>
        { 
            if (src.data[i] === c)
            {
                this.data[i] = c;
            }
        });
    }

    //
    // Helpers
    //

    matchDimensions(board: Board)
    {
        if (this.width !== board.width && this.height !== board.height)
        {
            throw new Error('The input board has different dimensions than this one');
        }
    }

    //
    // Output
    //

    // Returns an array where the ith element has the number of pixels with value = i
    count(numValues: number)
    {
        let a = Array<number>(numValues).fill(0);
        this.allf((i) =>
        { 
            let valueCount = a[this.data[i]];
            if (valueCount)
            {
                valueCount++;
            }
            else
            {
                valueCount = 1;
            }
            a[this.data[i]] = valueCount;
        });
        return a;
    }

    // Returns the buffer size required to render this.  (See comments on render() for buffer format).
    bufferSize(scale: number)
    {
        // Scale each dimension, then multiply by 4 bytes per pixel.
        return (this.width * scale) * (this.height * scale) * 4;
    }
    
    // Render this to a buffer that can be uploaded to a texture.  If no buffer is passed in, a new one of the correct size is created.
    // Returns the buffer.
    // scale: positive integer pixel multiplier
    // palette: map values in this to [r, g, b, a].
    // buffer: UInt8Array.  r(0, 0), g(0, 0), b(0, 0), a(0, 0), r(1, 0), ..., a(width - 1, 0), r(0, 1), ...
    render(scale: number, palette: number[][], buffer: Uint8ClampedArray|undefined = undefined)
    {
        if (!buffer)
        {
            buffer = new Uint8ClampedArray(this.bufferSize(scale));
        }
        else if (buffer.length !== this.bufferSize(scale))
        {
            throw new Error('Incorrect buffer size');
        }

        const pixel = 4;
        let pitch = this.width * pixel * scale;
        for (let i = 0; i < this.width; i++)
        {
            for (let j = 0; j < this.height; j++)
            {
                let color = palette[this.get(new Point(i, j))??0];
                let k = j * pitch * scale + i * pixel * scale;
                for (let u = 0; u < scale; u++)
                {
                    for (let v = 0; v < scale; v++)
                    {
                        let l = k + pixel * v;
                        buffer[l] = color[0];
                        buffer[l + 1] = color[1];
                        buffer[l + 2] = color[2];
                        buffer[l + 3] = color[3];
                    }
                    k += pitch;
                }
            }
        }

        return buffer;
    }
}
