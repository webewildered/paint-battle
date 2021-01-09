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
    //

    // Calls f(i) for each pixel
    allf(f)
    {
        for (let i = 0; i < this.data.length; i++)
        {
            f(i);
        }
    }

    // calls f(u, v) for each pixel (u, v) with ||(x, y) - (u, v)|| <= r
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

    //
    // Drawing
    //
    
    // Draw a circle of color c centered at (x, y) with radius r
    circle(x, y, r, c)
    {
        this.circlef(x, y, r, (u, v) =>
        {
            this.set(u, v, c);
        });
    }
    
    // Draw a box of color c centered at x, y with dimensions w, h
    box(x, y, w, h, c)
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
    poly(x, y, s, r, a, c)
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
    line(x, y, ex, ey, p, c, board)
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
    
    // Draw a crosshaircentered at (x, y) with radius r and color c
    crosshair(x, y, r, c)
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

    // Copies the continuous region of pixels with color c containing (x, y) from src, setting all other pixels to off.
    // A pixel is reachable from neighbors in the four cardinal directions.  If this.get(x, y) != c, then the region is empty.
    isolate(x, y, c, off, src)
    {
        this.clear(off);
        if (src.get(x, y) != c)
        {
            return;
        }

        let a = [{x:x, y:y}];
        let self = this;
        function visit(u, v)
        {
            if (src.get(u, v) == c && self.get(u, v) == off)
            {
                a.push({x:u, y:v});
            }
        }

        while (a.length)
        {
            let point = a.pop();
            let u = point.x;
            let v = point.y;
            this.set(u, v, c);

            visit(u - 1, v);
            visit(u + 1, v);
            visit(u, v - 1);
            visit(u, v + 1);
        }
    }

    // Sets every pixel to color c that is within r pixels of the continuous region of color c containing (x, y).
    // The continuous region is determined by isolate().  The distances of pixels from that region are determined by
    // movement in the 8 cardinal + ordinal directions, a rough approximation of euclidean distance.
    flood(x, y, r, c)
    {
        if (this.get(x, y) != c)
        {
            return false;
        }

        // Create a board with the isolated region
        let off = c + 1; // just need any value other than c
        let isoBoard = new Board(this.width, this.height);
        isoBoard.isolate(x, y, c, off, this);

        // Create a board to draw the flood fill to, initially blank
        let floodBoard = new Board(this.width, this.height);
        floodBoard.clear(off);
        
        // Queue for dijkstra's algorithm 
        let queue = new PriorityQueue({ comparator: function(a, b) { return a.cost - b.cost; }}); // lower cost -> higher priority
        queue.queue({x:x, y:y, cost:0});

        function visit(u, v, cost)
        {
            if (floodBoard.get(u, v) == off)
            {
                if (isoBoard.get(u, v) == c)
                {
                    cost = 0;
                } 
                if (cost <= r)
                {
                    queue.queue({x:u, y:v, cost:cost});
                }
            }
        }

        let sqrt2 = Math.sqrt(2);
        while (queue.length)
        {
            let item = queue.dequeue();
            let u = item.x;
            let v = item.y;
            let cost = item.cost;

            if (floodBoard.get(u, v) == c)
            {
                continue;
            }

            floodBoard.set(u, v, c);
            visit(u + 1, v + 0, cost + 1);
            visit(u + 1, v + 1, cost + sqrt2);
            visit(u + 0, v + 1, cost + 1);
            visit(u - 1, v + 1, cost + sqrt2);
            visit(u - 1, v + 0, cost + 1);
            visit(u - 1, v - 1, cost + sqrt2);
            visit(u + 0, v - 1, cost + 1);
            visit(u + 1, v - 1, cost + sqrt2);
        }

        // Copy the flooded pixels to this
        this.add(floodBoard, c);
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

    // Particle sim dynamite method -- too slow
    dynamite2(x, y, r, e)
    {
        // Helper for applying particle repulsion forces in a pair of cells.  cell0 may equal cell1.
        function force(cell0, cell1, h)
        {
            const repulsionDistance = (cell0 == cell1) ? Math.sqrt(2) : 1;
            const repulsionForce = 100;

            // For each pair of particles
            for (let i = 0; i < cell0.length; i++)
            {
                let p = cell0[i];
                for (let j = 0; j < cell1.length; j++)
                {
                    let q = cell1[j];
                    if (p == q)
                    {
                        continue; // no self-force
                    }

                    // Calculate distance between the particles and check if they're close enough to apply a repulsion force
                    let dx = p.x - q.x;
                    let dy = p.y - q.y;
                    let dSq = dx * dx + dy * dy;
                    if (dSq < repulsionDistance * repulsionDistance)
                    {
                        let d = Math.sqrt(dSq);
                
                        // Calculate the unit direction
                        // Special case to (1, 0) if the particle is exactly on the center
                        if (d == 0)
                        {
                            dx = 1;
                            dy = 0;
                        }
                        else
                        {
                            let invD = 1 / d;
                            dx *= invD;
                            dy *= invD;
                        }

                        // Apply explosive force to the particles
                        let dv = Math.sqrt(repulsionDistance - d) * repulsionForce * h * 0.5;
                        p.vx += dx * dv;
                        p.vy += dy * dv;
                        q.vx -= dx * dv;
                        q.vy -= dy * dv;
                    }
                }
            }
        }
        
        // Convert pixels to particles
        let particles = new Array(this.data.length);
        let particles2 = new Array(this.data.length); // backbuffer
        let maxValue = e;
        for (let i = 0; i < this.data.length; i++)
        {
            let c = this.data[i];
            if (c == e)
            {
                particles[i] = [];
            }
            else
            {
                maxValue = Math.max(maxValue, c);
                particles[i] = [{x: i % this.width + 0.5, y: Math.floor(i / this.width) + 0.5, vx: 0, vy: 0, c: c }];
            }
            particles2[i] = [];
        }

        // Simulate
        const h = 1 / 100;
        const steps = 100;
        const explosionSteps = 10;
        const explosionForce = 100;
        for (let step = 0; step < steps; step++)
        {
            // Apply explosive force to all particles
            if (step < explosionSteps)
            {
                // Explosion force starts high and scales down
                let f = explosionForce * (1 - step / explosionSteps);

                // For each cell within the explosion radius
                this.circlef(x, y, r, (u, v) =>
                {
                    // For each particle in the cell
                    let i = this.getIndex(u, v);
                    for (let j = 0; j < particles[i].length; j++)
                    {
                        // Calculate the particle's distance from the explosion center and check if it's within the radius
                        let p = particles[i][j];
                        let dx = p.x - x;
                        let dy = p.y - y;
                        let d = Math.sqrt(dx * dx + dy * dy);
                        if (d < r)
                        {
                            // Calculate the unit direction from the explosion center
                            // Special case to (1, 0) if the particle is exactly on the center
                            if (d == 0)
                            {
                                dx = 1;
                                dy = 0;
                            }
                            else
                            {
                                let invD = 1 / d;
                                dx *= invD;
                                dy *= invD;
                            }

                            // Apply explosive force to the particle
                            let dv = Math.sqrt(r - d) * f * h;
                            p.vx += dx * dv;
                            p.vy += dy * dv;
                        }
                    }
                });
            }

            // Apply forces between particles and integrate them into the backbuffer
            for (let u = 0; u < this.width; u++)
            {
                for (let v = 0; v < this.height; v++)
                {
                    // Apply forces within the cell
                    let i = this.getIndex(u, v)
                    force(particles[i], particles[i], h);

                    // Apply forces to neighboring cells
                    let du = (u != this.width - 1);
                    let dv = (v != this.height - 1);
                    if (du)
                    {
                        force(particles[i], particles[i + 1], h);
                        if (dv)
                        {
                            force(particles[i], particles[i + 1 + this.height], h);
                        }
                    }
                    if (dv)
                    {
                        force(particles[i], particles[i + this.height], h);
                    }

                    // Integrate
                    for (let j = 0; j < particles[i].length; j++)
                    {
                        let p = particles[i][j]
                        p.x += p.vx * h;
                        p.y += p.vy * h;
                        let pu = Math.floor(p.x);
                        let pv = Math.floor(p.y);
                        if (pu >= 0 && pu < this.width && pv >= 0 && pv < this.height)
                        {
                            particles2[this.getIndex(pu, pv)].push(p);
                        } // else particle is off the board and will be removed
                    }
                }
            }

            // Swap buffers and clear the backbuffer
            let temp = particles;
            particles = particles2;
            particles2 = temp;
            for (let i = 0; i < particles2.length; i++)
            {
                particles2[i].length = 0;
            }
        }

        // Render particles back to the board
        let lost = 0;
        for (let i = 0; i < particles.length; i++)
        {
            let c = e;
            if (particles[i].length == 1)
            {
                // Single particle in the cell, take its color
                c = particles[i][0].c;
            }
            else if (particles[i].length > 1)
            {
                lost += particles[i].length - 1;
                // Find what color has the most particles in this cell
                // (In the future maybe consider some biasing in case of ties for fairness, might not be needed though).
                let count = new Array(maxValue + 1).fill(0);
                let maxCount = 0;
                for (let j = 0; j < particles[i].length; j++)
                {
                    let pc = particles[i][j].c;
                    count[pc]++;
                    if (count[pc] > maxCount)
                    {
                        maxCount = count[pc];
                        c = pc;
                    }
                }
            } // else c = e because the cell is empty

            this.data[i] = c;
        }
        console.log("lost " + lost);
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

    clone()
    {
        let board = new Board(this.width, this.height);
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
