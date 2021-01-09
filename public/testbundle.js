(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
                if (dir == yDir)
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
                if (dir == xDir)
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
        const single = true;
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
        const single = false
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
        let area = Math.PI * r * r;

        let rounds = 10;
        let stepsPerRound = Math.floor(Math.PI * r);
        let steps = rounds * stepsPerRound;
        let anglePerStep = 2 * rounds * Math.PI / (steps - 1);

        let i = 0;
        let board = this;
        function step()
        {
            if (i >= steps)
            {
                return;
            }
            let n = i + stepsPerRound;
            for (; i < n; i++)
            {
                let angle = i * anglePerStep;
                let xDir = Math.cos(angle);
                let yDir = Math.sin(angle);
                const clamp = true;
                const single = true;
                let rInt = Math.floor(r / rounds);
                let queue = new Array(Math.floor(rInt)).fill(e);
                let pressure = 0.5;
                let ex = Math.floor(x + xDir * r * 100);
                let ey = Math.floor(y + yDir * r * 100);
                let rSq = r * r;
                board.linef(x, y, ex, ey, clamp, single, (u, v) =>
                {
                    let xDiff = u - x;
                    let yDiff = v - y;
                    let distSq = xDiff * xDiff + yDiff * yDiff;

                    let c = board.get(u, v);
                    board.set(u, v, queue.shift());
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
        }

        return step;
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

},{"./priority-queue.js":2}],2:[function(require,module,exports){
(function (global){(function (){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.PriorityQueue = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var AbstractPriorityQueue, ArrayStrategy, BHeapStrategy, BinaryHeapStrategy, PriorityQueue,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

AbstractPriorityQueue = _dereq_('./PriorityQueue/AbstractPriorityQueue');

ArrayStrategy = _dereq_('./PriorityQueue/ArrayStrategy');

BinaryHeapStrategy = _dereq_('./PriorityQueue/BinaryHeapStrategy');

BHeapStrategy = _dereq_('./PriorityQueue/BHeapStrategy');

PriorityQueue = (function(superClass) {
  extend(PriorityQueue, superClass);

  function PriorityQueue(options) {
    options || (options = {});
    options.strategy || (options.strategy = BinaryHeapStrategy);
    options.comparator || (options.comparator = function(a, b) {
      return (a || 0) - (b || 0);
    });
    PriorityQueue.__super__.constructor.call(this, options);
  }

  return PriorityQueue;

})(AbstractPriorityQueue);

PriorityQueue.ArrayStrategy = ArrayStrategy;

PriorityQueue.BinaryHeapStrategy = BinaryHeapStrategy;

PriorityQueue.BHeapStrategy = BHeapStrategy;

module.exports = PriorityQueue;


},{"./PriorityQueue/AbstractPriorityQueue":2,"./PriorityQueue/ArrayStrategy":3,"./PriorityQueue/BHeapStrategy":4,"./PriorityQueue/BinaryHeapStrategy":5}],2:[function(_dereq_,module,exports){
var AbstractPriorityQueue;

module.exports = AbstractPriorityQueue = (function() {
  function AbstractPriorityQueue(options) {
    var ref;
    if ((options != null ? options.strategy : void 0) == null) {
      throw 'Must pass options.strategy, a strategy';
    }
    if ((options != null ? options.comparator : void 0) == null) {
      throw 'Must pass options.comparator, a comparator';
    }
    this.priv = new options.strategy(options);
    this.length = (options != null ? (ref = options.initialValues) != null ? ref.length : void 0 : void 0) || 0;
  }

  AbstractPriorityQueue.prototype.queue = function(value) {
    this.length++;
    this.priv.queue(value);
    return void 0;
  };

  AbstractPriorityQueue.prototype.dequeue = function(value) {
    if (!this.length) {
      throw 'Empty queue';
    }
    this.length--;
    return this.priv.dequeue();
  };

  AbstractPriorityQueue.prototype.peek = function(value) {
    if (!this.length) {
      throw 'Empty queue';
    }
    return this.priv.peek();
  };

  AbstractPriorityQueue.prototype.clear = function() {
    this.length = 0;
    return this.priv.clear();
  };

  return AbstractPriorityQueue;

})();


},{}],3:[function(_dereq_,module,exports){
var ArrayStrategy, binarySearchForIndexReversed;

binarySearchForIndexReversed = function(array, value, comparator) {
  var high, low, mid;
  low = 0;
  high = array.length;
  while (low < high) {
    mid = (low + high) >>> 1;
    if (comparator(array[mid], value) >= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

module.exports = ArrayStrategy = (function() {
  function ArrayStrategy(options) {
    var ref;
    this.options = options;
    this.comparator = this.options.comparator;
    this.data = ((ref = this.options.initialValues) != null ? ref.slice(0) : void 0) || [];
    this.data.sort(this.comparator).reverse();
  }

  ArrayStrategy.prototype.queue = function(value) {
    var pos;
    pos = binarySearchForIndexReversed(this.data, value, this.comparator);
    this.data.splice(pos, 0, value);
    return void 0;
  };

  ArrayStrategy.prototype.dequeue = function() {
    return this.data.pop();
  };

  ArrayStrategy.prototype.peek = function() {
    return this.data[this.data.length - 1];
  };

  ArrayStrategy.prototype.clear = function() {
    this.data.length = 0;
    return void 0;
  };

  return ArrayStrategy;

})();


},{}],4:[function(_dereq_,module,exports){
var BHeapStrategy;

module.exports = BHeapStrategy = (function() {
  function BHeapStrategy(options) {
    var arr, i, j, k, len, ref, ref1, shift, value;
    this.comparator = (options != null ? options.comparator : void 0) || function(a, b) {
      return a - b;
    };
    this.pageSize = (options != null ? options.pageSize : void 0) || 512;
    this.length = 0;
    shift = 0;
    while ((1 << shift) < this.pageSize) {
      shift += 1;
    }
    if (1 << shift !== this.pageSize) {
      throw 'pageSize must be a power of two';
    }
    this._shift = shift;
    this._emptyMemoryPageTemplate = arr = [];
    for (i = j = 0, ref = this.pageSize; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      arr.push(null);
    }
    this._memory = [];
    this._mask = this.pageSize - 1;
    if (options.initialValues) {
      ref1 = options.initialValues;
      for (k = 0, len = ref1.length; k < len; k++) {
        value = ref1[k];
        this.queue(value);
      }
    }
  }

  BHeapStrategy.prototype.queue = function(value) {
    this.length += 1;
    this._write(this.length, value);
    this._bubbleUp(this.length, value);
    return void 0;
  };

  BHeapStrategy.prototype.dequeue = function() {
    var ret, val;
    ret = this._read(1);
    val = this._read(this.length);
    this.length -= 1;
    if (this.length > 0) {
      this._write(1, val);
      this._bubbleDown(1, val);
    }
    return ret;
  };

  BHeapStrategy.prototype.peek = function() {
    return this._read(1);
  };

  BHeapStrategy.prototype.clear = function() {
    this.length = 0;
    this._memory.length = 0;
    return void 0;
  };

  BHeapStrategy.prototype._write = function(index, value) {
    var page;
    page = index >> this._shift;
    while (page >= this._memory.length) {
      this._memory.push(this._emptyMemoryPageTemplate.slice(0));
    }
    return this._memory[page][index & this._mask] = value;
  };

  BHeapStrategy.prototype._read = function(index) {
    return this._memory[index >> this._shift][index & this._mask];
  };

  BHeapStrategy.prototype._bubbleUp = function(index, value) {
    var compare, indexInPage, parentIndex, parentValue;
    compare = this.comparator;
    while (index > 1) {
      indexInPage = index & this._mask;
      if (index < this.pageSize || indexInPage > 3) {
        parentIndex = (index & ~this._mask) | (indexInPage >> 1);
      } else if (indexInPage < 2) {
        parentIndex = (index - this.pageSize) >> this._shift;
        parentIndex += parentIndex & ~(this._mask >> 1);
        parentIndex |= this.pageSize >> 1;
      } else {
        parentIndex = index - 2;
      }
      parentValue = this._read(parentIndex);
      if (compare(parentValue, value) < 0) {
        break;
      }
      this._write(parentIndex, value);
      this._write(index, parentValue);
      index = parentIndex;
    }
    return void 0;
  };

  BHeapStrategy.prototype._bubbleDown = function(index, value) {
    var childIndex1, childIndex2, childValue1, childValue2, compare;
    compare = this.comparator;
    while (index < this.length) {
      if (index > this._mask && !(index & (this._mask - 1))) {
        childIndex1 = childIndex2 = index + 2;
      } else if (index & (this.pageSize >> 1)) {
        childIndex1 = (index & ~this._mask) >> 1;
        childIndex1 |= index & (this._mask >> 1);
        childIndex1 = (childIndex1 + 1) << this._shift;
        childIndex2 = childIndex1 + 1;
      } else {
        childIndex1 = index + (index & this._mask);
        childIndex2 = childIndex1 + 1;
      }
      if (childIndex1 !== childIndex2 && childIndex2 <= this.length) {
        childValue1 = this._read(childIndex1);
        childValue2 = this._read(childIndex2);
        if (compare(childValue1, value) < 0 && compare(childValue1, childValue2) <= 0) {
          this._write(childIndex1, value);
          this._write(index, childValue1);
          index = childIndex1;
        } else if (compare(childValue2, value) < 0) {
          this._write(childIndex2, value);
          this._write(index, childValue2);
          index = childIndex2;
        } else {
          break;
        }
      } else if (childIndex1 <= this.length) {
        childValue1 = this._read(childIndex1);
        if (compare(childValue1, value) < 0) {
          this._write(childIndex1, value);
          this._write(index, childValue1);
          index = childIndex1;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return void 0;
  };

  return BHeapStrategy;

})();


},{}],5:[function(_dereq_,module,exports){
var BinaryHeapStrategy;

module.exports = BinaryHeapStrategy = (function() {
  function BinaryHeapStrategy(options) {
    var ref;
    this.comparator = (options != null ? options.comparator : void 0) || function(a, b) {
      return a - b;
    };
    this.length = 0;
    this.data = ((ref = options.initialValues) != null ? ref.slice(0) : void 0) || [];
    this._heapify();
  }

  BinaryHeapStrategy.prototype._heapify = function() {
    var i, j, ref;
    if (this.data.length > 0) {
      for (i = j = 1, ref = this.data.length; 1 <= ref ? j < ref : j > ref; i = 1 <= ref ? ++j : --j) {
        this._bubbleUp(i);
      }
    }
    return void 0;
  };

  BinaryHeapStrategy.prototype.queue = function(value) {
    this.data.push(value);
    this._bubbleUp(this.data.length - 1);
    return void 0;
  };

  BinaryHeapStrategy.prototype.dequeue = function() {
    var last, ret;
    ret = this.data[0];
    last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._bubbleDown(0);
    }
    return ret;
  };

  BinaryHeapStrategy.prototype.peek = function() {
    return this.data[0];
  };

  BinaryHeapStrategy.prototype.clear = function() {
    this.length = 0;
    this.data.length = 0;
    return void 0;
  };

  BinaryHeapStrategy.prototype._bubbleUp = function(pos) {
    var parent, x;
    while (pos > 0) {
      parent = (pos - 1) >>> 1;
      if (this.comparator(this.data[pos], this.data[parent]) < 0) {
        x = this.data[parent];
        this.data[parent] = this.data[pos];
        this.data[pos] = x;
        pos = parent;
      } else {
        break;
      }
    }
    return void 0;
  };

  BinaryHeapStrategy.prototype._bubbleDown = function(pos) {
    var last, left, minIndex, right, x;
    last = this.data.length - 1;
    while (true) {
      left = (pos << 1) + 1;
      right = left + 1;
      minIndex = pos;
      if (left <= last && this.comparator(this.data[left], this.data[minIndex]) < 0) {
        minIndex = left;
      }
      if (right <= last && this.comparator(this.data[right], this.data[minIndex]) < 0) {
        minIndex = right;
      }
      if (minIndex !== pos) {
        x = this.data[minIndex];
        this.data[minIndex] = this.data[pos];
        this.data[pos] = x;
        pos = minIndex;
      } else {
        break;
      }
    }
    return void 0;
  };

  return BinaryHeapStrategy;

})();


},{}]},{},[1])(1)
});
}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],3:[function(require,module,exports){
const Board = require('./board.js');

$(function()
{
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
    
    let palette = [
        [0x3d, 0x1d, 0xef, 0xff],
        [0xff, 0xff, 0xff, 0xff]
    ];
    let c = 0;
    let e = 1;

    let app = new PIXI.Application({
        width: 800, height: 800, backgroundColor: 0xeeeeee, resolution: window.devicePixelRatio || 1, antialias: true
    });
    document.body.appendChild(app.view);

    let board = new Board(299, 299);
    board.clear(e);
    //board.circle(149, 149, 25.5, c);
    board.box(149, 149, 50, 30, c);

    let scale = 2;
    let sprite = new PIXI.Sprite;
    sprite.x = 10;
    sprite.y = 10;
    sprite.texture = rtt(board, scale, palette);
    sprite.interactive = true;
    app.stage.addChild(sprite);

    let text = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
    app.stage.addChild(text);
    text.y = sprite.y + sprite.height + 10;
    text.x = sprite.x + 10;
    text.text = board.count(0)[0];

    let step = board.dynamite(149, 149, 30, e);
    sprite.on('mousedown', (event) =>
    {
        step();
        text.text = board.count(0)[0];
        sprite.texture = rtt(board, scale, palette);
    });
});
},{"./board.js":1}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImJvYXJkLmpzIiwicHJpb3JpdHktcXVldWUuanMiLCJ0ZXN0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3B5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwidmFyIFByaW9yaXR5UXVldWUgPSByZXF1aXJlKCcuL3ByaW9yaXR5LXF1ZXVlLmpzJyk7XHJcblxyXG5jbGFzcyBCb2FyZFxyXG57XHJcbiAgICBjb25zdHJ1Y3Rvcih3aWR0aCwgaGVpZ2h0KVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmRhdGEgPSBuZXcgQXJyYXkod2lkdGggKiBoZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vXHJcbiAgICAvLyBBY2Nlc3NvcnNcclxuICAgIC8vXHJcblxyXG4gICAgZ2V0SW5kZXgoeCwgeSlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4geCArIHkgKiB0aGlzLndpZHRoO1xyXG4gICAgfVxyXG5cclxuICAgIGdldCh4LCB5KVxyXG4gICAge1xyXG4gICAgICAgIGlmICh4ID49IDAgJiYgeCA8IHRoaXMud2lkdGggJiYgeSA+PSAwICYmIHkgPCB0aGlzLmhlaWdodClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRhdGFbdGhpcy5nZXRJbmRleCh4LCB5KV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHNldCh4LCB5LCBjKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZGF0YVt0aGlzLmdldEluZGV4KHgsIHkpXSA9IGM7XHJcbiAgICB9XHJcblxyXG4gICAgLy9cclxuICAgIC8vIEl0ZXJhdG9yc1xyXG4gICAgLy9cclxuXHJcbiAgICAvLyBDYWxscyBmKGkpIGZvciBlYWNoIHBpeGVsXHJcbiAgICBhbGxmKGYpXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRhdGEubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBmKGkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBjYWxscyBmKHUsIHYpIGZvciBlYWNoIHBpeGVsICh1LCB2KSB3aXRoIHx8KHgsIHkpIC0gKHUsIHYpfHwgPD0gclxyXG4gICAgY2lyY2xlZih4LCB5LCByLCBmKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwID0gTWF0aC5mbG9vcihyKTtcclxuICAgICAgICBmb3IgKGxldCB1ID0gTWF0aC5tYXgoLXAsIC14KTsgdSA8PSBNYXRoLm1pbihwLCB0aGlzLndpZHRoIC0gMSAtIHgpOyB1KyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcSA9IE1hdGguZmxvb3IoTWF0aC5zcXJ0KHIgKiByIC0gdSAqIHUpKTtcclxuICAgICAgICAgICAgZm9yIChsZXQgdiA9IE1hdGgubWF4KC1xLCAteSk7IHYgPD0gTWF0aC5taW4ocSwgdGhpcy5oZWlnaHQgLSAxIC0geSk7IHYrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZih4ICsgdSwgeSArIHYpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDYWxscyBmIGZvciBlYWNoIHBpeGVsIG9uIGEgbGluZSBmcm9tICh4LCB5KSB0byAoZXgsIGV5KS4gIFRlcm1pbmF0ZXMgaWYgZiBkb2VzIG5vdCByZXR1cm4gdHJ1ZS5cclxuICAgIC8vIElmIGNsYW1wIGlzIGZhbHNlLCB0aGUgbGluZSB3aWxsIHRlcm1pbmF0ZSB3aGVuIGl0IHJlYWNoZXMgYW4gZWRnZSBvZiB0aGUgYm9hcmQuXHJcbiAgICAvLyBJZiBjbGFtcCBpcyB0cnVlLCB0aGUgbGluZSB3aWxsIGNvbnRpbnVlIGFsb25nIHRoYXQgZWRnZSwgdGVybWluYXRpbmcgb25seSBpZiBpdCBpcyBwZXJwZW5kaWN1bGFyIHRvIHRoZSBlZGdlIG9yIGlmIGl0IHJlYWNoZXMgYSBjb3JuZXIuXHJcbiAgICAvLyBJZiBzaW5nbGUgaXMgZmFsc2UsIGYgaXMgY2FsbGVkIGZvciBldmVyeSBwaXhlbCB0aGF0IHRoZSBsaW5lIGNyb3NzZXMgdGhyb3VnaCwgc28gdGhlIGxpbmUgaXMgYSBzZXF1ZW5jZSBvZiBob3Jpem9udGFsIGFuZCB2ZXJ0aWNhbCBzdGVwcy5cclxuICAgIC8vIElmIHNpbmdsZSBpcyB0cnVlLCB0aGVuIHdoZW5ldmVyIHRoZSBsaW5lIHdvdWxkIHRha2UgYSB2ZXJ0aWNhbCBzdGVwIGFmdGVyIGEgaG9yaXpvbnRhbCBvbmUgb3IgdmljZSB2ZXJzYSwgaXQgdGFrZXMgYSBzaW5nbGUgZGlhZ29uYWwgc3RlcCBpbnN0ZWFkLlxyXG4gICAgLy8gSW5wdXQgY29vcmRpbmF0ZXMgYXJlIHNuYXBwZWQgdG8gdGhlIG1pZGRsZSBvZiBlYWNoIHBpeGVsLlxyXG4gICAgLy8gVE9ETyAtIGNoZWNrIHRoZSBwZXJwZW5kaWN1bGFyIGNhc2VzLiAgQ2hlY2sgYmVoYXZpb3IgaWYgdGhlIGxpbmUgYmVnaW5zIG91dHNpZGUgb2YgdGhlIGJvYXJkICh3ZSBkb24ndCBuZWVkIHRvIHN1cHBvcnQgdGhhdCBjYXNlLCB5ZXQpXHJcbiAgICBsaW5lZih4LCB5LCBleCwgZXksIGNsYW1wLCBzaW5nbGUsIGYpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTGluZSBvcmlnaW4gYW5kIGRpcmVjdGlvblxyXG4gICAgICAgIGxldCBkeCA9IGV4IC0geDtcclxuICAgICAgICBsZXQgZHkgPSBleSAtIHk7XHJcbiAgICAgICAgbGV0IHUgPSBNYXRoLmZsb29yKHgpO1xyXG4gICAgICAgIGxldCB2ID0gTWF0aC5mbG9vcih5KTtcclxuXHJcbiAgICAgICAgLy8gYWJzb2x1dGUgdmFsdWUgYW5kIHNpZ24gb2YgZGlyZWN0aW9uXHJcbiAgICAgICAgbGV0IGFkeCA9IE1hdGguYWJzKGR4KTtcclxuICAgICAgICBsZXQgYWR5ID0gTWF0aC5hYnMoZHkpO1xyXG4gICAgICAgIGxldCBhZHlkeCA9IGFkeSAvIGFkeDtcclxuICAgICAgICBsZXQgYWR4ZHkgPSBhZHggLyBhZHk7XHJcbiAgICAgICAgbGV0IGlkeCA9IChkeCA+IDApID8gMSA6IC0xO1xyXG4gICAgICAgIGxldCBpZHkgPSAoZHkgPiAwKSA/IDEgOiAtMTtcclxuXHJcbiAgICAgICAgLy8gRGlzdGFuY2UgdW50aWwgdGhlIG5leHQgcGl4ZWwgaW4gZWFjaCBkaXJlY3Rpb25cclxuICAgICAgICBsZXQgcnggPSAwLjU7XHJcbiAgICAgICAgbGV0IHJ5ID0gMC41O1xyXG5cclxuICAgICAgICAvLyBQcmV2aW91cyBzdGVwIHdhcyBpbiB0aGUgeCBkaXJlY3Rpb24sIHkgZGlyZWN0aW9uLCBvciBuZWl0aGVyXHJcbiAgICAgICAgY29uc3QgbkRpciA9IC0xO1xyXG4gICAgICAgIGNvbnN0IHhEaXIgPSBzaW5nbGUgPyAwIDogbkRpcjtcclxuICAgICAgICBjb25zdCB5RGlyID0gc2luZ2xlID8gMSA6IG5EaXI7XHJcbiAgICAgICAgbGV0IGRpciA9IG5EaXI7XHJcblxyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICBjb25zb2xlLmxvZygnbGluZScpXHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZW5kIG9mIHRoZSBsaW5lIHdhcyByZWFjaGVkXHJcbiAgICAgICAgICAgIGlmICh1ID09IGV4ICYmIHYgPT0gZXkpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAocnggKiBhZHkgPCByeSAqIGFkeClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGRpYWdvbmFsIHN0ZXBcclxuICAgICAgICAgICAgICAgIGlmIChkaXIgPT0geURpcilcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIHRoZSBsYXN0IHBpeGVsXHJcbiAgICAgICAgICAgICAgICAgICAgZGlyID0gbkRpcjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWYodSwgdikpXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZGlyID0geERpcjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBtb3ZlIGluIHhcclxuICAgICAgICAgICAgICAgIHJ5IC09IHJ4ICogYWR5ZHg7XHJcbiAgICAgICAgICAgICAgICByeCA9IDE7XHJcbiAgICAgICAgICAgICAgICB1ICs9IGlkeDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgY29sbGlzaW9uIHdpdGggbGVmdC9yaWdodCBlZGdlXHJcbiAgICAgICAgICAgICAgICBpZiAodSA8IDAgfHwgdSA+PSB0aGlzLndpZHRoKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbGFtcCAmJiBhZHkgIT0gMClcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHUgPSBNYXRoLm1pbihNYXRoLm1heCh1LCAwKSwgdGhpcy53aWR0aCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBleCA9IHU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkeCA9IGFkeGR5ID0gYWR5ZHggPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgZGlhZ29uYWwgc3RlcFxyXG4gICAgICAgICAgICAgICAgaWYgKGRpciA9PSB4RGlyKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFNraXAgdGhlIGxhc3QgcGl4ZWxcclxuICAgICAgICAgICAgICAgICAgICBkaXIgPSBuRGlyO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghZih1LCB2KSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBkaXIgPSB5RGlyO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBtb3ZlIGluIHlcclxuICAgICAgICAgICAgICAgIHJ4IC09IHJ5ICogYWR4ZHk7XHJcbiAgICAgICAgICAgICAgICByeSA9IDE7XHJcbiAgICAgICAgICAgICAgICB2ICs9IGlkeTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGNvbGxpc2lvbiB3aXRoIHRvcC9ib3R0b20gZWRnZVxyXG4gICAgICAgICAgICAgICAgaWYgKHYgPCAwIHx8IHYgPj0gdGhpcy5oZWlnaHQpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsYW1wICYmIGFkeCAhPSAwKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdiA9IE1hdGgubWluKE1hdGgubWF4KHYsIDApLCB0aGlzLmhlaWdodCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBleSA9IHY7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkeSA9IGFkeGR5ID0gYWR5ZHggPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy9cclxuICAgIC8vIERyYXdpbmdcclxuICAgIC8vXHJcbiAgICBcclxuICAgIC8vIERyYXcgYSBjaXJjbGUgb2YgY29sb3IgYyBjZW50ZXJlZCBhdCAoeCwgeSkgd2l0aCByYWRpdXMgclxyXG4gICAgY2lyY2xlKHgsIHksIHIsIGMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jaXJjbGVmKHgsIHksIHIsICh1LCB2KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5zZXQodSwgdiwgYyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERyYXcgYSBib3ggb2YgY29sb3IgYyBjZW50ZXJlZCBhdCB4LCB5IHdpdGggZGltZW5zaW9ucyB3LCBoXHJcbiAgICBib3goeCwgeSwgdywgaCwgYylcclxuICAgIHtcclxuICAgICAgICBsZXQgaGFsZlcgPSBNYXRoLmZsb29yKCh3IC0gMSkgLyAyKTtcclxuICAgICAgICBsZXQgaGFsZkggPSBNYXRoLmZsb29yKChoIC0gMSkgLyAyKTtcclxuICAgICAgICBmb3IgKGxldCB1ID0gTWF0aC5tYXgoLWhhbGZXLCAteCk7IHUgPD0gTWF0aC5taW4oaGFsZlcsIHRoaXMud2lkdGggLSAxIC0geCk7IHUrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHYgPSBNYXRoLm1heCgtaGFsZkgsIC15KTsgdiA8PSBNYXRoLm1pbihoYWxmSCwgdGhpcy5oZWlnaHQgLSAxIC0geSk7IHYrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXQoeCArIHUsIHkgKyB2LCBjKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRHJhdyBhIHJlZ3VsYXIgcG9seWdvbiBvZiBjb2xvciBjIGluc2NyaWJlZCBpbiB0aGUgY2lyY2xlIGNlbnRlcmVkIGF0IHgsIHkgd2l0aCByYWRpdXMgciwgb3JpZW50ZWQgd2l0aCBhbmdsZSBhXHJcbiAgICBwb2x5KHgsIHksIHMsIHIsIGEsIGMpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUG9pbnQgKHUsIHYpIGlzIG9uIHRoZSBwbGFuZSBpZiBhdSArIGJ2ICsgYyA9IDBcclxuICAgICAgICAvLyBQbGFuZXMgYXJlIHRoZSBpbmZpbml0ZSBsaW5lcyB0aGF0IHRoZSBlZGdlcyBvZiB0aGUgcG9seWdvbiBsaWUgb25cclxuICAgICAgICBsZXQgcGxhbmVzID0gbmV3IEFycmF5KHMpO1xyXG4gICAgICAgIGxldCBySW5uZXIgPSByICogTWF0aC5jb3MoTWF0aC5QSSAvIHMpO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgczsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGFuZ2xlID0gaSAqIDIgKiBNYXRoLlBJIC8gcyArIGE7XHJcbiAgICAgICAgICAgIGxldCBjb3MgPSBNYXRoLmNvcyhhbmdsZSk7XHJcbiAgICAgICAgICAgIGxldCBzaW4gPSBNYXRoLnNpbihhbmdsZSk7XHJcbiAgICAgICAgICAgIHBsYW5lc1tpXSA9IHthOiBjb3MsIGI6IHNpbiwgYzogLWNvcyAqIHggLSB5ICogc2luIC0gcklubmVyfTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY2lyY2xlZih4LCB5LCByLCAodSwgdikgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgczsgaSsrKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcGxhbmUgPSBwbGFuZXNbaV07XHJcbiAgICAgICAgICAgICAgICBpZiAocGxhbmUuYSAqIHUgKyBwbGFuZS5iICogdiArIHBsYW5lLmMgPiAwKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnNldCh1LCB2LCBjKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRHJhdyBhIDEtcGl4ZWwgbGluZSBvZiBjb2xvciBjLCBmcm9tIHRoZSBjZW50ZXIgb2YgKHgsIHkpIHRvIHRoZSBjZW50ZXIgb2YgKGV4LCBleSkgb3IgdW50aWwgaXQgcmVhY2hlcyBwIHBpeGVscy5cclxuICAgIGxpbmUoeCwgeSwgZXgsIGV5LCBwLCBjLCBib2FyZClcclxuICAgIHtcclxuICAgICAgICBjb25zdCBjbGFtcCA9IGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IHNpbmdsZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5saW5lZih4LCB5LCBleCwgZXksIGNsYW1wLCBzaW5nbGUsICh1LCB2KSA9PiBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0KHUsIHYsIGMpO1xyXG4gICAgICAgICAgICBpZiAoLS1wID09IDApXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRHJhdyBhIGNpcmN1bGFyIGJydXNoIG9mIHJhZGl1cyByIGFuZCBjb2xvciBjIGFsb25nIHRoZSBsaW5lIGZyb20gKHgsIHkpIHRvIChleCwgZXkpLCB1bnRpbCB0aGUgZW5kIGlzIHJlYWNoZWQgb3IgdGhlIG51bWJlciBvZiBuZXdseSBzZXQgcGl4ZWxzIHJlYWNoZXMgcC5cclxuICAgIHBhaW50KHgsIHksIGV4LCBleSwgciwgcCwgYywgYm9hcmQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc3QgY2xhbXAgPSB0cnVlO1xyXG4gICAgICAgIGNvbnN0IHNpbmdsZSA9IGZhbHNlXHJcbiAgICAgICAgdGhpcy5saW5lZih4LCB5LCBleCwgZXksIGNsYW1wLCBzaW5nbGUsICh1LCB2KSA9PiBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY2lyY2xlZih1LCB2LCByLCAodSwgdikgPT5cclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2V0KHUsIHYpICE9IGMpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXQodSwgdiwgYyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcC0tO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaWYgKHAgPD0gMClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gcDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRHJhdyBhIGNyb3NzaGFpcmNlbnRlcmVkIGF0ICh4LCB5KSB3aXRoIHJhZGl1cyByIGFuZCBjb2xvciBjXHJcbiAgICBjcm9zc2hhaXIoeCwgeSwgciwgYylcclxuICAgIHtcclxuICAgICAgICBmb3IgKGxldCB1ID0gTWF0aC5tYXgoLXIsIC14KTsgdSA8PSBNYXRoLm1pbihyLCB0aGlzLndpZHRoIC0gMSAtIHgpOyB1KyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnNldCh4ICsgdSwgeSwgYyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAobGV0IHYgPSBNYXRoLm1heCgtciwgLXkpOyB2IDw9IE1hdGgubWluKHIsIHRoaXMuaGVpZ2h0IC0gMSAtIHkpOyB2KyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnNldCh4LCB5ICsgdiwgYyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENvcGllcyB0aGUgY29udGludW91cyByZWdpb24gb2YgcGl4ZWxzIHdpdGggY29sb3IgYyBjb250YWluaW5nICh4LCB5KSBmcm9tIHNyYywgc2V0dGluZyBhbGwgb3RoZXIgcGl4ZWxzIHRvIG9mZi5cclxuICAgIC8vIEEgcGl4ZWwgaXMgcmVhY2hhYmxlIGZyb20gbmVpZ2hib3JzIGluIHRoZSBmb3VyIGNhcmRpbmFsIGRpcmVjdGlvbnMuICBJZiB0aGlzLmdldCh4LCB5KSAhPSBjLCB0aGVuIHRoZSByZWdpb24gaXMgZW1wdHkuXHJcbiAgICBpc29sYXRlKHgsIHksIGMsIG9mZiwgc3JjKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2xlYXIob2ZmKTtcclxuICAgICAgICBpZiAoc3JjLmdldCh4LCB5KSAhPSBjKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGEgPSBbe3g6eCwgeTp5fV07XHJcbiAgICAgICAgbGV0IHNlbGYgPSB0aGlzO1xyXG4gICAgICAgIGZ1bmN0aW9uIHZpc2l0KHUsIHYpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoc3JjLmdldCh1LCB2KSA9PSBjICYmIHNlbGYuZ2V0KHUsIHYpID09IG9mZilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgYS5wdXNoKHt4OnUsIHk6dn0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB3aGlsZSAoYS5sZW5ndGgpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcG9pbnQgPSBhLnBvcCgpO1xyXG4gICAgICAgICAgICBsZXQgdSA9IHBvaW50Lng7XHJcbiAgICAgICAgICAgIGxldCB2ID0gcG9pbnQueTtcclxuICAgICAgICAgICAgdGhpcy5zZXQodSwgdiwgYyk7XHJcblxyXG4gICAgICAgICAgICB2aXNpdCh1IC0gMSwgdik7XHJcbiAgICAgICAgICAgIHZpc2l0KHUgKyAxLCB2KTtcclxuICAgICAgICAgICAgdmlzaXQodSwgdiAtIDEpO1xyXG4gICAgICAgICAgICB2aXNpdCh1LCB2ICsgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNldHMgZXZlcnkgcGl4ZWwgdG8gY29sb3IgYyB0aGF0IGlzIHdpdGhpbiByIHBpeGVscyBvZiB0aGUgY29udGludW91cyByZWdpb24gb2YgY29sb3IgYyBjb250YWluaW5nICh4LCB5KS5cclxuICAgIC8vIFRoZSBjb250aW51b3VzIHJlZ2lvbiBpcyBkZXRlcm1pbmVkIGJ5IGlzb2xhdGUoKS4gIFRoZSBkaXN0YW5jZXMgb2YgcGl4ZWxzIGZyb20gdGhhdCByZWdpb24gYXJlIGRldGVybWluZWQgYnlcclxuICAgIC8vIG1vdmVtZW50IGluIHRoZSA4IGNhcmRpbmFsICsgb3JkaW5hbCBkaXJlY3Rpb25zLCBhIHJvdWdoIGFwcHJveGltYXRpb24gb2YgZXVjbGlkZWFuIGRpc3RhbmNlLlxyXG4gICAgZmxvb2QoeCwgeSwgciwgYylcclxuICAgIHtcclxuICAgICAgICBpZiAodGhpcy5nZXQoeCwgeSkgIT0gYylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIGJvYXJkIHdpdGggdGhlIGlzb2xhdGVkIHJlZ2lvblxyXG4gICAgICAgIGxldCBvZmYgPSBjICsgMTsgLy8ganVzdCBuZWVkIGFueSB2YWx1ZSBvdGhlciB0aGFuIGNcclxuICAgICAgICBsZXQgaXNvQm9hcmQgPSBuZXcgQm9hcmQodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGlzb0JvYXJkLmlzb2xhdGUoeCwgeSwgYywgb2ZmLCB0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgYm9hcmQgdG8gZHJhdyB0aGUgZmxvb2QgZmlsbCB0bywgaW5pdGlhbGx5IGJsYW5rXHJcbiAgICAgICAgbGV0IGZsb29kQm9hcmQgPSBuZXcgQm9hcmQodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGZsb29kQm9hcmQuY2xlYXIob2ZmKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBRdWV1ZSBmb3IgZGlqa3N0cmEncyBhbGdvcml0aG0gXHJcbiAgICAgICAgbGV0IHF1ZXVlID0gbmV3IFByaW9yaXR5UXVldWUoeyBjb21wYXJhdG9yOiBmdW5jdGlvbihhLCBiKSB7IHJldHVybiBhLmNvc3QgLSBiLmNvc3Q7IH19KTsgLy8gbG93ZXIgY29zdCAtPiBoaWdoZXIgcHJpb3JpdHlcclxuICAgICAgICBxdWV1ZS5xdWV1ZSh7eDp4LCB5OnksIGNvc3Q6MH0pO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiB2aXNpdCh1LCB2LCBjb3N0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKGZsb29kQm9hcmQuZ2V0KHUsIHYpID09IG9mZilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzb0JvYXJkLmdldCh1LCB2KSA9PSBjKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvc3QgPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKGNvc3QgPD0gcilcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBxdWV1ZS5xdWV1ZSh7eDp1LCB5OnYsIGNvc3Q6Y29zdH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgc3FydDIgPSBNYXRoLnNxcnQoMik7XHJcbiAgICAgICAgd2hpbGUgKHF1ZXVlLmxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBpdGVtID0gcXVldWUuZGVxdWV1ZSgpO1xyXG4gICAgICAgICAgICBsZXQgdSA9IGl0ZW0ueDtcclxuICAgICAgICAgICAgbGV0IHYgPSBpdGVtLnk7XHJcbiAgICAgICAgICAgIGxldCBjb3N0ID0gaXRlbS5jb3N0O1xyXG5cclxuICAgICAgICAgICAgaWYgKGZsb29kQm9hcmQuZ2V0KHUsIHYpID09IGMpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBmbG9vZEJvYXJkLnNldCh1LCB2LCBjKTtcclxuICAgICAgICAgICAgdmlzaXQodSArIDEsIHYgKyAwLCBjb3N0ICsgMSk7XHJcbiAgICAgICAgICAgIHZpc2l0KHUgKyAxLCB2ICsgMSwgY29zdCArIHNxcnQyKTtcclxuICAgICAgICAgICAgdmlzaXQodSArIDAsIHYgKyAxLCBjb3N0ICsgMSk7XHJcbiAgICAgICAgICAgIHZpc2l0KHUgLSAxLCB2ICsgMSwgY29zdCArIHNxcnQyKTtcclxuICAgICAgICAgICAgdmlzaXQodSAtIDEsIHYgKyAwLCBjb3N0ICsgMSk7XHJcbiAgICAgICAgICAgIHZpc2l0KHUgLSAxLCB2IC0gMSwgY29zdCArIHNxcnQyKTtcclxuICAgICAgICAgICAgdmlzaXQodSArIDAsIHYgLSAxLCBjb3N0ICsgMSk7XHJcbiAgICAgICAgICAgIHZpc2l0KHUgKyAxLCB2IC0gMSwgY29zdCArIHNxcnQyKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENvcHkgdGhlIGZsb29kZWQgcGl4ZWxzIHRvIHRoaXNcclxuICAgICAgICB0aGlzLmFkZChmbG9vZEJvYXJkLCBjKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZXRzIHBpeGVscyBvbiB0aGUgYm9yZGVycyBvZiByZWdpb25zIG9mIG1hc2stY29sb3JlZCBwaXhlbHMgb24gYm9hcmQgdG8gb24sIGFuZCBhbGwgb3RoZXIgcGl4ZWxzIHRvIG9mZlxyXG4gICAgb3V0bGluZShtYXNrLCBvbiwgb2ZmLCBzcmMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5tYXRjaERpbWVuc2lvbnMoc3JjKTtcclxuICAgICAgICBmb3IgKGxldCB1ID0gMDsgdSA8IHRoaXMud2lkdGg7IHUrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHYgPSAwOyB2IDwgdGhpcy5oZWlnaHQ7IHYrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGMgPSAoc3JjLmdldCh1LCB2KSA9PSBtYXNrICYmIChcclxuICAgICAgICAgICAgICAgICAgICBzcmMuZ2V0KHUgLSAxLCB2KSAhPSBtYXNrIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgIHNyYy5nZXQodSArIDEsIHYpICE9IG1hc2sgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgc3JjLmdldCh1LCB2IC0gMSkgIT0gbWFzayB8fCBcclxuICAgICAgICAgICAgICAgICAgICBzcmMuZ2V0KHUsIHYgKyAxKSAhPSBtYXNrKSlcclxuICAgICAgICAgICAgICAgICAgICA/IG9uIDogb2ZmO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXQodSwgdiwgYyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFB1c2ggcGl4ZWxzIG91dHdhcmRzIGZyb20gYSBjZW50cmFsIHBvaW50XHJcbiAgICBkeW5hbWl0ZSh4LCB5LCByLCBlKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBhcmVhID0gTWF0aC5QSSAqIHIgKiByO1xyXG5cclxuICAgICAgICBsZXQgcm91bmRzID0gMTA7XHJcbiAgICAgICAgbGV0IHN0ZXBzUGVyUm91bmQgPSBNYXRoLmZsb29yKE1hdGguUEkgKiByKTtcclxuICAgICAgICBsZXQgc3RlcHMgPSByb3VuZHMgKiBzdGVwc1BlclJvdW5kO1xyXG4gICAgICAgIGxldCBhbmdsZVBlclN0ZXAgPSAyICogcm91bmRzICogTWF0aC5QSSAvIChzdGVwcyAtIDEpO1xyXG5cclxuICAgICAgICBsZXQgaSA9IDA7XHJcbiAgICAgICAgbGV0IGJvYXJkID0gdGhpcztcclxuICAgICAgICBmdW5jdGlvbiBzdGVwKClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChpID49IHN0ZXBzKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbGV0IG4gPSBpICsgc3RlcHNQZXJSb3VuZDtcclxuICAgICAgICAgICAgZm9yICg7IGkgPCBuOyBpKyspXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBhbmdsZSA9IGkgKiBhbmdsZVBlclN0ZXA7XHJcbiAgICAgICAgICAgICAgICBsZXQgeERpciA9IE1hdGguY29zKGFuZ2xlKTtcclxuICAgICAgICAgICAgICAgIGxldCB5RGlyID0gTWF0aC5zaW4oYW5nbGUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xhbXAgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2luZ2xlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGxldCBySW50ID0gTWF0aC5mbG9vcihyIC8gcm91bmRzKTtcclxuICAgICAgICAgICAgICAgIGxldCBxdWV1ZSA9IG5ldyBBcnJheShNYXRoLmZsb29yKHJJbnQpKS5maWxsKGUpO1xyXG4gICAgICAgICAgICAgICAgbGV0IHByZXNzdXJlID0gMC41O1xyXG4gICAgICAgICAgICAgICAgbGV0IGV4ID0gTWF0aC5mbG9vcih4ICsgeERpciAqIHIgKiAxMDApO1xyXG4gICAgICAgICAgICAgICAgbGV0IGV5ID0gTWF0aC5mbG9vcih5ICsgeURpciAqIHIgKiAxMDApO1xyXG4gICAgICAgICAgICAgICAgbGV0IHJTcSA9IHIgKiByO1xyXG4gICAgICAgICAgICAgICAgYm9hcmQubGluZWYoeCwgeSwgZXgsIGV5LCBjbGFtcCwgc2luZ2xlLCAodSwgdikgPT5cclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgeERpZmYgPSB1IC0geDtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgeURpZmYgPSB2IC0geTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZGlzdFNxID0geERpZmYgKiB4RGlmZiArIHlEaWZmICogeURpZmY7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGxldCBjID0gYm9hcmQuZ2V0KHUsIHYpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJvYXJkLnNldCh1LCB2LCBxdWV1ZS5zaGlmdCgpKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGlzdFNxID4gclNxKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGMgPT0gZSlcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJlc3N1cmUgKz0gMC4zMztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXNzdXJlICs9IDAuOTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlc3N1cmUgPiAxKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVzc3VyZSAtPSAxO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcXVldWUucHVzaChjKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKHF1ZXVlLmxlbmd0aCA+IDApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKGMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHN0ZXA7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUGFydGljbGUgc2ltIGR5bmFtaXRlIG1ldGhvZCAtLSB0b28gc2xvd1xyXG4gICAgZHluYW1pdGUyKHgsIHksIHIsIGUpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gSGVscGVyIGZvciBhcHBseWluZyBwYXJ0aWNsZSByZXB1bHNpb24gZm9yY2VzIGluIGEgcGFpciBvZiBjZWxscy4gIGNlbGwwIG1heSBlcXVhbCBjZWxsMS5cclxuICAgICAgICBmdW5jdGlvbiBmb3JjZShjZWxsMCwgY2VsbDEsIGgpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjb25zdCByZXB1bHNpb25EaXN0YW5jZSA9IChjZWxsMCA9PSBjZWxsMSkgPyBNYXRoLnNxcnQoMikgOiAxO1xyXG4gICAgICAgICAgICBjb25zdCByZXB1bHNpb25Gb3JjZSA9IDEwMDtcclxuXHJcbiAgICAgICAgICAgIC8vIEZvciBlYWNoIHBhaXIgb2YgcGFydGljbGVzXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbDAubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBwID0gY2VsbDBbaV07XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGNlbGwxLmxlbmd0aDsgaisrKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBxID0gY2VsbDFbal07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgPT0gcSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAvLyBubyBzZWxmLWZvcmNlXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgcGFydGljbGVzIGFuZCBjaGVjayBpZiB0aGV5J3JlIGNsb3NlIGVub3VnaCB0byBhcHBseSBhIHJlcHVsc2lvbiBmb3JjZVxyXG4gICAgICAgICAgICAgICAgICAgIGxldCBkeCA9IHAueCAtIHEueDtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZHkgPSBwLnkgLSBxLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGRTcSA9IGR4ICogZHggKyBkeSAqIGR5O1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkU3EgPCByZXB1bHNpb25EaXN0YW5jZSAqIHJlcHVsc2lvbkRpc3RhbmNlKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGQgPSBNYXRoLnNxcnQoZFNxKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIHVuaXQgZGlyZWN0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNwZWNpYWwgY2FzZSB0byAoMSwgMCkgaWYgdGhlIHBhcnRpY2xlIGlzIGV4YWN0bHkgb24gdGhlIGNlbnRlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZCA9PSAwKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCA9IDE7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeSA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgaW52RCA9IDEgLyBkO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHggKj0gaW52RDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5ICo9IGludkQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGV4cGxvc2l2ZSBmb3JjZSB0byB0aGUgcGFydGljbGVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBkdiA9IE1hdGguc3FydChyZXB1bHNpb25EaXN0YW5jZSAtIGQpICogcmVwdWxzaW9uRm9yY2UgKiBoICogMC41O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwLnZ4ICs9IGR4ICogZHY7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHAudnkgKz0gZHkgKiBkdjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcS52eCAtPSBkeCAqIGR2O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBxLnZ5IC09IGR5ICogZHY7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENvbnZlcnQgcGl4ZWxzIHRvIHBhcnRpY2xlc1xyXG4gICAgICAgIGxldCBwYXJ0aWNsZXMgPSBuZXcgQXJyYXkodGhpcy5kYXRhLmxlbmd0aCk7XHJcbiAgICAgICAgbGV0IHBhcnRpY2xlczIgPSBuZXcgQXJyYXkodGhpcy5kYXRhLmxlbmd0aCk7IC8vIGJhY2tidWZmZXJcclxuICAgICAgICBsZXQgbWF4VmFsdWUgPSBlO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kYXRhLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGMgPSB0aGlzLmRhdGFbaV07XHJcbiAgICAgICAgICAgIGlmIChjID09IGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBhcnRpY2xlc1tpXSA9IFtdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbWF4VmFsdWUgPSBNYXRoLm1heChtYXhWYWx1ZSwgYyk7XHJcbiAgICAgICAgICAgICAgICBwYXJ0aWNsZXNbaV0gPSBbe3g6IGkgJSB0aGlzLndpZHRoICsgMC41LCB5OiBNYXRoLmZsb29yKGkgLyB0aGlzLndpZHRoKSArIDAuNSwgdng6IDAsIHZ5OiAwLCBjOiBjIH1dO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHBhcnRpY2xlczJbaV0gPSBbXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNpbXVsYXRlXHJcbiAgICAgICAgY29uc3QgaCA9IDEgLyAxMDA7XHJcbiAgICAgICAgY29uc3Qgc3RlcHMgPSAxMDA7XHJcbiAgICAgICAgY29uc3QgZXhwbG9zaW9uU3RlcHMgPSAxMDtcclxuICAgICAgICBjb25zdCBleHBsb3Npb25Gb3JjZSA9IDEwMDtcclxuICAgICAgICBmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IHN0ZXBzOyBzdGVwKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBBcHBseSBleHBsb3NpdmUgZm9yY2UgdG8gYWxsIHBhcnRpY2xlc1xyXG4gICAgICAgICAgICBpZiAoc3RlcCA8IGV4cGxvc2lvblN0ZXBzKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBFeHBsb3Npb24gZm9yY2Ugc3RhcnRzIGhpZ2ggYW5kIHNjYWxlcyBkb3duXHJcbiAgICAgICAgICAgICAgICBsZXQgZiA9IGV4cGxvc2lvbkZvcmNlICogKDEgLSBzdGVwIC8gZXhwbG9zaW9uU3RlcHMpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBlYWNoIGNlbGwgd2l0aGluIHRoZSBleHBsb3Npb24gcmFkaXVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNpcmNsZWYoeCwgeSwgciwgKHUsIHYpID0+XHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGVhY2ggcGFydGljbGUgaW4gdGhlIGNlbGxcclxuICAgICAgICAgICAgICAgICAgICBsZXQgaSA9IHRoaXMuZ2V0SW5kZXgodSwgdik7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBwYXJ0aWNsZXNbaV0ubGVuZ3RoOyBqKyspXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIHBhcnRpY2xlJ3MgZGlzdGFuY2UgZnJvbSB0aGUgZXhwbG9zaW9uIGNlbnRlciBhbmQgY2hlY2sgaWYgaXQncyB3aXRoaW4gdGhlIHJhZGl1c1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcCA9IHBhcnRpY2xlc1tpXVtqXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGR4ID0gcC54IC0geDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGR5ID0gcC55IC0geTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGQgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZCA8IHIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgdW5pdCBkaXJlY3Rpb24gZnJvbSB0aGUgZXhwbG9zaW9uIGNlbnRlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3BlY2lhbCBjYXNlIHRvICgxLCAwKSBpZiB0aGUgcGFydGljbGUgaXMgZXhhY3RseSBvbiB0aGUgY2VudGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZCA9PSAwKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR4ID0gMTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeSA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGludkQgPSAxIC8gZDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCAqPSBpbnZEO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5ICo9IGludkQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQXBwbHkgZXhwbG9zaXZlIGZvcmNlIHRvIHRoZSBwYXJ0aWNsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGR2ID0gTWF0aC5zcXJ0KHIgLSBkKSAqIGYgKiBoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcC52eCArPSBkeCAqIGR2O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcC52eSArPSBkeSAqIGR2O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGZvcmNlcyBiZXR3ZWVuIHBhcnRpY2xlcyBhbmQgaW50ZWdyYXRlIHRoZW0gaW50byB0aGUgYmFja2J1ZmZlclxyXG4gICAgICAgICAgICBmb3IgKGxldCB1ID0gMDsgdSA8IHRoaXMud2lkdGg7IHUrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgdiA9IDA7IHYgPCB0aGlzLmhlaWdodDsgdisrKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGZvcmNlcyB3aXRoaW4gdGhlIGNlbGxcclxuICAgICAgICAgICAgICAgICAgICBsZXQgaSA9IHRoaXMuZ2V0SW5kZXgodSwgdilcclxuICAgICAgICAgICAgICAgICAgICBmb3JjZShwYXJ0aWNsZXNbaV0sIHBhcnRpY2xlc1tpXSwgaCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGZvcmNlcyB0byBuZWlnaGJvcmluZyBjZWxsc1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBkdSA9ICh1ICE9IHRoaXMud2lkdGggLSAxKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZHYgPSAodiAhPSB0aGlzLmhlaWdodCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkdSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKHBhcnRpY2xlc1tpXSwgcGFydGljbGVzW2kgKyAxXSwgaCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkdilcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2UocGFydGljbGVzW2ldLCBwYXJ0aWNsZXNbaSArIDEgKyB0aGlzLmhlaWdodF0sIGgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkdilcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKHBhcnRpY2xlc1tpXSwgcGFydGljbGVzW2kgKyB0aGlzLmhlaWdodF0sIGgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gSW50ZWdyYXRlXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBwYXJ0aWNsZXNbaV0ubGVuZ3RoOyBqKyspXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcCA9IHBhcnRpY2xlc1tpXVtqXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwLnggKz0gcC52eCAqIGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHAueSArPSBwLnZ5ICogaDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHB1ID0gTWF0aC5mbG9vcihwLngpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcHYgPSBNYXRoLmZsb29yKHAueSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwdSA+PSAwICYmIHB1IDwgdGhpcy53aWR0aCAmJiBwdiA+PSAwICYmIHB2IDwgdGhpcy5oZWlnaHQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcnRpY2xlczJbdGhpcy5nZXRJbmRleChwdSwgcHYpXS5wdXNoKHApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IC8vIGVsc2UgcGFydGljbGUgaXMgb2ZmIHRoZSBib2FyZCBhbmQgd2lsbCBiZSByZW1vdmVkXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBTd2FwIGJ1ZmZlcnMgYW5kIGNsZWFyIHRoZSBiYWNrYnVmZmVyXHJcbiAgICAgICAgICAgIGxldCB0ZW1wID0gcGFydGljbGVzO1xyXG4gICAgICAgICAgICBwYXJ0aWNsZXMgPSBwYXJ0aWNsZXMyO1xyXG4gICAgICAgICAgICBwYXJ0aWNsZXMyID0gdGVtcDtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0aWNsZXMyLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwYXJ0aWNsZXMyW2ldLmxlbmd0aCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlbmRlciBwYXJ0aWNsZXMgYmFjayB0byB0aGUgYm9hcmRcclxuICAgICAgICBsZXQgbG9zdCA9IDA7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0aWNsZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgYyA9IGU7XHJcbiAgICAgICAgICAgIGlmIChwYXJ0aWNsZXNbaV0ubGVuZ3RoID09IDEpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIC8vIFNpbmdsZSBwYXJ0aWNsZSBpbiB0aGUgY2VsbCwgdGFrZSBpdHMgY29sb3JcclxuICAgICAgICAgICAgICAgIGMgPSBwYXJ0aWNsZXNbaV1bMF0uYztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChwYXJ0aWNsZXNbaV0ubGVuZ3RoID4gMSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbG9zdCArPSBwYXJ0aWNsZXNbaV0ubGVuZ3RoIC0gMTtcclxuICAgICAgICAgICAgICAgIC8vIEZpbmQgd2hhdCBjb2xvciBoYXMgdGhlIG1vc3QgcGFydGljbGVzIGluIHRoaXMgY2VsbFxyXG4gICAgICAgICAgICAgICAgLy8gKEluIHRoZSBmdXR1cmUgbWF5YmUgY29uc2lkZXIgc29tZSBiaWFzaW5nIGluIGNhc2Ugb2YgdGllcyBmb3IgZmFpcm5lc3MsIG1pZ2h0IG5vdCBiZSBuZWVkZWQgdGhvdWdoKS5cclxuICAgICAgICAgICAgICAgIGxldCBjb3VudCA9IG5ldyBBcnJheShtYXhWYWx1ZSArIDEpLmZpbGwoMCk7XHJcbiAgICAgICAgICAgICAgICBsZXQgbWF4Q291bnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBwYXJ0aWNsZXNbaV0ubGVuZ3RoOyBqKyspXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IHBjID0gcGFydGljbGVzW2ldW2pdLmM7XHJcbiAgICAgICAgICAgICAgICAgICAgY291bnRbcGNdKys7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvdW50W3BjXSA+IG1heENvdW50KVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4Q291bnQgPSBjb3VudFtwY107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGMgPSBwYztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gLy8gZWxzZSBjID0gZSBiZWNhdXNlIHRoZSBjZWxsIGlzIGVtcHR5XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRhdGFbaV0gPSBjO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zb2xlLmxvZyhcImxvc3QgXCIgKyBsb3N0KTtcclxuICAgIH1cclxuXHJcbiAgICAvL1xyXG4gICAgLy8gQ29tcG9zaXRpb25cclxuICAgIC8vXHJcbiAgICBcclxuICAgIC8vIFNldHMgZXZlcnkgcGl4ZWwgdG8gYy5cclxuICAgIGNsZWFyKGMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5hbGxmKChpKSA9PiB7IHRoaXMuZGF0YVtpXSA9IGM7IH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENvcGllcyBzcmMgaW50byB0aGlzLiAgU3JjIG11c3QgaGF2ZSB0aGUgc2FtZSBkaW1lbnNpb25zIGFzIHRoaXMuXHJcbiAgICBjb3B5KHNyYylcclxuICAgIHtcclxuICAgICAgICB0aGlzLm1hdGNoRGltZW5zaW9ucyhzcmMpO1xyXG4gICAgICAgIHRoaXMuYWxsZigoaSkgPT4geyB0aGlzLmRhdGFbaV0gPSBzcmMuZGF0YVtpXTsgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yIGV2ZXJ5IHBpeGVsIG9mIHNyYyBzZXQgdG8gYywgc2V0cyB0aGUgc2FtZSBwaXhlbCBpbiB0aGlzIGJvYXJkIHRvIGMuICBTcmMgbXVzdCBoYXZlIHRoZSBzYW1lIGRpbWVuc2lvbnMgYXMgdGhpcy5cclxuICAgIGFkZChzcmMsIGMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5tYXRjaERpbWVuc2lvbnMoc3JjKTtcclxuICAgICAgICB0aGlzLmFsbGYoKGkpID0+XHJcbiAgICAgICAgeyBcclxuICAgICAgICAgICAgaWYgKHNyYy5kYXRhW2ldID09IGMpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YVtpXSA9IGM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvL1xyXG4gICAgLy8gSGVscGVyc1xyXG4gICAgLy9cclxuXHJcbiAgICBtYXRjaERpbWVuc2lvbnMoYm9hcmQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMud2lkdGggIT0gYm9hcmQud2lkdGggJiYgdGhpcy5oZWlnaHQgIT0gYm9hcmQuaGVpZ2h0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhyb3cgJ1RoZSBpbnB1dCBib2FyZCBoYXMgZGlmZmVyZW50IGRpbWVuc2lvbnMgdGhhbiB0aGlzIG9uZSc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vXHJcbiAgICAvLyBPdXRwdXRcclxuICAgIC8vXHJcblxyXG4gICAgLy8gUmV0dXJucyBhbiBhcnJheSB3aGVyZSB0aGUgaXRoIGVsZW1lbnQgaGFzIHRoZSBudW1iZXIgb2YgcGl4ZWxzIHdpdGggdmFsdWUgPSBpXHJcbiAgICBjb3VudChudW1WYWx1ZXMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGEgPSBBcnJheShudW1WYWx1ZXMpLmZpbGwoMCk7XHJcbiAgICAgICAgdGhpcy5hbGxmKChpKSA9PlxyXG4gICAgICAgIHsgXHJcbiAgICAgICAgICAgIGxldCB2YWx1ZUNvdW50ID0gYVt0aGlzLmRhdGFbaV1dO1xyXG4gICAgICAgICAgICBpZiAodmFsdWVDb3VudCA9PSBudWxsKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZUNvdW50ID0gMTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHZhbHVlQ291bnQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhW3RoaXMuZGF0YVtpXV0gPSB2YWx1ZUNvdW50O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBhO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJldHVybnMgdGhlIGJ1ZmZlciBzaXplIHJlcXVpcmVkIHRvIHJlbmRlciB0aGlzLiAgKFNlZSBjb21tZW50cyBvbiByZW5kZXIoKSBmb3IgYnVmZmVyIGZvcm1hdCkuXHJcbiAgICBidWZmZXJTaXplKHNjYWxlKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNjYWxlIGVhY2ggZGltZW5zaW9uLCB0aGVuIG11bHRpcGx5IGJ5IDQgYnl0ZXMgcGVyIHBpeGVsLlxyXG4gICAgICAgIHJldHVybiAodGhpcy53aWR0aCAqIHNjYWxlKSAqICh0aGlzLmhlaWdodCAqIHNjYWxlKSAqIDQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFJlbmRlciB0aGlzIHRvIGEgYnVmZmVyIHRoYXQgY2FuIGJlIHVwbG9hZGVkIHRvIGEgdGV4dHVyZS4gIElmIG5vIGJ1ZmZlciBpcyBwYXNzZWQgaW4sIGEgbmV3IG9uZSBvZiB0aGUgY29ycmVjdCBzaXplIGlzIGNyZWF0ZWQuXHJcbiAgICAvLyBSZXR1cm5zIHRoZSBidWZmZXIuXHJcbiAgICAvLyBzY2FsZTogcG9zaXRpdmUgaW50ZWdlciBwaXhlbCBtdWx0aXBsaWVyXHJcbiAgICAvLyBwYWxldHRlOiBtYXAgdmFsdWVzIGluIHRoaXMgdG8gW3IsIGcsIGIsIGFdLlxyXG4gICAgLy8gYnVmZmVyOiBVSW50OEFycmF5LiAgcigwLCAwKSwgZygwLCAwKSwgYigwLCAwKSwgYSgwLCAwKSwgcigxLCAwKSwgLi4uLCBhKHdpZHRoIC0gMSwgMCksIHIoMCwgMSksIC4uLlxyXG4gICAgcmVuZGVyKHNjYWxlLCBwYWxldHRlLCBidWZmZXIgPSBudWxsKVxyXG4gICAge1xyXG4gICAgICAgIGlmIChidWZmZXIgPT0gbnVsbClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGJ1ZmZlciA9IG5ldyBVaW50OENsYW1wZWRBcnJheSh0aGlzLmJ1ZmZlclNpemUoc2NhbGUpKVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChidWZmZXIubGVuZ3RoICE9IHRoaXMuYnVmZmVyU2l6ZShzY2FsZSkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aHJvdyAnSW5jb3JyZWN0IGJ1ZmZlciBzaXplJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHBpeGVsID0gNDtcclxuICAgICAgICBsZXQgcGl0Y2ggPSB0aGlzLndpZHRoICogcGl4ZWwgKiBzY2FsZTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMud2lkdGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgdGhpcy5oZWlnaHQ7IGorKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGNvbG9yID0gcGFsZXR0ZVt0aGlzLmdldChpLCBqKV07XHJcbiAgICAgICAgICAgICAgICBsZXQgayA9IGogKiBwaXRjaCAqIHNjYWxlICsgaSAqIHBpeGVsICogc2NhbGU7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCB1ID0gMDsgdSA8IHNjYWxlOyB1KyspXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgdiA9IDA7IHYgPCBzY2FsZTsgdisrKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGwgPSBrICsgcGl4ZWwgKiB2O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJbbF0gPSBjb2xvclswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyW2wgKyAxXSA9IGNvbG9yWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJbbCArIDJdID0gY29sb3JbMl07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1ZmZlcltsICsgM10gPSBjb2xvclszXTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgayArPSBwaXRjaDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGJ1ZmZlcjtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBCb2FyZDtcclxuIiwiKGZ1bmN0aW9uKGYpe2lmKHR5cGVvZiBleHBvcnRzPT09XCJvYmplY3RcIiYmdHlwZW9mIG1vZHVsZSE9PVwidW5kZWZpbmVkXCIpe21vZHVsZS5leHBvcnRzPWYoKX1lbHNlIGlmKHR5cGVvZiBkZWZpbmU9PT1cImZ1bmN0aW9uXCImJmRlZmluZS5hbWQpe2RlZmluZShbXSxmKX1lbHNle3ZhciBnO2lmKHR5cGVvZiB3aW5kb3chPT1cInVuZGVmaW5lZFwiKXtnPXdpbmRvd31lbHNlIGlmKHR5cGVvZiBnbG9iYWwhPT1cInVuZGVmaW5lZFwiKXtnPWdsb2JhbH1lbHNlIGlmKHR5cGVvZiBzZWxmIT09XCJ1bmRlZmluZWRcIil7Zz1zZWxmfWVsc2V7Zz10aGlzfWcuUHJpb3JpdHlRdWV1ZSA9IGYoKX19KShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbnZhciBBYnN0cmFjdFByaW9yaXR5UXVldWUsIEFycmF5U3RyYXRlZ3ksIEJIZWFwU3RyYXRlZ3ksIEJpbmFyeUhlYXBTdHJhdGVneSwgUHJpb3JpdHlRdWV1ZSxcbiAgZXh0ZW5kID0gZnVuY3Rpb24oY2hpbGQsIHBhcmVudCkgeyBmb3IgKHZhciBrZXkgaW4gcGFyZW50KSB7IGlmIChoYXNQcm9wLmNhbGwocGFyZW50LCBrZXkpKSBjaGlsZFtrZXldID0gcGFyZW50W2tleV07IH0gZnVuY3Rpb24gY3RvcigpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9IGN0b3IucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTsgY2hpbGQucHJvdG90eXBlID0gbmV3IGN0b3IoKTsgY2hpbGQuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTsgcmV0dXJuIGNoaWxkOyB9LFxuICBoYXNQcm9wID0ge30uaGFzT3duUHJvcGVydHk7XG5cbkFic3RyYWN0UHJpb3JpdHlRdWV1ZSA9IF9kZXJlcV8oJy4vUHJpb3JpdHlRdWV1ZS9BYnN0cmFjdFByaW9yaXR5UXVldWUnKTtcblxuQXJyYXlTdHJhdGVneSA9IF9kZXJlcV8oJy4vUHJpb3JpdHlRdWV1ZS9BcnJheVN0cmF0ZWd5Jyk7XG5cbkJpbmFyeUhlYXBTdHJhdGVneSA9IF9kZXJlcV8oJy4vUHJpb3JpdHlRdWV1ZS9CaW5hcnlIZWFwU3RyYXRlZ3knKTtcblxuQkhlYXBTdHJhdGVneSA9IF9kZXJlcV8oJy4vUHJpb3JpdHlRdWV1ZS9CSGVhcFN0cmF0ZWd5Jyk7XG5cblByaW9yaXR5UXVldWUgPSAoZnVuY3Rpb24oc3VwZXJDbGFzcykge1xuICBleHRlbmQoUHJpb3JpdHlRdWV1ZSwgc3VwZXJDbGFzcyk7XG5cbiAgZnVuY3Rpb24gUHJpb3JpdHlRdWV1ZShvcHRpb25zKSB7XG4gICAgb3B0aW9ucyB8fCAob3B0aW9ucyA9IHt9KTtcbiAgICBvcHRpb25zLnN0cmF0ZWd5IHx8IChvcHRpb25zLnN0cmF0ZWd5ID0gQmluYXJ5SGVhcFN0cmF0ZWd5KTtcbiAgICBvcHRpb25zLmNvbXBhcmF0b3IgfHwgKG9wdGlvbnMuY29tcGFyYXRvciA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgIHJldHVybiAoYSB8fCAwKSAtIChiIHx8IDApO1xuICAgIH0pO1xuICAgIFByaW9yaXR5UXVldWUuX19zdXBlcl9fLmNvbnN0cnVjdG9yLmNhbGwodGhpcywgb3B0aW9ucyk7XG4gIH1cblxuICByZXR1cm4gUHJpb3JpdHlRdWV1ZTtcblxufSkoQWJzdHJhY3RQcmlvcml0eVF1ZXVlKTtcblxuUHJpb3JpdHlRdWV1ZS5BcnJheVN0cmF0ZWd5ID0gQXJyYXlTdHJhdGVneTtcblxuUHJpb3JpdHlRdWV1ZS5CaW5hcnlIZWFwU3RyYXRlZ3kgPSBCaW5hcnlIZWFwU3RyYXRlZ3k7XG5cblByaW9yaXR5UXVldWUuQkhlYXBTdHJhdGVneSA9IEJIZWFwU3RyYXRlZ3k7XG5cbm1vZHVsZS5leHBvcnRzID0gUHJpb3JpdHlRdWV1ZTtcblxuXG59LHtcIi4vUHJpb3JpdHlRdWV1ZS9BYnN0cmFjdFByaW9yaXR5UXVldWVcIjoyLFwiLi9Qcmlvcml0eVF1ZXVlL0FycmF5U3RyYXRlZ3lcIjozLFwiLi9Qcmlvcml0eVF1ZXVlL0JIZWFwU3RyYXRlZ3lcIjo0LFwiLi9Qcmlvcml0eVF1ZXVlL0JpbmFyeUhlYXBTdHJhdGVneVwiOjV9XSwyOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbnZhciBBYnN0cmFjdFByaW9yaXR5UXVldWU7XG5cbm1vZHVsZS5leHBvcnRzID0gQWJzdHJhY3RQcmlvcml0eVF1ZXVlID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBBYnN0cmFjdFByaW9yaXR5UXVldWUob3B0aW9ucykge1xuICAgIHZhciByZWY7XG4gICAgaWYgKChvcHRpb25zICE9IG51bGwgPyBvcHRpb25zLnN0cmF0ZWd5IDogdm9pZCAwKSA9PSBudWxsKSB7XG4gICAgICB0aHJvdyAnTXVzdCBwYXNzIG9wdGlvbnMuc3RyYXRlZ3ksIGEgc3RyYXRlZ3knO1xuICAgIH1cbiAgICBpZiAoKG9wdGlvbnMgIT0gbnVsbCA/IG9wdGlvbnMuY29tcGFyYXRvciA6IHZvaWQgMCkgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgJ011c3QgcGFzcyBvcHRpb25zLmNvbXBhcmF0b3IsIGEgY29tcGFyYXRvcic7XG4gICAgfVxuICAgIHRoaXMucHJpdiA9IG5ldyBvcHRpb25zLnN0cmF0ZWd5KG9wdGlvbnMpO1xuICAgIHRoaXMubGVuZ3RoID0gKG9wdGlvbnMgIT0gbnVsbCA/IChyZWYgPSBvcHRpb25zLmluaXRpYWxWYWx1ZXMpICE9IG51bGwgPyByZWYubGVuZ3RoIDogdm9pZCAwIDogdm9pZCAwKSB8fCAwO1xuICB9XG5cbiAgQWJzdHJhY3RQcmlvcml0eVF1ZXVlLnByb3RvdHlwZS5xdWV1ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgdGhpcy5sZW5ndGgrKztcbiAgICB0aGlzLnByaXYucXVldWUodmFsdWUpO1xuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQWJzdHJhY3RQcmlvcml0eVF1ZXVlLnByb3RvdHlwZS5kZXF1ZXVlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICBpZiAoIXRoaXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyAnRW1wdHkgcXVldWUnO1xuICAgIH1cbiAgICB0aGlzLmxlbmd0aC0tO1xuICAgIHJldHVybiB0aGlzLnByaXYuZGVxdWV1ZSgpO1xuICB9O1xuXG4gIEFic3RyYWN0UHJpb3JpdHlRdWV1ZS5wcm90b3R5cGUucGVlayA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgaWYgKCF0aGlzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgJ0VtcHR5IHF1ZXVlJztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucHJpdi5wZWVrKCk7XG4gIH07XG5cbiAgQWJzdHJhY3RQcmlvcml0eVF1ZXVlLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICByZXR1cm4gdGhpcy5wcml2LmNsZWFyKCk7XG4gIH07XG5cbiAgcmV0dXJuIEFic3RyYWN0UHJpb3JpdHlRdWV1ZTtcblxufSkoKTtcblxuXG59LHt9XSwzOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbnZhciBBcnJheVN0cmF0ZWd5LCBiaW5hcnlTZWFyY2hGb3JJbmRleFJldmVyc2VkO1xuXG5iaW5hcnlTZWFyY2hGb3JJbmRleFJldmVyc2VkID0gZnVuY3Rpb24oYXJyYXksIHZhbHVlLCBjb21wYXJhdG9yKSB7XG4gIHZhciBoaWdoLCBsb3csIG1pZDtcbiAgbG93ID0gMDtcbiAgaGlnaCA9IGFycmF5Lmxlbmd0aDtcbiAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICBtaWQgPSAobG93ICsgaGlnaCkgPj4+IDE7XG4gICAgaWYgKGNvbXBhcmF0b3IoYXJyYXlbbWlkXSwgdmFsdWUpID49IDApIHtcbiAgICAgIGxvdyA9IG1pZCArIDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhpZ2ggPSBtaWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBsb3c7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFycmF5U3RyYXRlZ3kgPSAoZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIEFycmF5U3RyYXRlZ3kob3B0aW9ucykge1xuICAgIHZhciByZWY7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmNvbXBhcmF0b3IgPSB0aGlzLm9wdGlvbnMuY29tcGFyYXRvcjtcbiAgICB0aGlzLmRhdGEgPSAoKHJlZiA9IHRoaXMub3B0aW9ucy5pbml0aWFsVmFsdWVzKSAhPSBudWxsID8gcmVmLnNsaWNlKDApIDogdm9pZCAwKSB8fCBbXTtcbiAgICB0aGlzLmRhdGEuc29ydCh0aGlzLmNvbXBhcmF0b3IpLnJldmVyc2UoKTtcbiAgfVxuXG4gIEFycmF5U3RyYXRlZ3kucHJvdG90eXBlLnF1ZXVlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB2YXIgcG9zO1xuICAgIHBvcyA9IGJpbmFyeVNlYXJjaEZvckluZGV4UmV2ZXJzZWQodGhpcy5kYXRhLCB2YWx1ZSwgdGhpcy5jb21wYXJhdG9yKTtcbiAgICB0aGlzLmRhdGEuc3BsaWNlKHBvcywgMCwgdmFsdWUpO1xuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQXJyYXlTdHJhdGVneS5wcm90b3R5cGUuZGVxdWV1ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmRhdGEucG9wKCk7XG4gIH07XG5cbiAgQXJyYXlTdHJhdGVneS5wcm90b3R5cGUucGVlayA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmRhdGFbdGhpcy5kYXRhLmxlbmd0aCAtIDFdO1xuICB9O1xuXG4gIEFycmF5U3RyYXRlZ3kucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5kYXRhLmxlbmd0aCA9IDA7XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICByZXR1cm4gQXJyYXlTdHJhdGVneTtcblxufSkoKTtcblxuXG59LHt9XSw0OltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcbnZhciBCSGVhcFN0cmF0ZWd5O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJIZWFwU3RyYXRlZ3kgPSAoZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIEJIZWFwU3RyYXRlZ3kob3B0aW9ucykge1xuICAgIHZhciBhcnIsIGksIGosIGssIGxlbiwgcmVmLCByZWYxLCBzaGlmdCwgdmFsdWU7XG4gICAgdGhpcy5jb21wYXJhdG9yID0gKG9wdGlvbnMgIT0gbnVsbCA/IG9wdGlvbnMuY29tcGFyYXRvciA6IHZvaWQgMCkgfHwgZnVuY3Rpb24oYSwgYikge1xuICAgICAgcmV0dXJuIGEgLSBiO1xuICAgIH07XG4gICAgdGhpcy5wYWdlU2l6ZSA9IChvcHRpb25zICE9IG51bGwgPyBvcHRpb25zLnBhZ2VTaXplIDogdm9pZCAwKSB8fCA1MTI7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHNoaWZ0ID0gMDtcbiAgICB3aGlsZSAoKDEgPDwgc2hpZnQpIDwgdGhpcy5wYWdlU2l6ZSkge1xuICAgICAgc2hpZnQgKz0gMTtcbiAgICB9XG4gICAgaWYgKDEgPDwgc2hpZnQgIT09IHRoaXMucGFnZVNpemUpIHtcbiAgICAgIHRocm93ICdwYWdlU2l6ZSBtdXN0IGJlIGEgcG93ZXIgb2YgdHdvJztcbiAgICB9XG4gICAgdGhpcy5fc2hpZnQgPSBzaGlmdDtcbiAgICB0aGlzLl9lbXB0eU1lbW9yeVBhZ2VUZW1wbGF0ZSA9IGFyciA9IFtdO1xuICAgIGZvciAoaSA9IGogPSAwLCByZWYgPSB0aGlzLnBhZ2VTaXplOyAwIDw9IHJlZiA/IGogPCByZWYgOiBqID4gcmVmOyBpID0gMCA8PSByZWYgPyArK2ogOiAtLWopIHtcbiAgICAgIGFyci5wdXNoKG51bGwpO1xuICAgIH1cbiAgICB0aGlzLl9tZW1vcnkgPSBbXTtcbiAgICB0aGlzLl9tYXNrID0gdGhpcy5wYWdlU2l6ZSAtIDE7XG4gICAgaWYgKG9wdGlvbnMuaW5pdGlhbFZhbHVlcykge1xuICAgICAgcmVmMSA9IG9wdGlvbnMuaW5pdGlhbFZhbHVlcztcbiAgICAgIGZvciAoayA9IDAsIGxlbiA9IHJlZjEubGVuZ3RoOyBrIDwgbGVuOyBrKyspIHtcbiAgICAgICAgdmFsdWUgPSByZWYxW2tdO1xuICAgICAgICB0aGlzLnF1ZXVlKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5xdWV1ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgdGhpcy5sZW5ndGggKz0gMTtcbiAgICB0aGlzLl93cml0ZSh0aGlzLmxlbmd0aCwgdmFsdWUpO1xuICAgIHRoaXMuX2J1YmJsZVVwKHRoaXMubGVuZ3RoLCB2YWx1ZSk7XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5kZXF1ZXVlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJldCwgdmFsO1xuICAgIHJldCA9IHRoaXMuX3JlYWQoMSk7XG4gICAgdmFsID0gdGhpcy5fcmVhZCh0aGlzLmxlbmd0aCk7XG4gICAgdGhpcy5sZW5ndGggLT0gMTtcbiAgICBpZiAodGhpcy5sZW5ndGggPiAwKSB7XG4gICAgICB0aGlzLl93cml0ZSgxLCB2YWwpO1xuICAgICAgdGhpcy5fYnViYmxlRG93bigxLCB2YWwpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9O1xuXG4gIEJIZWFwU3RyYXRlZ3kucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fcmVhZCgxKTtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLl9tZW1vcnkubGVuZ3RoID0gMDtcbiAgICByZXR1cm4gdm9pZCAwO1xuICB9O1xuXG4gIEJIZWFwU3RyYXRlZ3kucHJvdG90eXBlLl93cml0ZSA9IGZ1bmN0aW9uKGluZGV4LCB2YWx1ZSkge1xuICAgIHZhciBwYWdlO1xuICAgIHBhZ2UgPSBpbmRleCA+PiB0aGlzLl9zaGlmdDtcbiAgICB3aGlsZSAocGFnZSA+PSB0aGlzLl9tZW1vcnkubGVuZ3RoKSB7XG4gICAgICB0aGlzLl9tZW1vcnkucHVzaCh0aGlzLl9lbXB0eU1lbW9yeVBhZ2VUZW1wbGF0ZS5zbGljZSgwKSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9tZW1vcnlbcGFnZV1baW5kZXggJiB0aGlzLl9tYXNrXSA9IHZhbHVlO1xuICB9O1xuXG4gIEJIZWFwU3RyYXRlZ3kucHJvdG90eXBlLl9yZWFkID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICByZXR1cm4gdGhpcy5fbWVtb3J5W2luZGV4ID4+IHRoaXMuX3NoaWZ0XVtpbmRleCAmIHRoaXMuX21hc2tdO1xuICB9O1xuXG4gIEJIZWFwU3RyYXRlZ3kucHJvdG90eXBlLl9idWJibGVVcCA9IGZ1bmN0aW9uKGluZGV4LCB2YWx1ZSkge1xuICAgIHZhciBjb21wYXJlLCBpbmRleEluUGFnZSwgcGFyZW50SW5kZXgsIHBhcmVudFZhbHVlO1xuICAgIGNvbXBhcmUgPSB0aGlzLmNvbXBhcmF0b3I7XG4gICAgd2hpbGUgKGluZGV4ID4gMSkge1xuICAgICAgaW5kZXhJblBhZ2UgPSBpbmRleCAmIHRoaXMuX21hc2s7XG4gICAgICBpZiAoaW5kZXggPCB0aGlzLnBhZ2VTaXplIHx8IGluZGV4SW5QYWdlID4gMykge1xuICAgICAgICBwYXJlbnRJbmRleCA9IChpbmRleCAmIH50aGlzLl9tYXNrKSB8IChpbmRleEluUGFnZSA+PiAxKTtcbiAgICAgIH0gZWxzZSBpZiAoaW5kZXhJblBhZ2UgPCAyKSB7XG4gICAgICAgIHBhcmVudEluZGV4ID0gKGluZGV4IC0gdGhpcy5wYWdlU2l6ZSkgPj4gdGhpcy5fc2hpZnQ7XG4gICAgICAgIHBhcmVudEluZGV4ICs9IHBhcmVudEluZGV4ICYgfih0aGlzLl9tYXNrID4+IDEpO1xuICAgICAgICBwYXJlbnRJbmRleCB8PSB0aGlzLnBhZ2VTaXplID4+IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXJlbnRJbmRleCA9IGluZGV4IC0gMjtcbiAgICAgIH1cbiAgICAgIHBhcmVudFZhbHVlID0gdGhpcy5fcmVhZChwYXJlbnRJbmRleCk7XG4gICAgICBpZiAoY29tcGFyZShwYXJlbnRWYWx1ZSwgdmFsdWUpIDwgMCkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIHRoaXMuX3dyaXRlKHBhcmVudEluZGV4LCB2YWx1ZSk7XG4gICAgICB0aGlzLl93cml0ZShpbmRleCwgcGFyZW50VmFsdWUpO1xuICAgICAgaW5kZXggPSBwYXJlbnRJbmRleDtcbiAgICB9XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5fYnViYmxlRG93biA9IGZ1bmN0aW9uKGluZGV4LCB2YWx1ZSkge1xuICAgIHZhciBjaGlsZEluZGV4MSwgY2hpbGRJbmRleDIsIGNoaWxkVmFsdWUxLCBjaGlsZFZhbHVlMiwgY29tcGFyZTtcbiAgICBjb21wYXJlID0gdGhpcy5jb21wYXJhdG9yO1xuICAgIHdoaWxlIChpbmRleCA8IHRoaXMubGVuZ3RoKSB7XG4gICAgICBpZiAoaW5kZXggPiB0aGlzLl9tYXNrICYmICEoaW5kZXggJiAodGhpcy5fbWFzayAtIDEpKSkge1xuICAgICAgICBjaGlsZEluZGV4MSA9IGNoaWxkSW5kZXgyID0gaW5kZXggKyAyO1xuICAgICAgfSBlbHNlIGlmIChpbmRleCAmICh0aGlzLnBhZ2VTaXplID4+IDEpKSB7XG4gICAgICAgIGNoaWxkSW5kZXgxID0gKGluZGV4ICYgfnRoaXMuX21hc2spID4+IDE7XG4gICAgICAgIGNoaWxkSW5kZXgxIHw9IGluZGV4ICYgKHRoaXMuX21hc2sgPj4gMSk7XG4gICAgICAgIGNoaWxkSW5kZXgxID0gKGNoaWxkSW5kZXgxICsgMSkgPDwgdGhpcy5fc2hpZnQ7XG4gICAgICAgIGNoaWxkSW5kZXgyID0gY2hpbGRJbmRleDEgKyAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2hpbGRJbmRleDEgPSBpbmRleCArIChpbmRleCAmIHRoaXMuX21hc2spO1xuICAgICAgICBjaGlsZEluZGV4MiA9IGNoaWxkSW5kZXgxICsgMTtcbiAgICAgIH1cbiAgICAgIGlmIChjaGlsZEluZGV4MSAhPT0gY2hpbGRJbmRleDIgJiYgY2hpbGRJbmRleDIgPD0gdGhpcy5sZW5ndGgpIHtcbiAgICAgICAgY2hpbGRWYWx1ZTEgPSB0aGlzLl9yZWFkKGNoaWxkSW5kZXgxKTtcbiAgICAgICAgY2hpbGRWYWx1ZTIgPSB0aGlzLl9yZWFkKGNoaWxkSW5kZXgyKTtcbiAgICAgICAgaWYgKGNvbXBhcmUoY2hpbGRWYWx1ZTEsIHZhbHVlKSA8IDAgJiYgY29tcGFyZShjaGlsZFZhbHVlMSwgY2hpbGRWYWx1ZTIpIDw9IDApIHtcbiAgICAgICAgICB0aGlzLl93cml0ZShjaGlsZEluZGV4MSwgdmFsdWUpO1xuICAgICAgICAgIHRoaXMuX3dyaXRlKGluZGV4LCBjaGlsZFZhbHVlMSk7XG4gICAgICAgICAgaW5kZXggPSBjaGlsZEluZGV4MTtcbiAgICAgICAgfSBlbHNlIGlmIChjb21wYXJlKGNoaWxkVmFsdWUyLCB2YWx1ZSkgPCAwKSB7XG4gICAgICAgICAgdGhpcy5fd3JpdGUoY2hpbGRJbmRleDIsIHZhbHVlKTtcbiAgICAgICAgICB0aGlzLl93cml0ZShpbmRleCwgY2hpbGRWYWx1ZTIpO1xuICAgICAgICAgIGluZGV4ID0gY2hpbGRJbmRleDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoY2hpbGRJbmRleDEgPD0gdGhpcy5sZW5ndGgpIHtcbiAgICAgICAgY2hpbGRWYWx1ZTEgPSB0aGlzLl9yZWFkKGNoaWxkSW5kZXgxKTtcbiAgICAgICAgaWYgKGNvbXBhcmUoY2hpbGRWYWx1ZTEsIHZhbHVlKSA8IDApIHtcbiAgICAgICAgICB0aGlzLl93cml0ZShjaGlsZEluZGV4MSwgdmFsdWUpO1xuICAgICAgICAgIHRoaXMuX3dyaXRlKGluZGV4LCBjaGlsZFZhbHVlMSk7XG4gICAgICAgICAgaW5kZXggPSBjaGlsZEluZGV4MTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgcmV0dXJuIEJIZWFwU3RyYXRlZ3k7XG5cbn0pKCk7XG5cblxufSx7fV0sNTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG52YXIgQmluYXJ5SGVhcFN0cmF0ZWd5O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJpbmFyeUhlYXBTdHJhdGVneSA9IChmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gQmluYXJ5SGVhcFN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICB2YXIgcmVmO1xuICAgIHRoaXMuY29tcGFyYXRvciA9IChvcHRpb25zICE9IG51bGwgPyBvcHRpb25zLmNvbXBhcmF0b3IgOiB2b2lkIDApIHx8IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgIHJldHVybiBhIC0gYjtcbiAgICB9O1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmRhdGEgPSAoKHJlZiA9IG9wdGlvbnMuaW5pdGlhbFZhbHVlcykgIT0gbnVsbCA/IHJlZi5zbGljZSgwKSA6IHZvaWQgMCkgfHwgW107XG4gICAgdGhpcy5faGVhcGlmeSgpO1xuICB9XG5cbiAgQmluYXJ5SGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5faGVhcGlmeSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpLCBqLCByZWY7XG4gICAgaWYgKHRoaXMuZGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICBmb3IgKGkgPSBqID0gMSwgcmVmID0gdGhpcy5kYXRhLmxlbmd0aDsgMSA8PSByZWYgPyBqIDwgcmVmIDogaiA+IHJlZjsgaSA9IDEgPD0gcmVmID8gKytqIDogLS1qKSB7XG4gICAgICAgIHRoaXMuX2J1YmJsZVVwKGkpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdm9pZCAwO1xuICB9O1xuXG4gIEJpbmFyeUhlYXBTdHJhdGVneS5wcm90b3R5cGUucXVldWUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHRoaXMuZGF0YS5wdXNoKHZhbHVlKTtcbiAgICB0aGlzLl9idWJibGVVcCh0aGlzLmRhdGEubGVuZ3RoIC0gMSk7XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICBCaW5hcnlIZWFwU3RyYXRlZ3kucHJvdG90eXBlLmRlcXVldWUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbGFzdCwgcmV0O1xuICAgIHJldCA9IHRoaXMuZGF0YVswXTtcbiAgICBsYXN0ID0gdGhpcy5kYXRhLnBvcCgpO1xuICAgIGlmICh0aGlzLmRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5kYXRhWzBdID0gbGFzdDtcbiAgICAgIHRoaXMuX2J1YmJsZURvd24oMCk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH07XG5cbiAgQmluYXJ5SGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5wZWVrID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YVswXTtcbiAgfTtcblxuICBCaW5hcnlIZWFwU3RyYXRlZ3kucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuZGF0YS5sZW5ndGggPSAwO1xuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQmluYXJ5SGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5fYnViYmxlVXAgPSBmdW5jdGlvbihwb3MpIHtcbiAgICB2YXIgcGFyZW50LCB4O1xuICAgIHdoaWxlIChwb3MgPiAwKSB7XG4gICAgICBwYXJlbnQgPSAocG9zIC0gMSkgPj4+IDE7XG4gICAgICBpZiAodGhpcy5jb21wYXJhdG9yKHRoaXMuZGF0YVtwb3NdLCB0aGlzLmRhdGFbcGFyZW50XSkgPCAwKSB7XG4gICAgICAgIHggPSB0aGlzLmRhdGFbcGFyZW50XTtcbiAgICAgICAgdGhpcy5kYXRhW3BhcmVudF0gPSB0aGlzLmRhdGFbcG9zXTtcbiAgICAgICAgdGhpcy5kYXRhW3Bvc10gPSB4O1xuICAgICAgICBwb3MgPSBwYXJlbnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICBCaW5hcnlIZWFwU3RyYXRlZ3kucHJvdG90eXBlLl9idWJibGVEb3duID0gZnVuY3Rpb24ocG9zKSB7XG4gICAgdmFyIGxhc3QsIGxlZnQsIG1pbkluZGV4LCByaWdodCwgeDtcbiAgICBsYXN0ID0gdGhpcy5kYXRhLmxlbmd0aCAtIDE7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGxlZnQgPSAocG9zIDw8IDEpICsgMTtcbiAgICAgIHJpZ2h0ID0gbGVmdCArIDE7XG4gICAgICBtaW5JbmRleCA9IHBvcztcbiAgICAgIGlmIChsZWZ0IDw9IGxhc3QgJiYgdGhpcy5jb21wYXJhdG9yKHRoaXMuZGF0YVtsZWZ0XSwgdGhpcy5kYXRhW21pbkluZGV4XSkgPCAwKSB7XG4gICAgICAgIG1pbkluZGV4ID0gbGVmdDtcbiAgICAgIH1cbiAgICAgIGlmIChyaWdodCA8PSBsYXN0ICYmIHRoaXMuY29tcGFyYXRvcih0aGlzLmRhdGFbcmlnaHRdLCB0aGlzLmRhdGFbbWluSW5kZXhdKSA8IDApIHtcbiAgICAgICAgbWluSW5kZXggPSByaWdodDtcbiAgICAgIH1cbiAgICAgIGlmIChtaW5JbmRleCAhPT0gcG9zKSB7XG4gICAgICAgIHggPSB0aGlzLmRhdGFbbWluSW5kZXhdO1xuICAgICAgICB0aGlzLmRhdGFbbWluSW5kZXhdID0gdGhpcy5kYXRhW3Bvc107XG4gICAgICAgIHRoaXMuZGF0YVtwb3NdID0geDtcbiAgICAgICAgcG9zID0gbWluSW5kZXg7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICByZXR1cm4gQmluYXJ5SGVhcFN0cmF0ZWd5O1xuXG59KSgpO1xuXG5cbn0se31dfSx7fSxbMV0pKDEpXG59KTsiLCJjb25zdCBCb2FyZCA9IHJlcXVpcmUoJy4vYm9hcmQuanMnKTtcclxuXHJcbiQoZnVuY3Rpb24oKVxyXG57XHJcbiAgICAvLyBSZW5kZXIgYSBib2FyZCB0byBhIFBJWEkgdGV4dHVyZVxyXG4gICAgZnVuY3Rpb24gcnR0KGJvYXJkLCBzY2FsZSwgcGFsZXR0ZSwgYnVmZmVyID0gbnVsbClcclxuICAgIHtcclxuICAgICAgICBidWZmZXIgPSBib2FyZC5yZW5kZXIoc2NhbGUsIHBhbGV0dGUsIGJ1ZmZlcik7XHJcbiAgICAgICAgbGV0IGltYWdlRGF0YSA9IG5ldyBJbWFnZURhdGEoYnVmZmVyLCBzY2FsZSAqIGJvYXJkLndpZHRoKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XHJcbiAgICAgICAgY2FudmFzLndpZHRoID0gc2NhbGUgKiBib2FyZC53aWR0aDtcclxuICAgICAgICBjYW52YXMuaGVpZ2h0ID0gc2NhbGUgKiBib2FyZC5oZWlnaHQ7XHJcbiAgICAgICAgbGV0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIik7XHJcbiAgICAgICAgY3R4LnB1dEltYWdlRGF0YShpbWFnZURhdGEsIDAsIDApO1xyXG4gICAgICAgIGxldCB0ZXh0dXJlID0gUElYSS5UZXh0dXJlLmZyb20oY2FudmFzKTtcclxuICAgICAgICByZXR1cm4gdGV4dHVyZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbGV0IHBhbGV0dGUgPSBbXHJcbiAgICAgICAgWzB4M2QsIDB4MWQsIDB4ZWYsIDB4ZmZdLFxyXG4gICAgICAgIFsweGZmLCAweGZmLCAweGZmLCAweGZmXVxyXG4gICAgXTtcclxuICAgIGxldCBjID0gMDtcclxuICAgIGxldCBlID0gMTtcclxuXHJcbiAgICBsZXQgYXBwID0gbmV3IFBJWEkuQXBwbGljYXRpb24oe1xyXG4gICAgICAgIHdpZHRoOiA4MDAsIGhlaWdodDogODAwLCBiYWNrZ3JvdW5kQ29sb3I6IDB4ZWVlZWVlLCByZXNvbHV0aW9uOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyB8fCAxLCBhbnRpYWxpYXM6IHRydWVcclxuICAgIH0pO1xyXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhcHAudmlldyk7XHJcblxyXG4gICAgbGV0IGJvYXJkID0gbmV3IEJvYXJkKDI5OSwgMjk5KTtcclxuICAgIGJvYXJkLmNsZWFyKGUpO1xyXG4gICAgLy9ib2FyZC5jaXJjbGUoMTQ5LCAxNDksIDI1LjUsIGMpO1xyXG4gICAgYm9hcmQuYm94KDE0OSwgMTQ5LCA1MCwgMzAsIGMpO1xyXG5cclxuICAgIGxldCBzY2FsZSA9IDI7XHJcbiAgICBsZXQgc3ByaXRlID0gbmV3IFBJWEkuU3ByaXRlO1xyXG4gICAgc3ByaXRlLnggPSAxMDtcclxuICAgIHNwcml0ZS55ID0gMTA7XHJcbiAgICBzcHJpdGUudGV4dHVyZSA9IHJ0dChib2FyZCwgc2NhbGUsIHBhbGV0dGUpO1xyXG4gICAgc3ByaXRlLmludGVyYWN0aXZlID0gdHJ1ZTtcclxuICAgIGFwcC5zdGFnZS5hZGRDaGlsZChzcHJpdGUpO1xyXG5cclxuICAgIGxldCB0ZXh0ID0gbmV3IFBJWEkuVGV4dCgnJywge2ZvbnRGYW1pbHkgOiAnQXJpYWwnLCBmb250U2l6ZTogMjQsIGZpbGwgOiAweDAwMDAwMH0pO1xyXG4gICAgYXBwLnN0YWdlLmFkZENoaWxkKHRleHQpO1xyXG4gICAgdGV4dC55ID0gc3ByaXRlLnkgKyBzcHJpdGUuaGVpZ2h0ICsgMTA7XHJcbiAgICB0ZXh0LnggPSBzcHJpdGUueCArIDEwO1xyXG4gICAgdGV4dC50ZXh0ID0gYm9hcmQuY291bnQoMClbMF07XHJcblxyXG4gICAgbGV0IHN0ZXAgPSBib2FyZC5keW5hbWl0ZSgxNDksIDE0OSwgMzAsIGUpO1xyXG4gICAgc3ByaXRlLm9uKCdtb3VzZWRvd24nLCAoZXZlbnQpID0+XHJcbiAgICB7XHJcbiAgICAgICAgc3RlcCgpO1xyXG4gICAgICAgIHRleHQudGV4dCA9IGJvYXJkLmNvdW50KDApWzBdO1xyXG4gICAgICAgIHNwcml0ZS50ZXh0dXJlID0gcnR0KGJvYXJkLCBzY2FsZSwgcGFsZXR0ZSk7XHJcbiAgICB9KTtcclxufSk7Il19
