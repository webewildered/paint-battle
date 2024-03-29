import PriorityQueue from "priorityqueue";

export class Point
{
    constructor(
        public readonly x: number,
        public readonly y: number = x)
    {
    }

    static get zero() { return new Point(0); }
    
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
    neg() { return this.unary((a: number) => -a); }
    sign() { return this.unary((a: number) => Math.sign(a)); }
    floor() { return this.unary((a: number) => Math.floor(a)); }
    ceil() { return this.unary((a: number) => Math.ceil(a)); }
    sum() { return this.x + this.y; }
    distanceSquared(point: Point) { return this.sub(point).lengthSquared(); }
    distance(point: Point) { return Math.sqrt(this.distanceSquared(point)); }
    lengthSquared() { return this.dot(this); }
    length() { return Math.sqrt(this.lengthSquared()); }
    norm(): Point
    {
        let l = this.length();
        if (l === 0)
        {
            return Point.zero;
        }
        return this.mul(new Point(1 / l));
    }

    greaterEqual(point: Point)
    {
        return this.x >= point.x && this.y >= point.y;
    }

    equal(point: Point): boolean
    {
        return this.x === point.x && this.y === point.y;
    }

    clone(): Point
    {
        return new Point(this.x, this.y);
    }

    toString()
    {
        return '(' + this.x + ', ' + this.y + ')';
    }
}

export class Aabb
{
    constructor(public readonly min: Point, public readonly max: Point) {}

    static box(center: Point, size: Point)
    {
        let half = size.sub(new Point(1)).mul(new Point(0.5));
        return new Aabb(center.sub(half), center.add(half).add(new Point(1)));
    }

    get size(): Point { return this.max.sub(this.min); }

    intersect(other: Aabb): Aabb
    {
        return new Aabb(this.min.max(other.min), this.max.min(other.max));
    }
}

export class Node extends Point
{
    constructor(point: Point, public cost: number, public estimate: number = 0, public predecessor: number = -1)
    {
        super(point.x, point.y);
    }
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

    // Optimization for dijkstrafStep to avoid constant realloc and clear
    dijkstraBuffer: ReusableBuffer;

    constructor(width: number, height: number)
    {
        this.size = new Point(width, height);
        this.data = new Array<number>(width * height);

        this.dijkstraBuffer = new ReusableBuffer(this);
    }

    //
    // Accessors
    //

    get width(): number { return this.size.x; }
    get height(): number { return this.size.y; }
    get aabb(): Aabb { return new Aabb(Point.zero, this.size); }

    getIndex(point: Point): number
    {
        return point.x + point.y * this.width;
    }

    getPoint(index: number): Point
    {
        let y = Math.floor(index / this.width);
        let x = index - y * this.width;
        return new Point(x, y);
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
    
    linef(start: Point, end: Point, clamp: boolean, single: boolean, f: (point: Point) => any)
    {
        this.linefStep(start, end, clamp, single, f)(Infinity);
    }
    
    // Returns a function that will execute dijkstraf() in steps, increasing the maximum cost each time it is called by a
    // delta that you pass in (defaults to 1).  The step function returns false when it is complete.
    dijkstrafStep(start: Point[], maxCost: number, f: (point: Point, path: () => Point[]) => Node[] | undefined)
    {
        // Buffer tracking visited pixels. -1 = unvisited, otherwise the value is the index of the previous pixel on the path,
        // or in the case of the first pixel, its own index
        let visited = this.dijkstraBuffer.take();
        
        // Visit pixels in cost order beginning from the start point
        let queue = new PriorityQueue({ comparator: function(a: Node, b: Node)
            { return (b.cost + b.estimate) - (a.cost + a.estimate); }}); // lower cost -> higher priority
        for (const point of start)
        {
            queue.enqueue(new Node(point, 0, 0, visited.getIndex(point)));
        };

        // Track the bounding box of pixels visited
        let min: Point = new Point(Infinity);
        let max: Point = new Point(-Infinity);

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
                if (visited.get(item)! < 0)
                {
                    visited.set(item, item.predecessor);
                    min = min.min(item);
                    max = max.max(item);
                    const neighbors = f(item, () =>
                    {
                        let path = new Array<Point>();
                        let index = visited.getIndex(item);
                        while (true)
                        {
                            let predecessor = visited.data[index];
                            if (predecessor === index)
                            {
                                return path;
                            }
                            path.push(visited.getPoint(predecessor));
                            index = predecessor;
                        }
                    });
                    if (!neighbors)
                    {
                        return false;
                    }
                    const index = visited.getIndex(item);
                    for (const neighbor of neighbors)
                    {
                        neighbor.cost += item.cost;
                        neighbor.predecessor = index;
                        if (neighbor.cost < maxCost)
                        {
                            queue.enqueue(neighbor);
                        }
                    }
                }
            }

            // Clear the buffer and save it for possible reuse
            this.dijkstraBuffer.return(visited, min, max);
            
            return false;
        };
    }

    // Dijstra's algorithm.  Visits pixels starting from (x, y) in order by cost and calls f() at each one.
    // f(point, path) receives the coordinates of the visited pixel in point and can call path() to get an
    // array containing the path from start to point, beginning with the first pixel before point and ending
    // with start.  f returns a list of point's neighbors and the cost to reach them from point; the returned
    // Nodes' predecessors are unused and do not need to be set. If f returns undefined then the search
    // terminates immediately.
    dijkstraf(start: Point[], maxCost: number, f: (point: Point, path: () => Point[]) => Node[] | undefined)
    {
        this.dijkstrafStep(start, maxCost, f)(maxCost);
    }

    // Returns a function that will execute floodf() in steps.
    // Works the same as dijkstrafStep().
    floodfStep(start: Point[], f: (point: Point, path: () => Point[]) => boolean)
    {
        return this.dijkstrafStep(start, Infinity, (point: Point, path: () => Point[]) =>
        {
            if (!f(point, path)) { return []; }
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
    floodf(start: Point[], f: (point: Point, path: () => Point[]) => boolean)
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
        return this.dijkstrafStep([start], r, (point: Point) =>
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

    // Finds the shortest path from start to target via a series of single-pixel horizontal and vertical steps such that
    // for every point on the path, f returns true. Returns a list of points from start to target inclusive, or an empty
    // list if no path exists.
    pathf(start: Point, target: Point, f: (point: Point) => boolean): Point[]
    {
        let pathOut: Point[] = [];
        let step = this.dijkstraf([start], Infinity, (point: Point, path: () => Point[]) =>
        {
            // Check if the target was reached
            if (point.equal(target))
            {
                // Save the path and terminate the search
                pathOut = path();
                pathOut.reverse();
                pathOut.push(target);
                return undefined;
            }

            const neighbors: Node[] = [];
            let addNeighbor = (direction: Point) =>
            {
                const neighbor = point.add(direction);
                if (f(neighbor))
                {
                    neighbors.push(new Node(neighbor, 1));
                }
            };
            
            addNeighbor(new Point(-1, 0));
            addNeighbor(new Point(1, 0));
            addNeighbor(new Point(0, -1));
            addNeighbor(new Point(0, 1));
            return neighbors;
        });
        return pathOut;
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
    
    // Draw a box of color c centered at x, y with dimensions w, h
    drawAabb(aabb: Aabb, c: number)
    {
        for (let u = aabb.min.x; u < aabb.max.x; u++)
        {
            for (let v = aabb.min.y; v < aabb.max.y; v++)
            {
                this.set(new Point(u, v), c);
            }
        }
    }
    
    // Draw a regular polygon of color c inscribed in the circle centered at x, y with radius r, oriented with angle a
    drawPoly(center: Point, s: number, r: number, a: number, c: number)
    {
        let poly = this.polyf(center, s, r, a);
        this.circlef(center, r, (point: Point) =>
        {
            if (poly(point))
            {
                this.set(point, c);
            }
        });
    }

    // Returns a function that takes a point and returns true iff the point is inside the regular s-sided polygon
    // insccribed in the circle at center with radius r, oriented with angle a
    polyf(center: Point, s: number, r: number, a: number): (point: Point) => boolean
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

        return (point: Point) =>
        {
            for (let i = 0; i < s; i++)
            {
                let plane = planes[i];
                if (plane.a * point.x + plane.b * point.y + plane.c > 0)
                {
                    return false;
                }
            }
            return true;
        };
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
            // Check if the line gets blocked
            if (!f(point)) { return false; }

            // Remember the last successful line pixel
            current = point;

            // Floodfill a circle centered at the line pixel
            this.floodf([point], (point: Point) =>
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
        src.floodf([start], (point: Point) =>
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
    // Blit
    //
    
    cut(aabb: Aabb, c: number): Board
    {
        const source = aabb.intersect(this.aabb);
        const sourceSize = source.size;
        const dest = new Board(sourceSize.x, sourceSize.y);
        for (let u = 0; u < sourceSize.x; u++)
        {
            for (let v = 0; v < sourceSize.y; v++)
            {
                const p = new Point(u, v);
                const q = p.add(source.min);
                dest.set(p, this.get(q)!);
                this.set(q, c);
            }
        }
        return dest;
    }

    paste(source: Board, position: Point)
    {
        // Paste in at the second position
        const dest = new Aabb(position, position.add(source.size)).intersect(this.aabb);
        const destSize = dest.size;
        const origin = dest.min.sub(position);
        for (let u = 0; u < destSize.x; u++)
        {
            for (let v = 0; v < destSize.y; v++)
            {
                let p = new Point(u, v);
                this.set(p.add(dest.min), source.get(p.add(origin))!);
            }
        }
    }

    //
    // Composition
    //
    
    // Sets every pixel to c.
    clear(c: number)
    {
        this.data.fill(c);
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
    render(palette: number[][], buffer: Uint8ClampedArray|undefined = undefined)
    {
        if (!buffer)
        {
            buffer = new Uint8ClampedArray(this.bufferSize(1));
        }
        else if (buffer.length !== this.bufferSize(1))
        {
            throw new Error('Incorrect buffer size');
        }

        const size = this.width * this.height;
        let j = 0; // index into buffer
        for (let i = 0; i < size; i++)
        { 
            let color = palette[this.data[i]];
            buffer[j] = color[0];
            buffer[j + 1] = color[1];
            buffer[j + 2] = color[2];
            buffer[j + 3] = color[3];
            j += 4;
        }

        return buffer;
    }
}

export class ReusableBuffer
{
    buffer: Board | undefined;

    constructor(public board: Board) {}

    // takeMask() returns a buffer cleared to -1 with dimensions matching this.board
    // returnMask() takes a buffer with a dirty region and clears it to 0 for reuse
    take(): Board
    {
        let buffer: Board;
        if (this.buffer)
        {
            buffer = this.buffer;
            this.buffer = undefined;
        }
        else
        {
            buffer = this.board.buffer(-1);
        }
        return buffer;
    }

    return(buffer: Board, minDirty: Point, maxDirty: Point)
    {
        this.board.matchDimensions(buffer);
        for (let x = minDirty.x; x <= maxDirty.x; x++)
        {
            for (let y = minDirty.y; y <= maxDirty.y; y++)
            {
                buffer.set(new Point(x, y), -1);
            }
        }
        this.buffer = buffer;
    }
}
