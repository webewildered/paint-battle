var PriorityQueue = require('./priority-queue.js');

class Board
{
    constructor(width, height)
    {
        this.width = width;
        this.height = height;
        this.data = new Array(width * height);
    }

    //
    // Accessors
    //

    getIndex(x, y)
    {
        return x + y * this.width;
    }

    get(x, y)
    {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height)
        {
            return this.data[this.getIndex(x, y)];
        }
        return null;
    }

    set(x, y, c)
    {
        this.data[this.getIndex(x, y)] = c;
    }

    //
    // Iterators
    // These are constant functions that call a user function f for each pixel on the board satisfying some condition
    //

    // Calls f(i) for each pixel
    allf(f)
    {
        for (let i = 0; i < this.data.length; i++)
        {
            f(i);
        }
    }

    // Calls f(u, v) for each pixel (u, v) with ||(x, y) - (u, v)|| <= r
    circlef(x, y, r, f)
    {
        let p = Math.floor(r);
        for (let u = Math.max(-p, -x); u <= Math.min(p, this.width - 1 - x); u++)
        {
            let q = Math.floor(Math.sqrt(r * r - u * u));
            for (let v = Math.max(-q, -y); v <= Math.min(q, this.height - 1 - y); v++)
            {
                f(x + u, y + v);
            }
        }
    }
    
    // Calls f for each pixel on a line from (x, y) to (ex, ey).  Terminates if f does not return true.
    // If clamp is false, the line will terminate when it reaches an edge of the board.
    // If clamp is true, the line will continue along that edge, terminating only if it is perpendicular to the edge or if it reaches a corner.
    // If single is false, f is called for every pixel that the line crosses through, so the line is a sequence of horizontal and vertical steps.
    // If single is true, then whenever the line would take a vertical step after a horizontal one or vice versa, it takes a single diagonal step instead.
    // Input coordinates are snapped to the middle of each pixel.
    // TODO - check the perpendicular cases.  Check behavior if the line begins outside of the board (we don't need to support that case, yet)
    linef(x, y, ex, ey, clamp, single, f)
    {
        // Line origin and direction
        let dx = ex - x;
        let dy = ey - y;
        let u = Math.floor(x);
        let v = Math.floor(y);

        // absolute value and sign of direction
        let adx = Math.abs(dx);
        let ady = Math.abs(dy);
        let adydx = ady / adx;
        let adxdy = adx / ady;
        let idx = (dx > 0) ? 1 : -1;
        let idy = (dy > 0) ? 1 : -1;

        // Distance until the next pixel in each direction
        let rx = 0.5;
        let ry = 0.5;

        // Previous step was in the x direction, y direction, or neither
        const nDir = -1;
        const xDir = single ? 0 : nDir;
        const yDir = single ? 1 : nDir;
        let dir = nDir;

        let i = 0;
        console.log('line')
        while (true)
        {
            // Check if the end of the line was reached
            if (u == ex && v == ey)
            {
                break;
            }

            if (rx * ady < ry * adx)
            {
                // Check for diagonal step
                if (dir != xDir && dir != nDir)
                {
                    // Skip the last pixel
                    dir = nDir;
                }
                else
                {
                    if (!f(u, v))
                    {
                        break;
                    }
                    dir = xDir;
                }

                // move in x
                ry -= rx * adydx;
                rx = 1;
                u += idx;
            
                // Check for collision with left/right edge
                if (u < 0 || u >= this.width)
                {
                    if (clamp && ady != 0)
                    {
                        u = Math.min(Math.max(u, 0), this.width - 1);
                        ex = u;
                        adx = adxdy = adydx = 0;
                    }
                    else
                    {
                        break;
                    }
                }
            }
            else
            {
                // Check for diagonal step
                if (dir != yDir && dir != nDir)
                {
                    // Skip the last pixel
                    dir = nDir;
                }
                else
                {
                    if (!f(u, v))
                    {
                        break;
                    }
                    dir = yDir;
                }
                
                // move in y
                rx -= ry * adxdy;
                ry = 1;
                v += idy;
                
                // Check for collision with top/bottom edge
                if (v < 0 || v >= this.height)
                {
                    if (clamp && adx != 0)
                    {
                        v = Math.min(Math.max(v, 0), this.height - 1);
                        ey = v;
                        ady = adxdy = adydx = 0;
                    }
                    else
                    {
                        break;
                    }
                }
            }
        }
    }

    // Uses Dijkstra's algorithm to call f(u, v) on pixels in distance order
    dijkstraf(x, y, maxCost, f)
    {
        // Buffer tracking whether each pixel has been visited.  0 = no, 1 = yes
        let visited = this.buffer();
        visited.clear(0);
        
        // Visit pixels in cost order
        let queue = new PriorityQueue({ comparator: function(a, b) { return a.cost - b.cost; }}); // lower cost -> higher priority
        queue.queue({x:x, y:y, cost:0});
        while (queue.length)
        {
            let item = queue.dequeue();
            let u = item.x;
            let v = item.y;
            if (visited.get(u, v) == 0)
            {
                visited.set(u, v, 1);
                f(u, v, (u, v, cost) =>
                {
                    cost += item.cost;
                    if (cost < maxCost)
                    {
                        queue.queue({x:u, y:v, cost:cost});
                    }
                });
            }
        }
    }

    // Flood fill - calls f(u, v) for every pixel reachable through a series of horizontal and vertical steps from (x, y) such that f returns true for every
    // other pixel on the path.  f() is never called more than once for the same pixel.
    floodf(x, y, f)
    {
        this.dijkstraf(x, y, Infinity, (u, v, visit) =>
        {
            if (f(u, v))
            {
                // Visit neighbors in all cardinal directions
                visit(u - 1, v, 1);
                visit(u + 1, v, 1);
                visit(u, v - 1, 1);
                visit(u, v + 1, 1);
            }
        })
    }

    // Sets every pixel to color c that is within r pixels of the continuous region of color c containing (x, y).
    // The continuous region is determined by flood().  The distances of pixels from that region are determined by
    // movement in the 8 cardinal + ordinal directions, a rough approximation of euclidean distance.
    grow(x, y, r, c)
    {
        // Grow must start on a pixel of color c
        if (this.get(x, y) != c)
        {
            return;
        }

        // Copy the flood fill of c at (x, y) to a board
        let off = c + 1; // just need any value other than c
        let floodBoard = new Board(this.width, this.height);
        floodBoard.clear(off);
        floodBoard.drawFlood(this, x, y, c);

        // Create a board to draw the grow fill to, initially blank
        let growBoard = new Board(this.width, this.height);
        growBoard.clear(off);

        // Search outwards from the flooded region
        let sqrt2 = Math.sqrt(2);
        this.dijkstraf(x, y, r, (u, v, visit) =>
        {
            // Draw the pixel
            this.set(u, v, c);

            // Move through the flood region for free
            let visit2 = (u, v, cost) => visit(u, v, floodBoard.get(u, v) == c ? 0 : cost);
            
            // Visit neighbors in cardinal + diagonal directions
            visit2(u + 1, v + 0, 1);
            visit2(u + 1, v + 1, sqrt2);
            visit2(u + 0, v + 1, 1);
            visit2(u - 1, v + 1, sqrt2);
            visit2(u - 1, v + 0, 1);
            visit2(u - 1, v - 1, sqrt2);
            visit2(u + 0, v - 1, 1);
            visit2(u + 1, v - 1, sqrt2);
        });
    }

    //
    // Drawing
    //
    
    // Draw a circle of color c centered at (x, y) with radius r
    drawCircle(x, y, r, c)
    {
        this.circlef(x, y, r, (u, v) =>
        {
            this.set(u, v, c);
        });
    }
    
    // Draw a box of color c centered at x, y with dimensions w, h
    drawBox(x, y, w, h, c)
    {
        let halfW = Math.floor((w - 1) / 2);
        let halfH = Math.floor((h - 1) / 2);
        for (let u = Math.max(-halfW, -x); u <= Math.min(halfW, this.width - 1 - x); u++)
        {
            for (let v = Math.max(-halfH, -y); v <= Math.min(halfH, this.height - 1 - y); v++)
            {
                this.set(x + u, y + v, c);
            }
        }
    }
    
    // Draw a regular polygon of color c inscribed in the circle centered at x, y with radius r, oriented with angle a
    drawPoly(x, y, s, r, a, c)
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
            planes[i] = {a: cos, b: sin, c: -cos * x - y * sin - rInner};
        }

        this.circlef(x, y, r, (u, v) =>
        {
            for (let i = 0; i < s; i++)
            {
                let plane = planes[i];
                if (plane.a * u + plane.b * v + plane.c > 0)
                {
                    return;
                }
            }
            this.set(u, v, c);
        });
    }
    
    // Draw a 1-pixel line of color c, from the center of (x, y) to the center of (ex, ey) or until it reaches p pixels.
    drawLine(x, y, ex, ey, p, c, board)
    {
        const clamp = false;
        const single = false;
        this.linef(x, y, ex, ey, clamp, single, (u, v) => 
        {
            this.set(u, v, c);
            if (--p == 0)
            {
                return false;
            }
            return true;
        });
    }
    
    // Draw a circular brush of radius r and color c along the line from (x, y) to (ex, ey), until the end is reached or the number of newly set pixels reaches p.
    paint(x, y, ex, ey, r, p, c, board)
    {
        const clamp = true;
        const single = false;
        this.linef(x, y, ex, ey, clamp, single, (u, v) => 
        {
            this.circlef(u, v, r, (u, v) =>
            {
                if (this.get(u, v) != c)
                {
                    this.set(u, v, c);
                    p--;
                }
            });
            if (p <= 0)
            {
                return false;
            }
            return true;
        });

        return p;
    }
    
    // Draw a crosshair centered at (x, y) with radius r and color c
    drawCross(x, y, r, c)
    {
        for (let u = Math.max(-r, -x); u <= Math.min(r, this.width - 1 - x); u++)
        {
            this.set(x + u, y, c);
        }
        for (let v = Math.max(-r, -y); v <= Math.min(r, this.height - 1 - y); v++)
        {
            this.set(x, y + v, c);
        }
    }

    // Copies the continuous (by cardinal movement) c-colored region of src containing (x, y) to this
    drawFlood(src, x, y, c)
    {
        src.floodf(x, y, (u, v) =>
        {
            if (src.get(u, v) == c)
            {
                this.set(u, v, c);
                return true;
            }
            return false;
        });
    }

    // Sets pixels on the borders of regions of mask-colored pixels on board to on, and all other pixels to off
    outline(mask, on, off, src)
    {
        this.matchDimensions(src);
        for (let u = 0; u < this.width; u++)
        {
            for (let v = 0; v < this.height; v++)
            {
                let c = (src.get(u, v) == mask && (
                    src.get(u - 1, v) != mask || 
                    src.get(u + 1, v) != mask || 
                    src.get(u, v - 1) != mask || 
                    src.get(u, v + 1) != mask))
                    ? on : off;
                this.set(u, v, c);
            }
        }
    }

    // Push pixels outwards from a central point
    dynamite(x, y, r, e)
    {
        let step = this.dynamiteStep(x, y, r, e);
        while (step()) {}
        return false;
    }
    
    // Return a stepping function that incrementally applies dynamite().
    // Call the stepping function until it returns false.
    // This can be used to animate the process.
    dynamiteStep(x, y, r, e)
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
                let xDir = Math.cos(angle);
                let yDir = Math.sin(angle);
                let rInt = Math.floor(r / rounds);
                let queue = new Array(Math.floor(rInt)).fill(e);
                let pressure = 0.5;
                let ex = Math.floor(x + xDir * r * 100);
                let ey = Math.floor(y + yDir * r * 100);
                let rSq = r * r;

                const clamp = true;
                const single = true;
                this.linef(x, y, ex, ey, clamp, single, (u, v) =>
                {
                    let xDiff = u - x;
                    let yDiff = v - y;
                    let distSq = xDiff * xDiff + yDiff * yDiff;

                    let c = this.get(u, v);
                    this.set(u, v, queue.shift());
                    if (distSq > rSq)
                    {
                        if (c == e)
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
                });
            }
            return true;
        }
    }

    //
    // Composition
    //
    
    // Sets every pixel to c.
    clear(c)
    {
        this.allf((i) => { this.data[i] = c; });
    }

    // Copies src into this.  Src must have the same dimensions as this.
    copy(src)
    {
        this.matchDimensions(src);
        this.allf((i) => { this.data[i] = src.data[i]; });
    }

    // Returns a new board with the same dimensions as this
    buffer()
    {
        return new Board(this.width, this.height);
    }

    // Returns a copy of this
    clone()
    {
        let board = this.buffer();
        board.copy(this);
        return board;
    }

    // For every pixel of src set to c, sets the same pixel in this board to c.  Src must have the same dimensions as this.
    add(src, c)
    {
        this.matchDimensions(src);
        this.allf((i) =>
        { 
            if (src.data[i] == c)
            {
                this.data[i] = c;
            }
        });
    }

    //
    // Helpers
    //

    matchDimensions(board)
    {
        if (this.width != board.width && this.height != board.height)
        {
            throw 'The input board has different dimensions than this one';
        }
    }

    //
    // Output
    //

    // Returns an array where the ith element has the number of pixels with value = i
    count(numValues)
    {
        let a = Array(numValues).fill(0);
        this.allf((i) =>
        { 
            let valueCount = a[this.data[i]];
            if (valueCount == null)
            {
                valueCount = 1;
            }
            else
            {
                valueCount++;
            }
            a[this.data[i]] = valueCount;
        });
        return a;
    }

    // Returns the buffer size required to render this.  (See comments on render() for buffer format).
    bufferSize(scale)
    {
        // Scale each dimension, then multiply by 4 bytes per pixel.
        return (this.width * scale) * (this.height * scale) * 4;
    }
    
    // Render this to a buffer that can be uploaded to a texture.  If no buffer is passed in, a new one of the correct size is created.
    // Returns the buffer.
    // scale: positive integer pixel multiplier
    // palette: map values in this to [r, g, b, a].
    // buffer: UInt8Array.  r(0, 0), g(0, 0), b(0, 0), a(0, 0), r(1, 0), ..., a(width - 1, 0), r(0, 1), ...
    render(scale, palette, buffer = null)
    {
        if (buffer == null)
        {
            buffer = new Uint8ClampedArray(this.bufferSize(scale))
        }
        else if (buffer.length != this.bufferSize(scale))
        {
            throw 'Incorrect buffer size';
        }

        const pixel = 4;
        let pitch = this.width * pixel * scale;
        for (let i = 0; i < this.width; i++)
        {
            for (let j = 0; j < this.height; j++)
            {
                let color = palette[this.get(i, j)];
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

module.exports = Board;
