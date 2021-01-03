(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function eventListener() {
      if (errorListener !== undefined) {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };
    var errorListener;

    // Adding an error listener is not optional because
    // if an error is thrown on an event emitter we cannot
    // guarantee that the actual event we are waiting will
    // be fired. The result could be a silent way to create
    // memory or file descriptor leaks, which is something
    // we should avoid.
    if (name !== 'error') {
      errorListener = function errorListener(err) {
        emitter.removeListener(name, eventListener);
        reject(err);
      };

      emitter.once('error', errorListener);
    }

    emitter.once(name, eventListener);
  });
}

},{}],2:[function(require,module,exports){
const CardType =
{
    CIRCLE: 'circle',
    BOX: 'box',
    POLY: 'poly',
    LINE: 'line',
    PAINT: 'paint',
    FILL: 'fill',
    ERASER: 'eraser'
}

module.exports = CardType;
},{}],3:[function(require,module,exports){
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

    get(x, y)
    {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height)
        {
            return this.data[x + y * this.width];
        }
        return null;
    }

    set(x, y, c)
    {
        this.data[x + y * this.width] = c;
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
    // Input coordinates are snapped to the middle of each pixel.
    // TODO - check the perpendicular cases.  Check behavior if the line begins outside of the board (we don't need to support that case, yet)
    linef(x, y, ex, ey, clamp, f)
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

        let i = 0;
        while (true)
        {
            // Call f and check if it requests the line to terminate
            if (!f(u, v))
            {
                break;
            }
            
            // Check if the end of the line was reached
            if (u == ex && v == ey)
            {
                break;
            }

            if (rx * ady < ry * adx)
            {
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
        this.linef(x, y, ex, ey, clamp, (u, v) => 
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
        this.linef(x, y, ex, ey, clamp, (u, v) => 
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
    render(scale, palette, buffer = new Uint8Array(this.bufferSize(scale)))
    {
        if (buffer.length != this.bufferSize(scale))
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

},{"./priority-queue.js":7}],4:[function(require,module,exports){
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

},{"./CardType.js":2,"./board.js":3,"./game.js":5,"events":1}],5:[function(require,module,exports){
const CardType = require('./CardType.js');
const Board = require('./board.js');
const EventEmitter = require('events');

//
// Events
// updateBoard(): this.board has changed
// reveal(cardId, deckId): cardId has been revealed to all players, deckId is its index in this.deck
// deal(playerId, cardId): cardId has been dealt to playerId
// play(playerId, cardId): playerId has played and discarded cardId
// beginTurn(playerId): playerId's turn has begun
//
class Game extends EventEmitter
{
    constructor(numPlayers, shuffle)
    {
        super();

        // Constants
        this.size = 299; // Gameboard dimension

        // Initialize the game board
        this.board = new Board(this.size, this.size);
        this.board.clear(numPlayers);

        if (!(numPlayers >= 1 && numPlayers <= 6))
        {
            throw 'Unsupported player count ' + numPlayers;
        }

        // Make a deck of cards
        this.deck = [];
        const countLow = [0, 3, 3, 4, 5, 6, 7][numPlayers];
        const countMed = [0, 5, 5, 5, 6, 7, 8][numPlayers];
        const countHigh = [0, 7, 7, 7, 8, 8, 9][numPlayers];

        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.ERASER, radius: 30.5, name: 'Eraser' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.BOX, width: 45, height: 21, name: 'Box' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.BOX, width: 21, height: 45, name: 'Box' }));
        this.deck = this.deck.concat(Array(countHigh).fill({ type: CardType.LINE, pixels: 140, name: 'Line' }));
        this.deck = this.deck.concat(Array(countMed).fill({ type: CardType.FILL, radius: 4, name: 'Grow' }));
        this.deck = this.deck.concat(Array(countHigh).fill({ type: CardType.PAINT, radius: 4, pixels: 600, name: 'Brush' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.POLY, sides: 3, radius: 25.5, angle: 0.2, name: 'Polygon' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.POLY, sides: 5, radius: 23.5, angle: 0.4, name: 'Polygon' }));
        this.deck = this.deck.concat(Array(countLow).fill({ type: CardType.POLY, sides: 7, radius: 21.5, angle: 0.6, name: 'Polygon' }));

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
            this.players[i] = { hand: [], disconnected: false };
        }
        this.numConnected--;
    }

    getCard(cardId)
    {
        return this.deck[this.shuffle[cardId]]
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
            this.board.circle(x, y, 8.5, i);
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
        this.currentPlayer = -1;
        this.nextTurn();
    }

    reveal(cardId, deckId)
    {
        this.shuffle[cardId] = deckId;
        this.emit('reveal', cardId);
    }

    // returns true on success, false on failure
    play(action)
    {
        // Make sure the card belongs to the current player
        if (!this.players[this.currentPlayer].hand.includes(action.cardId))
        {
            throw 'Game.play() failed';
        }

        // Get the card data
        let card = this.getCard(action.cardId);
        if (card == null)
        {
            throw 'Game.play() failed';
        }

        // Perform the right action for the card
        switch (card.type)
        {
            case CardType.CIRCLE:
            case CardType.ERASER:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                let color = (card.type == CardType.CIRCLE) ? this.currentPlayer : this.players.length;
                this.board.circle(action.x, action.y, card.radius, color);
                break;
            case CardType.BOX:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                this.board.box(action.x, action.y, card.width, card.height, this.currentPlayer);
                break;
            case CardType.POLY:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                this.board.poly(action.x, action.y, card.sides, card.radius, card.angle, this.currentPlayer);
                break;
            case CardType.LINE:
                if (!this.startOk(action.x, action.y) || action.x2 == null || action.y2 == null)
                {
                    throw 'Game.play() failed';
                }
                this.board.line(action.x, action.y, action.x2, action.y2, card.pixels, this.currentPlayer);
                break;
            case CardType.PAINT:
                if (action.points == null || action.points.length == 0 || action.points.length > card.pixels || !this.startOk(action.points[0].x, action.points[0].y))
                {
                    throw 'Game.play() failed';
                }
                for (let i = 1; i < action.points.length; i++)
                {
                    if (!this.coordsOk(action.points[i].x, action.points[i].y))
                    {
                        throw 'Game.play() failed';
                    }
                }
                let p = card.pixels;
                let r = card.radius;
                let paintBoard = new Board(this.size, this.size);
                paintBoard.clear(this.players.length);
                for (let i = 0; i < action.points.length; i++)
                {
                    if (p <= 0)
                    {
                        throw 'Game.play() failed'; // too many points
                    }

                    let j = Math.max(i - 1, 0);
                    let p2 = paintBoard.paint(action.points[j].x, action.points[j].y, action.points[i].x, action.points[i].y, r, p, this.currentPlayer);
                    p = Math.min(p2, p - 1);
                }
                this.board.add(paintBoard, this.currentPlayer);
                break;
            case CardType.FILL:
                if (!this.startOk(action.x, action.y))
                {
                    throw 'Game.play() failed';
                }
                this.board.flood(action.x, action.y, card.radius, this.currentPlayer);
                break;
            default:
                throw 'Game.play() failed';
        }

        this.emit('updateBoard');
        this.emit('reveal', action.cardId);
        
        // Remove the card from the player's hand
        let player = this.players[this.currentPlayer];
        player.hand.splice(player.hand.indexOf(action.cardId), 1);
        this.emit('play', this.currentPlayer, action.cardId);

        this.nextTurn();
    }

    // Handle disconnects
    removePlayer(playerId)
    {
        if (--this.numConnected == 1)
        {
            // TODO game is over
        }

        this.players[playerId].disconnected = true;

        // TODO - handle if it's that player's turn
    }

    //
    // INTERNAL functions
    //

    // Deal one card from the pile to a player
    deal(playerId)
    {
        if (this.pile.length)
        {
            let cardId = this.pile.pop();
            this.emit('deal', playerId, cardId);
            this.players[playerId].hand.push(cardId);
        }
    }

    nextTurn()
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
    }

    coordsOk(x, y)
    {
        return x > -100000 && x < 100000 && y > -100000 && y < 100000;
    }

    startOk(x, y)
    {
        return (this.board.get(x, y) == this.currentPlayer || this.board.count(this.players.length + 1)[this.currentPlayer] == 0);
    }
}

module.exports = Game;

},{"./CardType.js":2,"./board.js":3,"events":1}],6:[function(require,module,exports){
// This requires the socket.io.js client in the global scope
const Client = require('./client.js');

// Entry point.
// Manages the lobby UI in index.html.
$(function()
{
    let host = false;
    let socket = null;
    let key = '';
    let localPlayerId = -1;
    let lobbyPlayers = [];

    //
    // Helper functions
    //

    function addPlayer(name)
    {
        let li = $('<li>').text(name);
        if (lobbyPlayers.length == 0)
        {
            li.append(' (host)');
        }
        $('#playerList').append(li);
        lobbyPlayers.push({name: name, li: li});
    }

    function becomeHost()
    {
        $('#startForm').show();
        $('#startForm').submit(function()
        {
            socket.emit('start');
            return false; // Don't reload the page
        });
    }

    function startGame()
    {
        $('#lobby').hide();
        $('#playerList').empty();

        let playerNames = [];
        lobbyPlayers.forEach(player => playerNames.push(player.name));
        client = new Client();
        client.begin(socket, playerNames, localPlayerId);
    }
    
    // Join an existing lobby or create a new one
    socket = io();
    let joinForm = $('#joinForm');
    let localForm = $('#localForm');
    key = document.location.search.slice(1);
    if (key.length == 6)
    {
        host = false;
        $('#joinButton').text("Join game");
    }
    else
    {
        // Testing option - quick start a local game
        localForm.show();
        localForm.submit(function()
        {
            socket.close();
            joinForm.hide();
            localForm.hide();
            let numPlayers = $('#localPlayersInput').val();
            localPlayerId = -1;
            lobbyPlayers = [];
            for (let i = 0; i < numPlayers; i++)
            {
                addPlayer('Player ' + (i + 1));
            }
            startGame();
            return false;
        });
        host = true;
    }
    
    // Show the lobby once the player joins
    joinForm.show();
    joinForm.submit(function()
    {
        joinForm.hide();
        localForm.hide();
        
        let playerName = $('#nameInput').val();

        // When I enter the lobby
        socket.on('join', (gameKey, players) =>
        {
            $('#lobby').show();
            key = gameKey;
            localPlayerId = players.length;
            lobbyPlayers = [];
            let url = window.location.origin + window.location.pathname + '?' + key;
            $('#gameUrl').html(url).attr('href', url);
            for (let i = 0; i < players.length; i++)
            {
                addPlayer(players[i]);
            }
            addPlayer(playerName);
            if (players.length == 0)
            {
                becomeHost();
            }
        });

        // When another player enters the lobby
        socket.on('addPlayer', (name) =>
        {
            addPlayer(name);
        });

        // When another player leaves the lobby
        socket.on('removePlayer', (id) =>
        {
            lobbyPlayers[id].li.remove();
            lobbyPlayers.splice(id, 1);
            if (id == 0)
            {
                lobbyPlayers[0].li.append(' (host)');
            }
            if (localPlayerId > id)
            {
                localPlayerId--;
                if (localPlayerId == 0)
                {
                    becomeHost();
                }
            }
        });

        // When the server rejects the join
        socket.on('error', () =>
        {
            let url = window.location.origin + window.location.pathname;
            $('#startUrl').attr('href', url);
            $('#error').show();
        });

        // When the game begins
        // TODO - need to forbid inputs until ready.  can't send any game messages to the server until it tells us it's ready.
        socket.on('start', startGame);

        // Send first message to the server
        socket.emit('join', playerName, key);

        // Don't reload the page
        return false;
    });
});

},{"./client.js":4}],7:[function(require,module,exports){
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

},{}]},{},[6])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uLy4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCJDYXJkVHlwZS5qcyIsImJvYXJkLmpzIiwiY2xpZW50LmpzIiwiZ2FtZS5qcyIsImxvYmJ5LmpzIiwicHJpb3JpdHktcXVldWUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDLzJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIFIgPSB0eXBlb2YgUmVmbGVjdCA9PT0gJ29iamVjdCcgPyBSZWZsZWN0IDogbnVsbFxudmFyIFJlZmxlY3RBcHBseSA9IFIgJiYgdHlwZW9mIFIuYXBwbHkgPT09ICdmdW5jdGlvbidcbiAgPyBSLmFwcGx5XG4gIDogZnVuY3Rpb24gUmVmbGVjdEFwcGx5KHRhcmdldCwgcmVjZWl2ZXIsIGFyZ3MpIHtcbiAgICByZXR1cm4gRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwodGFyZ2V0LCByZWNlaXZlciwgYXJncyk7XG4gIH1cblxudmFyIFJlZmxlY3RPd25LZXlzXG5pZiAoUiAmJiB0eXBlb2YgUi5vd25LZXlzID09PSAnZnVuY3Rpb24nKSB7XG4gIFJlZmxlY3RPd25LZXlzID0gUi5vd25LZXlzXG59IGVsc2UgaWYgKE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMpIHtcbiAgUmVmbGVjdE93bktleXMgPSBmdW5jdGlvbiBSZWZsZWN0T3duS2V5cyh0YXJnZXQpIHtcbiAgICByZXR1cm4gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModGFyZ2V0KVxuICAgICAgLmNvbmNhdChPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHRhcmdldCkpO1xuICB9O1xufSBlbHNlIHtcbiAgUmVmbGVjdE93bktleXMgPSBmdW5jdGlvbiBSZWZsZWN0T3duS2V5cyh0YXJnZXQpIHtcbiAgICByZXR1cm4gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModGFyZ2V0KTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gUHJvY2Vzc0VtaXRXYXJuaW5nKHdhcm5pbmcpIHtcbiAgaWYgKGNvbnNvbGUgJiYgY29uc29sZS53YXJuKSBjb25zb2xlLndhcm4od2FybmluZyk7XG59XG5cbnZhciBOdW1iZXJJc05hTiA9IE51bWJlci5pc05hTiB8fCBmdW5jdGlvbiBOdW1iZXJJc05hTih2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgIT09IHZhbHVlO1xufVxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIEV2ZW50RW1pdHRlci5pbml0LmNhbGwodGhpcyk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcbm1vZHVsZS5leHBvcnRzLm9uY2UgPSBvbmNlO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50c0NvdW50ID0gMDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxudmFyIGRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuZnVuY3Rpb24gY2hlY2tMaXN0ZW5lcihsaXN0ZW5lcikge1xuICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVGhlIFwibGlzdGVuZXJcIiBhcmd1bWVudCBtdXN0IGJlIG9mIHR5cGUgRnVuY3Rpb24uIFJlY2VpdmVkIHR5cGUgJyArIHR5cGVvZiBsaXN0ZW5lcik7XG4gIH1cbn1cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KEV2ZW50RW1pdHRlciwgJ2RlZmF1bHRNYXhMaXN0ZW5lcnMnLCB7XG4gIGVudW1lcmFibGU6IHRydWUsXG4gIGdldDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gIH0sXG4gIHNldDogZnVuY3Rpb24oYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgIT09ICdudW1iZXInIHx8IGFyZyA8IDAgfHwgTnVtYmVySXNOYU4oYXJnKSkge1xuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSB2YWx1ZSBvZiBcImRlZmF1bHRNYXhMaXN0ZW5lcnNcIiBpcyBvdXQgb2YgcmFuZ2UuIEl0IG11c3QgYmUgYSBub24tbmVnYXRpdmUgbnVtYmVyLiBSZWNlaXZlZCAnICsgYXJnICsgJy4nKTtcbiAgICB9XG4gICAgZGVmYXVsdE1heExpc3RlbmVycyA9IGFyZztcbiAgfVxufSk7XG5cbkV2ZW50RW1pdHRlci5pbml0ID0gZnVuY3Rpb24oKSB7XG5cbiAgaWYgKHRoaXMuX2V2ZW50cyA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICB0aGlzLl9ldmVudHMgPT09IE9iamVjdC5nZXRQcm90b3R5cGVPZih0aGlzKS5fZXZlbnRzKSB7XG4gICAgdGhpcy5fZXZlbnRzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICB0aGlzLl9ldmVudHNDb3VudCA9IDA7XG4gIH1cblxuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufTtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24gc2V0TWF4TGlzdGVuZXJzKG4pIHtcbiAgaWYgKHR5cGVvZiBuICE9PSAnbnVtYmVyJyB8fCBuIDwgMCB8fCBOdW1iZXJJc05hTihuKSkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdUaGUgdmFsdWUgb2YgXCJuXCIgaXMgb3V0IG9mIHJhbmdlLiBJdCBtdXN0IGJlIGEgbm9uLW5lZ2F0aXZlIG51bWJlci4gUmVjZWl2ZWQgJyArIG4gKyAnLicpO1xuICB9XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuZnVuY3Rpb24gX2dldE1heExpc3RlbmVycyh0aGF0KSB7XG4gIGlmICh0aGF0Ll9tYXhMaXN0ZW5lcnMgPT09IHVuZGVmaW5lZClcbiAgICByZXR1cm4gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gIHJldHVybiB0aGF0Ll9tYXhMaXN0ZW5lcnM7XG59XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZ2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24gZ2V0TWF4TGlzdGVuZXJzKCkge1xuICByZXR1cm4gX2dldE1heExpc3RlbmVycyh0aGlzKTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uIGVtaXQodHlwZSkge1xuICB2YXIgYXJncyA9IFtdO1xuICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykgYXJncy5wdXNoKGFyZ3VtZW50c1tpXSk7XG4gIHZhciBkb0Vycm9yID0gKHR5cGUgPT09ICdlcnJvcicpO1xuXG4gIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHM7XG4gIGlmIChldmVudHMgIT09IHVuZGVmaW5lZClcbiAgICBkb0Vycm9yID0gKGRvRXJyb3IgJiYgZXZlbnRzLmVycm9yID09PSB1bmRlZmluZWQpO1xuICBlbHNlIGlmICghZG9FcnJvcilcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAoZG9FcnJvcikge1xuICAgIHZhciBlcjtcbiAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgZXIgPSBhcmdzWzBdO1xuICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAvLyBOb3RlOiBUaGUgY29tbWVudHMgb24gdGhlIGB0aHJvd2AgbGluZXMgYXJlIGludGVudGlvbmFsLCB0aGV5IHNob3dcbiAgICAgIC8vIHVwIGluIE5vZGUncyBvdXRwdXQgaWYgdGhpcyByZXN1bHRzIGluIGFuIHVuaGFuZGxlZCBleGNlcHRpb24uXG4gICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICB9XG4gICAgLy8gQXQgbGVhc3QgZ2l2ZSBzb21lIGtpbmQgb2YgY29udGV4dCB0byB0aGUgdXNlclxuICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1VuaGFuZGxlZCBlcnJvci4nICsgKGVyID8gJyAoJyArIGVyLm1lc3NhZ2UgKyAnKScgOiAnJykpO1xuICAgIGVyci5jb250ZXh0ID0gZXI7XG4gICAgdGhyb3cgZXJyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICB9XG5cbiAgdmFyIGhhbmRsZXIgPSBldmVudHNbdHlwZV07XG5cbiAgaWYgKGhhbmRsZXIgPT09IHVuZGVmaW5lZClcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKHR5cGVvZiBoYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgUmVmbGVjdEFwcGx5KGhhbmRsZXIsIHRoaXMsIGFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIHZhciBsZW4gPSBoYW5kbGVyLmxlbmd0aDtcbiAgICB2YXIgbGlzdGVuZXJzID0gYXJyYXlDbG9uZShoYW5kbGVyLCBsZW4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpXG4gICAgICBSZWZsZWN0QXBwbHkobGlzdGVuZXJzW2ldLCB0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZnVuY3Rpb24gX2FkZExpc3RlbmVyKHRhcmdldCwgdHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcbiAgdmFyIG07XG4gIHZhciBldmVudHM7XG4gIHZhciBleGlzdGluZztcblxuICBjaGVja0xpc3RlbmVyKGxpc3RlbmVyKTtcblxuICBldmVudHMgPSB0YXJnZXQuX2V2ZW50cztcbiAgaWYgKGV2ZW50cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgZXZlbnRzID0gdGFyZ2V0Ll9ldmVudHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHRhcmdldC5fZXZlbnRzQ291bnQgPSAwO1xuICB9IGVsc2Uge1xuICAgIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gICAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lclwiLlxuICAgIGlmIChldmVudHMubmV3TGlzdGVuZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGFyZ2V0LmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyID8gbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgICAgIC8vIFJlLWFzc2lnbiBgZXZlbnRzYCBiZWNhdXNlIGEgbmV3TGlzdGVuZXIgaGFuZGxlciBjb3VsZCBoYXZlIGNhdXNlZCB0aGVcbiAgICAgIC8vIHRoaXMuX2V2ZW50cyB0byBiZSBhc3NpZ25lZCB0byBhIG5ldyBvYmplY3RcbiAgICAgIGV2ZW50cyA9IHRhcmdldC5fZXZlbnRzO1xuICAgIH1cbiAgICBleGlzdGluZyA9IGV2ZW50c1t0eXBlXTtcbiAgfVxuXG4gIGlmIChleGlzdGluZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgZXhpc3RpbmcgPSBldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgICArK3RhcmdldC5fZXZlbnRzQ291bnQ7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBleGlzdGluZyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgICBleGlzdGluZyA9IGV2ZW50c1t0eXBlXSA9XG4gICAgICAgIHByZXBlbmQgPyBbbGlzdGVuZXIsIGV4aXN0aW5nXSA6IFtleGlzdGluZywgbGlzdGVuZXJdO1xuICAgICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIH0gZWxzZSBpZiAocHJlcGVuZCkge1xuICAgICAgZXhpc3RpbmcudW5zaGlmdChsaXN0ZW5lcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4aXN0aW5nLnB1c2gobGlzdGVuZXIpO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gICAgbSA9IF9nZXRNYXhMaXN0ZW5lcnModGFyZ2V0KTtcbiAgICBpZiAobSA+IDAgJiYgZXhpc3RpbmcubGVuZ3RoID4gbSAmJiAhZXhpc3Rpbmcud2FybmVkKSB7XG4gICAgICBleGlzdGluZy53YXJuZWQgPSB0cnVlO1xuICAgICAgLy8gTm8gZXJyb3IgY29kZSBmb3IgdGhpcyBzaW5jZSBpdCBpcyBhIFdhcm5pbmdcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuICAgICAgdmFyIHcgPSBuZXcgRXJyb3IoJ1Bvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgbGVhayBkZXRlY3RlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nLmxlbmd0aCArICcgJyArIFN0cmluZyh0eXBlKSArICcgbGlzdGVuZXJzICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAnYWRkZWQuIFVzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAnaW5jcmVhc2UgbGltaXQnKTtcbiAgICAgIHcubmFtZSA9ICdNYXhMaXN0ZW5lcnNFeGNlZWRlZFdhcm5pbmcnO1xuICAgICAgdy5lbWl0dGVyID0gdGFyZ2V0O1xuICAgICAgdy50eXBlID0gdHlwZTtcbiAgICAgIHcuY291bnQgPSBleGlzdGluZy5sZW5ndGg7XG4gICAgICBQcm9jZXNzRW1pdFdhcm5pbmcodyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRhcmdldDtcbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uIGFkZExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHJldHVybiBfYWRkTGlzdGVuZXIodGhpcywgdHlwZSwgbGlzdGVuZXIsIGZhbHNlKTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRMaXN0ZW5lciA9XG4gICAgZnVuY3Rpb24gcHJlcGVuZExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyKSB7XG4gICAgICByZXR1cm4gX2FkZExpc3RlbmVyKHRoaXMsIHR5cGUsIGxpc3RlbmVyLCB0cnVlKTtcbiAgICB9O1xuXG5mdW5jdGlvbiBvbmNlV3JhcHBlcigpIHtcbiAgaWYgKCF0aGlzLmZpcmVkKSB7XG4gICAgdGhpcy50YXJnZXQucmVtb3ZlTGlzdGVuZXIodGhpcy50eXBlLCB0aGlzLndyYXBGbik7XG4gICAgdGhpcy5maXJlZCA9IHRydWU7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICByZXR1cm4gdGhpcy5saXN0ZW5lci5jYWxsKHRoaXMudGFyZ2V0KTtcbiAgICByZXR1cm4gdGhpcy5saXN0ZW5lci5hcHBseSh0aGlzLnRhcmdldCwgYXJndW1lbnRzKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBfb25jZVdyYXAodGFyZ2V0LCB0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgc3RhdGUgPSB7IGZpcmVkOiBmYWxzZSwgd3JhcEZuOiB1bmRlZmluZWQsIHRhcmdldDogdGFyZ2V0LCB0eXBlOiB0eXBlLCBsaXN0ZW5lcjogbGlzdGVuZXIgfTtcbiAgdmFyIHdyYXBwZWQgPSBvbmNlV3JhcHBlci5iaW5kKHN0YXRlKTtcbiAgd3JhcHBlZC5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICBzdGF0ZS53cmFwRm4gPSB3cmFwcGVkO1xuICByZXR1cm4gd3JhcHBlZDtcbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24gb25jZSh0eXBlLCBsaXN0ZW5lcikge1xuICBjaGVja0xpc3RlbmVyKGxpc3RlbmVyKTtcbiAgdGhpcy5vbih0eXBlLCBfb25jZVdyYXAodGhpcywgdHlwZSwgbGlzdGVuZXIpKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRPbmNlTGlzdGVuZXIgPVxuICAgIGZ1bmN0aW9uIHByZXBlbmRPbmNlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXIpIHtcbiAgICAgIGNoZWNrTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgdGhpcy5wcmVwZW5kTGlzdGVuZXIodHlwZSwgX29uY2VXcmFwKHRoaXMsIHR5cGUsIGxpc3RlbmVyKSk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4vLyBFbWl0cyBhICdyZW1vdmVMaXN0ZW5lcicgZXZlbnQgaWYgYW5kIG9ubHkgaWYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9XG4gICAgZnVuY3Rpb24gcmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXIpIHtcbiAgICAgIHZhciBsaXN0LCBldmVudHMsIHBvc2l0aW9uLCBpLCBvcmlnaW5hbExpc3RlbmVyO1xuXG4gICAgICBjaGVja0xpc3RlbmVyKGxpc3RlbmVyKTtcblxuICAgICAgZXZlbnRzID0gdGhpcy5fZXZlbnRzO1xuICAgICAgaWYgKGV2ZW50cyA9PT0gdW5kZWZpbmVkKVxuICAgICAgICByZXR1cm4gdGhpcztcblxuICAgICAgbGlzdCA9IGV2ZW50c1t0eXBlXTtcbiAgICAgIGlmIChsaXN0ID09PSB1bmRlZmluZWQpXG4gICAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHwgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpIHtcbiAgICAgICAgaWYgKC0tdGhpcy5fZXZlbnRzQ291bnQgPT09IDApXG4gICAgICAgICAgdGhpcy5fZXZlbnRzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgZGVsZXRlIGV2ZW50c1t0eXBlXTtcbiAgICAgICAgICBpZiAoZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3QubGlzdGVuZXIgfHwgbGlzdGVuZXIpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBsaXN0ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHBvc2l0aW9uID0gLTE7XG5cbiAgICAgICAgZm9yIChpID0gbGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fCBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikge1xuICAgICAgICAgICAgb3JpZ2luYWxMaXN0ZW5lciA9IGxpc3RbaV0ubGlzdGVuZXI7XG4gICAgICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgICAgIGlmIChwb3NpdGlvbiA9PT0gMClcbiAgICAgICAgICBsaXN0LnNoaWZ0KCk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIHNwbGljZU9uZShsaXN0LCBwb3NpdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpXG4gICAgICAgICAgZXZlbnRzW3R5cGVdID0gbGlzdFswXTtcblxuICAgICAgICBpZiAoZXZlbnRzLnJlbW92ZUxpc3RlbmVyICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIG9yaWdpbmFsTGlzdGVuZXIgfHwgbGlzdGVuZXIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9mZiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID1cbiAgICBmdW5jdGlvbiByZW1vdmVBbGxMaXN0ZW5lcnModHlwZSkge1xuICAgICAgdmFyIGxpc3RlbmVycywgZXZlbnRzLCBpO1xuXG4gICAgICBldmVudHMgPSB0aGlzLl9ldmVudHM7XG4gICAgICBpZiAoZXZlbnRzID09PSB1bmRlZmluZWQpXG4gICAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gICAgICBpZiAoZXZlbnRzLnJlbW92ZUxpc3RlbmVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aGlzLl9ldmVudHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICAgIHRoaXMuX2V2ZW50c0NvdW50ID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChldmVudHNbdHlwZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICgtLXRoaXMuX2V2ZW50c0NvdW50ID09PSAwKVxuICAgICAgICAgICAgdGhpcy5fZXZlbnRzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICBkZWxldGUgZXZlbnRzW3R5cGVdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuXG4gICAgICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoZXZlbnRzKTtcbiAgICAgICAgdmFyIGtleTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBrZXkgPSBrZXlzW2ldO1xuICAgICAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgIHRoaXMuX2V2ZW50c0NvdW50ID0gMDtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG5cbiAgICAgIGxpc3RlbmVycyA9IGV2ZW50c1t0eXBlXTtcblxuICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lcnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnMpO1xuICAgICAgfSBlbHNlIGlmIChsaXN0ZW5lcnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBMSUZPIG9yZGVyXG4gICAgICAgIGZvciAoaSA9IGxpc3RlbmVycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2ldKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG5mdW5jdGlvbiBfbGlzdGVuZXJzKHRhcmdldCwgdHlwZSwgdW53cmFwKSB7XG4gIHZhciBldmVudHMgPSB0YXJnZXQuX2V2ZW50cztcblxuICBpZiAoZXZlbnRzID09PSB1bmRlZmluZWQpXG4gICAgcmV0dXJuIFtdO1xuXG4gIHZhciBldmxpc3RlbmVyID0gZXZlbnRzW3R5cGVdO1xuICBpZiAoZXZsaXN0ZW5lciA9PT0gdW5kZWZpbmVkKVxuICAgIHJldHVybiBbXTtcblxuICBpZiAodHlwZW9mIGV2bGlzdGVuZXIgPT09ICdmdW5jdGlvbicpXG4gICAgcmV0dXJuIHVud3JhcCA/IFtldmxpc3RlbmVyLmxpc3RlbmVyIHx8IGV2bGlzdGVuZXJdIDogW2V2bGlzdGVuZXJdO1xuXG4gIHJldHVybiB1bndyYXAgP1xuICAgIHVud3JhcExpc3RlbmVycyhldmxpc3RlbmVyKSA6IGFycmF5Q2xvbmUoZXZsaXN0ZW5lciwgZXZsaXN0ZW5lci5sZW5ndGgpO1xufVxuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uIGxpc3RlbmVycyh0eXBlKSB7XG4gIHJldHVybiBfbGlzdGVuZXJzKHRoaXMsIHR5cGUsIHRydWUpO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yYXdMaXN0ZW5lcnMgPSBmdW5jdGlvbiByYXdMaXN0ZW5lcnModHlwZSkge1xuICByZXR1cm4gX2xpc3RlbmVycyh0aGlzLCB0eXBlLCBmYWxzZSk7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgaWYgKHR5cGVvZiBlbWl0dGVyLmxpc3RlbmVyQ291bnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gZW1pdHRlci5saXN0ZW5lckNvdW50KHR5cGUpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBsaXN0ZW5lckNvdW50LmNhbGwoZW1pdHRlciwgdHlwZSk7XG4gIH1cbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJDb3VudCA9IGxpc3RlbmVyQ291bnQ7XG5mdW5jdGlvbiBsaXN0ZW5lckNvdW50KHR5cGUpIHtcbiAgdmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50cztcblxuICBpZiAoZXZlbnRzICE9PSB1bmRlZmluZWQpIHtcbiAgICB2YXIgZXZsaXN0ZW5lciA9IGV2ZW50c1t0eXBlXTtcblxuICAgIGlmICh0eXBlb2YgZXZsaXN0ZW5lciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfSBlbHNlIGlmIChldmxpc3RlbmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBldmxpc3RlbmVyLmxlbmd0aDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gMDtcbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5ldmVudE5hbWVzID0gZnVuY3Rpb24gZXZlbnROYW1lcygpIHtcbiAgcmV0dXJuIHRoaXMuX2V2ZW50c0NvdW50ID4gMCA/IFJlZmxlY3RPd25LZXlzKHRoaXMuX2V2ZW50cykgOiBbXTtcbn07XG5cbmZ1bmN0aW9uIGFycmF5Q2xvbmUoYXJyLCBuKSB7XG4gIHZhciBjb3B5ID0gbmV3IEFycmF5KG4pO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSlcbiAgICBjb3B5W2ldID0gYXJyW2ldO1xuICByZXR1cm4gY29weTtcbn1cblxuZnVuY3Rpb24gc3BsaWNlT25lKGxpc3QsIGluZGV4KSB7XG4gIGZvciAoOyBpbmRleCArIDEgPCBsaXN0Lmxlbmd0aDsgaW5kZXgrKylcbiAgICBsaXN0W2luZGV4XSA9IGxpc3RbaW5kZXggKyAxXTtcbiAgbGlzdC5wb3AoKTtcbn1cblxuZnVuY3Rpb24gdW53cmFwTGlzdGVuZXJzKGFycikge1xuICB2YXIgcmV0ID0gbmV3IEFycmF5KGFyci5sZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJldC5sZW5ndGg7ICsraSkge1xuICAgIHJldFtpXSA9IGFycltpXS5saXN0ZW5lciB8fCBhcnJbaV07XG4gIH1cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gb25jZShlbWl0dGVyLCBuYW1lKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgZnVuY3Rpb24gZXZlbnRMaXN0ZW5lcigpIHtcbiAgICAgIGlmIChlcnJvckxpc3RlbmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZW1pdHRlci5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBlcnJvckxpc3RlbmVyKTtcbiAgICAgIH1cbiAgICAgIHJlc29sdmUoW10uc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcbiAgICB9O1xuICAgIHZhciBlcnJvckxpc3RlbmVyO1xuXG4gICAgLy8gQWRkaW5nIGFuIGVycm9yIGxpc3RlbmVyIGlzIG5vdCBvcHRpb25hbCBiZWNhdXNlXG4gICAgLy8gaWYgYW4gZXJyb3IgaXMgdGhyb3duIG9uIGFuIGV2ZW50IGVtaXR0ZXIgd2UgY2Fubm90XG4gICAgLy8gZ3VhcmFudGVlIHRoYXQgdGhlIGFjdHVhbCBldmVudCB3ZSBhcmUgd2FpdGluZyB3aWxsXG4gICAgLy8gYmUgZmlyZWQuIFRoZSByZXN1bHQgY291bGQgYmUgYSBzaWxlbnQgd2F5IHRvIGNyZWF0ZVxuICAgIC8vIG1lbW9yeSBvciBmaWxlIGRlc2NyaXB0b3IgbGVha3MsIHdoaWNoIGlzIHNvbWV0aGluZ1xuICAgIC8vIHdlIHNob3VsZCBhdm9pZC5cbiAgICBpZiAobmFtZSAhPT0gJ2Vycm9yJykge1xuICAgICAgZXJyb3JMaXN0ZW5lciA9IGZ1bmN0aW9uIGVycm9yTGlzdGVuZXIoZXJyKSB7XG4gICAgICAgIGVtaXR0ZXIucmVtb3ZlTGlzdGVuZXIobmFtZSwgZXZlbnRMaXN0ZW5lcik7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfTtcblxuICAgICAgZW1pdHRlci5vbmNlKCdlcnJvcicsIGVycm9yTGlzdGVuZXIpO1xuICAgIH1cblxuICAgIGVtaXR0ZXIub25jZShuYW1lLCBldmVudExpc3RlbmVyKTtcbiAgfSk7XG59XG4iLCJjb25zdCBDYXJkVHlwZSA9XHJcbntcclxuICAgIENJUkNMRTogJ2NpcmNsZScsXHJcbiAgICBCT1g6ICdib3gnLFxyXG4gICAgUE9MWTogJ3BvbHknLFxyXG4gICAgTElORTogJ2xpbmUnLFxyXG4gICAgUEFJTlQ6ICdwYWludCcsXHJcbiAgICBGSUxMOiAnZmlsbCcsXHJcbiAgICBFUkFTRVI6ICdlcmFzZXInXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQ2FyZFR5cGU7IiwidmFyIFByaW9yaXR5UXVldWUgPSByZXF1aXJlKCcuL3ByaW9yaXR5LXF1ZXVlLmpzJyk7XHJcblxyXG5jbGFzcyBCb2FyZFxyXG57XHJcbiAgICBjb25zdHJ1Y3Rvcih3aWR0aCwgaGVpZ2h0KVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmRhdGEgPSBuZXcgQXJyYXkod2lkdGggKiBoZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vXHJcbiAgICAvLyBBY2Nlc3NvcnNcclxuICAgIC8vXHJcblxyXG4gICAgZ2V0KHgsIHkpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHggPj0gMCAmJiB4IDwgdGhpcy53aWR0aCAmJiB5ID49IDAgJiYgeSA8IHRoaXMuaGVpZ2h0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YVt4ICsgeSAqIHRoaXMud2lkdGhdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBzZXQoeCwgeSwgYylcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRhdGFbeCArIHkgKiB0aGlzLndpZHRoXSA9IGM7XHJcbiAgICB9XHJcblxyXG4gICAgLy9cclxuICAgIC8vIEl0ZXJhdG9yc1xyXG4gICAgLy9cclxuXHJcbiAgICAvLyBDYWxscyBmKGkpIGZvciBlYWNoIHBpeGVsXHJcbiAgICBhbGxmKGYpXHJcbiAgICB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRhdGEubGVuZ3RoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBmKGkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBjYWxscyBmKHUsIHYpIGZvciBlYWNoIHBpeGVsICh1LCB2KSB3aXRoIHx8KHgsIHkpIC0gKHUsIHYpfHwgPD0gclxyXG4gICAgY2lyY2xlZih4LCB5LCByLCBmKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwID0gTWF0aC5mbG9vcihyKTtcclxuICAgICAgICBmb3IgKGxldCB1ID0gTWF0aC5tYXgoLXAsIC14KTsgdSA8PSBNYXRoLm1pbihwLCB0aGlzLndpZHRoIC0gMSAtIHgpOyB1KyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcSA9IE1hdGguZmxvb3IoTWF0aC5zcXJ0KHIgKiByIC0gdSAqIHUpKTtcclxuICAgICAgICAgICAgZm9yIChsZXQgdiA9IE1hdGgubWF4KC1xLCAteSk7IHYgPD0gTWF0aC5taW4ocSwgdGhpcy5oZWlnaHQgLSAxIC0geSk7IHYrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZih4ICsgdSwgeSArIHYpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDYWxscyBmIGZvciBlYWNoIHBpeGVsIG9uIGEgbGluZSBmcm9tICh4LCB5KSB0byAoZXgsIGV5KS4gIFRlcm1pbmF0ZXMgaWYgZiBkb2VzIG5vdCByZXR1cm4gdHJ1ZS5cclxuICAgIC8vIElmIGNsYW1wIGlzIGZhbHNlLCB0aGUgbGluZSB3aWxsIHRlcm1pbmF0ZSB3aGVuIGl0IHJlYWNoZXMgYW4gZWRnZSBvZiB0aGUgYm9hcmQuXHJcbiAgICAvLyBJZiBjbGFtcCBpcyB0cnVlLCB0aGUgbGluZSB3aWxsIGNvbnRpbnVlIGFsb25nIHRoYXQgZWRnZSwgdGVybWluYXRpbmcgb25seSBpZiBpdCBpcyBwZXJwZW5kaWN1bGFyIHRvIHRoZSBlZGdlIG9yIGlmIGl0IHJlYWNoZXMgYSBjb3JuZXIuXHJcbiAgICAvLyBJbnB1dCBjb29yZGluYXRlcyBhcmUgc25hcHBlZCB0byB0aGUgbWlkZGxlIG9mIGVhY2ggcGl4ZWwuXHJcbiAgICAvLyBUT0RPIC0gY2hlY2sgdGhlIHBlcnBlbmRpY3VsYXIgY2FzZXMuICBDaGVjayBiZWhhdmlvciBpZiB0aGUgbGluZSBiZWdpbnMgb3V0c2lkZSBvZiB0aGUgYm9hcmQgKHdlIGRvbid0IG5lZWQgdG8gc3VwcG9ydCB0aGF0IGNhc2UsIHlldClcclxuICAgIGxpbmVmKHgsIHksIGV4LCBleSwgY2xhbXAsIGYpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gTGluZSBvcmlnaW4gYW5kIGRpcmVjdGlvblxyXG4gICAgICAgIGxldCBkeCA9IGV4IC0geDtcclxuICAgICAgICBsZXQgZHkgPSBleSAtIHk7XHJcbiAgICAgICAgbGV0IHUgPSBNYXRoLmZsb29yKHgpO1xyXG4gICAgICAgIGxldCB2ID0gTWF0aC5mbG9vcih5KTtcclxuXHJcbiAgICAgICAgLy8gYWJzb2x1dGUgdmFsdWUgYW5kIHNpZ24gb2YgZGlyZWN0aW9uXHJcbiAgICAgICAgbGV0IGFkeCA9IE1hdGguYWJzKGR4KTtcclxuICAgICAgICBsZXQgYWR5ID0gTWF0aC5hYnMoZHkpO1xyXG4gICAgICAgIGxldCBhZHlkeCA9IGFkeSAvIGFkeDtcclxuICAgICAgICBsZXQgYWR4ZHkgPSBhZHggLyBhZHk7XHJcbiAgICAgICAgbGV0IGlkeCA9IChkeCA+IDApID8gMSA6IC0xO1xyXG4gICAgICAgIGxldCBpZHkgPSAoZHkgPiAwKSA/IDEgOiAtMTtcclxuXHJcbiAgICAgICAgLy8gRGlzdGFuY2UgdW50aWwgdGhlIG5leHQgcGl4ZWwgaW4gZWFjaCBkaXJlY3Rpb25cclxuICAgICAgICBsZXQgcnggPSAwLjU7XHJcbiAgICAgICAgbGV0IHJ5ID0gMC41O1xyXG5cclxuICAgICAgICBsZXQgaSA9IDA7XHJcbiAgICAgICAgd2hpbGUgKHRydWUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBDYWxsIGYgYW5kIGNoZWNrIGlmIGl0IHJlcXVlc3RzIHRoZSBsaW5lIHRvIHRlcm1pbmF0ZVxyXG4gICAgICAgICAgICBpZiAoIWYodSwgdikpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZW5kIG9mIHRoZSBsaW5lIHdhcyByZWFjaGVkXHJcbiAgICAgICAgICAgIGlmICh1ID09IGV4ICYmIHYgPT0gZXkpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAocnggKiBhZHkgPCByeSAqIGFkeClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gbW92ZSBpbiB4XHJcbiAgICAgICAgICAgICAgICByeSAtPSByeCAqIGFkeWR4O1xyXG4gICAgICAgICAgICAgICAgcnggPSAxO1xyXG4gICAgICAgICAgICAgICAgdSArPSBpZHg7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGNvbGxpc2lvbiB3aXRoIGxlZnQvcmlnaHQgZWRnZVxyXG4gICAgICAgICAgICAgICAgaWYgKHUgPCAwIHx8IHUgPj0gdGhpcy53aWR0aClcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2xhbXAgJiYgYWR5ICE9IDApXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB1ID0gTWF0aC5taW4oTWF0aC5tYXgodSwgMCksIHRoaXMud2lkdGggLSAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXggPSB1O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhZHggPSBhZHhkeSA9IGFkeWR4ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgLy8gbW92ZSBpbiB5XHJcbiAgICAgICAgICAgICAgICByeCAtPSByeSAqIGFkeGR5O1xyXG4gICAgICAgICAgICAgICAgcnkgPSAxO1xyXG4gICAgICAgICAgICAgICAgdiArPSBpZHk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb24gd2l0aCB0b3AvYm90dG9tIGVkZ2VcclxuICAgICAgICAgICAgICAgIGlmICh2IDwgMCB8fCB2ID49IHRoaXMuaGVpZ2h0KVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbGFtcCAmJiBhZHggIT0gMClcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHYgPSBNYXRoLm1pbihNYXRoLm1heCh2LCAwKSwgdGhpcy5oZWlnaHQgLSAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXkgPSB2O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhZHkgPSBhZHhkeSA9IGFkeWR4ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vXHJcbiAgICAvLyBEcmF3aW5nXHJcbiAgICAvL1xyXG4gICAgXHJcbiAgICAvLyBEcmF3IGEgY2lyY2xlIG9mIGNvbG9yIGMgY2VudGVyZWQgYXQgKHgsIHkpIHdpdGggcmFkaXVzIHJcclxuICAgIGNpcmNsZSh4LCB5LCByLCBjKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2lyY2xlZih4LCB5LCByLCAodSwgdikgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0KHUsIHYsIGMpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEcmF3IGEgYm94IG9mIGNvbG9yIGMgY2VudGVyZWQgYXQgeCwgeSB3aXRoIGRpbWVuc2lvbnMgdywgaFxyXG4gICAgYm94KHgsIHksIHcsIGgsIGMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGhhbGZXID0gTWF0aC5mbG9vcigodyAtIDEpIC8gMik7XHJcbiAgICAgICAgbGV0IGhhbGZIID0gTWF0aC5mbG9vcigoaCAtIDEpIC8gMik7XHJcbiAgICAgICAgZm9yIChsZXQgdSA9IE1hdGgubWF4KC1oYWxmVywgLXgpOyB1IDw9IE1hdGgubWluKGhhbGZXLCB0aGlzLndpZHRoIC0gMSAtIHgpOyB1KyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBmb3IgKGxldCB2ID0gTWF0aC5tYXgoLWhhbGZILCAteSk7IHYgPD0gTWF0aC5taW4oaGFsZkgsIHRoaXMuaGVpZ2h0IC0gMSAtIHkpOyB2KyspXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0KHggKyB1LCB5ICsgdiwgYyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERyYXcgYSByZWd1bGFyIHBvbHlnb24gb2YgY29sb3IgYyBpbnNjcmliZWQgaW4gdGhlIGNpcmNsZSBjZW50ZXJlZCBhdCB4LCB5IHdpdGggcmFkaXVzIHIsIG9yaWVudGVkIHdpdGggYW5nbGUgYVxyXG4gICAgcG9seSh4LCB5LCBzLCByLCBhLCBjKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFBvaW50ICh1LCB2KSBpcyBvbiB0aGUgcGxhbmUgaWYgYXUgKyBidiArIGMgPSAwXHJcbiAgICAgICAgLy8gUGxhbmVzIGFyZSB0aGUgaW5maW5pdGUgbGluZXMgdGhhdCB0aGUgZWRnZXMgb2YgdGhlIHBvbHlnb24gbGllIG9uXHJcbiAgICAgICAgbGV0IHBsYW5lcyA9IG5ldyBBcnJheShzKTtcclxuICAgICAgICBsZXQgcklubmVyID0gciAqIE1hdGguY29zKE1hdGguUEkgLyBzKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHM7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBhbmdsZSA9IGkgKiAyICogTWF0aC5QSSAvIHMgKyBhO1xyXG4gICAgICAgICAgICBsZXQgY29zID0gTWF0aC5jb3MoYW5nbGUpO1xyXG4gICAgICAgICAgICBsZXQgc2luID0gTWF0aC5zaW4oYW5nbGUpO1xyXG4gICAgICAgICAgICBwbGFuZXNbaV0gPSB7YTogY29zLCBiOiBzaW4sIGM6IC1jb3MgKiB4IC0geSAqIHNpbiAtIHJJbm5lcn07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmNpcmNsZWYoeCwgeSwgciwgKHUsIHYpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHM7IGkrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IHBsYW5lID0gcGxhbmVzW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKHBsYW5lLmEgKiB1ICsgcGxhbmUuYiAqIHYgKyBwbGFuZS5jID4gMClcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5zZXQodSwgdiwgYyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIERyYXcgYSAxLXBpeGVsIGxpbmUgb2YgY29sb3IgYywgZnJvbSB0aGUgY2VudGVyIG9mICh4LCB5KSB0byB0aGUgY2VudGVyIG9mIChleCwgZXkpIG9yIHVudGlsIGl0IHJlYWNoZXMgcCBwaXhlbHMuXHJcbiAgICBsaW5lKHgsIHksIGV4LCBleSwgcCwgYywgYm9hcmQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc3QgY2xhbXAgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmxpbmVmKHgsIHksIGV4LCBleSwgY2xhbXAsICh1LCB2KSA9PiBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0KHUsIHYsIGMpO1xyXG4gICAgICAgICAgICBpZiAoLS1wID09IDApXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRHJhdyBhIGNpcmN1bGFyIGJydXNoIG9mIHJhZGl1cyByIGFuZCBjb2xvciBjIGFsb25nIHRoZSBsaW5lIGZyb20gKHgsIHkpIHRvIChleCwgZXkpLCB1bnRpbCB0aGUgZW5kIGlzIHJlYWNoZWQgb3IgdGhlIG51bWJlciBvZiBuZXdseSBzZXQgcGl4ZWxzIHJlYWNoZXMgcC5cclxuICAgIHBhaW50KHgsIHksIGV4LCBleSwgciwgcCwgYywgYm9hcmQpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc3QgY2xhbXAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMubGluZWYoeCwgeSwgZXgsIGV5LCBjbGFtcCwgKHUsIHYpID0+IFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5jaXJjbGVmKHUsIHYsIHIsICh1LCB2KSA9PlxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5nZXQodSwgdikgIT0gYylcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldCh1LCB2LCBjKTtcclxuICAgICAgICAgICAgICAgICAgICBwLS07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAocCA8PSAwKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiBwO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBEcmF3IGEgY3Jvc3NoYWlyY2VudGVyZWQgYXQgKHgsIHkpIHdpdGggcmFkaXVzIHIgYW5kIGNvbG9yIGNcclxuICAgIGNyb3NzaGFpcih4LCB5LCByLCBjKVxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IHUgPSBNYXRoLm1heCgtciwgLXgpOyB1IDw9IE1hdGgubWluKHIsIHRoaXMud2lkdGggLSAxIC0geCk7IHUrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0KHggKyB1LCB5LCBjKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgdiA9IE1hdGgubWF4KC1yLCAteSk7IHYgPD0gTWF0aC5taW4ociwgdGhpcy5oZWlnaHQgLSAxIC0geSk7IHYrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0KHgsIHkgKyB2LCBjKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ29waWVzIHRoZSBjb250aW51b3VzIHJlZ2lvbiBvZiBwaXhlbHMgd2l0aCBjb2xvciBjIGNvbnRhaW5pbmcgKHgsIHkpIGZyb20gc3JjLCBzZXR0aW5nIGFsbCBvdGhlciBwaXhlbHMgdG8gb2ZmLlxyXG4gICAgLy8gQSBwaXhlbCBpcyByZWFjaGFibGUgZnJvbSBuZWlnaGJvcnMgaW4gdGhlIGZvdXIgY2FyZGluYWwgZGlyZWN0aW9ucy4gIElmIHRoaXMuZ2V0KHgsIHkpICE9IGMsIHRoZW4gdGhlIHJlZ2lvbiBpcyBlbXB0eS5cclxuICAgIGlzb2xhdGUoeCwgeSwgYywgb2ZmLCBzcmMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5jbGVhcihvZmYpO1xyXG4gICAgICAgIGlmIChzcmMuZ2V0KHgsIHkpICE9IGMpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgYSA9IFt7eDp4LCB5Onl9XTtcclxuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XHJcbiAgICAgICAgZnVuY3Rpb24gdmlzaXQodSwgdilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChzcmMuZ2V0KHUsIHYpID09IGMgJiYgc2VsZi5nZXQodSwgdikgPT0gb2ZmKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBhLnB1c2goe3g6dSwgeTp2fSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHdoaWxlIChhLmxlbmd0aClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBwb2ludCA9IGEucG9wKCk7XHJcbiAgICAgICAgICAgIGxldCB1ID0gcG9pbnQueDtcclxuICAgICAgICAgICAgbGV0IHYgPSBwb2ludC55O1xyXG4gICAgICAgICAgICB0aGlzLnNldCh1LCB2LCBjKTtcclxuXHJcbiAgICAgICAgICAgIHZpc2l0KHUgLSAxLCB2KTtcclxuICAgICAgICAgICAgdmlzaXQodSArIDEsIHYpO1xyXG4gICAgICAgICAgICB2aXNpdCh1LCB2IC0gMSk7XHJcbiAgICAgICAgICAgIHZpc2l0KHUsIHYgKyAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2V0cyBldmVyeSBwaXhlbCB0byBjb2xvciBjIHRoYXQgaXMgd2l0aGluIHIgcGl4ZWxzIG9mIHRoZSBjb250aW51b3VzIHJlZ2lvbiBvZiBjb2xvciBjIGNvbnRhaW5pbmcgKHgsIHkpLlxyXG4gICAgLy8gVGhlIGNvbnRpbnVvdXMgcmVnaW9uIGlzIGRldGVybWluZWQgYnkgaXNvbGF0ZSgpLiAgVGhlIGRpc3RhbmNlcyBvZiBwaXhlbHMgZnJvbSB0aGF0IHJlZ2lvbiBhcmUgZGV0ZXJtaW5lZCBieVxyXG4gICAgLy8gbW92ZW1lbnQgaW4gdGhlIDggY2FyZGluYWwgKyBvcmRpbmFsIGRpcmVjdGlvbnMsIGEgcm91Z2ggYXBwcm94aW1hdGlvbiBvZiBldWNsaWRlYW4gZGlzdGFuY2UuXHJcbiAgICBmbG9vZCh4LCB5LCByLCBjKVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmdldCh4LCB5KSAhPSBjKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgYm9hcmQgd2l0aCB0aGUgaXNvbGF0ZWQgcmVnaW9uXHJcbiAgICAgICAgbGV0IG9mZiA9IGMgKyAxOyAvLyBqdXN0IG5lZWQgYW55IHZhbHVlIG90aGVyIHRoYW4gY1xyXG4gICAgICAgIGxldCBpc29Cb2FyZCA9IG5ldyBCb2FyZCh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgaXNvQm9hcmQuaXNvbGF0ZSh4LCB5LCBjLCBvZmYsIHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgYSBib2FyZCB0byBkcmF3IHRoZSBmbG9vZCBmaWxsIHRvLCBpbml0aWFsbHkgYmxhbmtcclxuICAgICAgICBsZXQgZmxvb2RCb2FyZCA9IG5ldyBCb2FyZCh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgZmxvb2RCb2FyZC5jbGVhcihvZmYpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFF1ZXVlIGZvciBkaWprc3RyYSdzIGFsZ29yaXRobSBcclxuICAgICAgICBsZXQgcXVldWUgPSBuZXcgUHJpb3JpdHlRdWV1ZSh7IGNvbXBhcmF0b3I6IGZ1bmN0aW9uKGEsIGIpIHsgcmV0dXJuIGEuY29zdCAtIGIuY29zdDsgfX0pOyAvLyBsb3dlciBjb3N0IC0+IGhpZ2hlciBwcmlvcml0eVxyXG4gICAgICAgIHF1ZXVlLnF1ZXVlKHt4OngsIHk6eSwgY29zdDowfSk7XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIHZpc2l0KHUsIHYsIGNvc3QpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoZmxvb2RCb2FyZC5nZXQodSwgdikgPT0gb2ZmKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNvQm9hcmQuZ2V0KHUsIHYpID09IGMpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29zdCA9IDA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoY29zdCA8PSByKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHF1ZXVlLnF1ZXVlKHt4OnUsIHk6diwgY29zdDpjb3N0fSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBzcXJ0MiA9IE1hdGguc3FydCgyKTtcclxuICAgICAgICB3aGlsZSAocXVldWUubGVuZ3RoKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGl0ZW0gPSBxdWV1ZS5kZXF1ZXVlKCk7XHJcbiAgICAgICAgICAgIGxldCB1ID0gaXRlbS54O1xyXG4gICAgICAgICAgICBsZXQgdiA9IGl0ZW0ueTtcclxuICAgICAgICAgICAgbGV0IGNvc3QgPSBpdGVtLmNvc3Q7XHJcblxyXG4gICAgICAgICAgICBpZiAoZmxvb2RCb2FyZC5nZXQodSwgdikgPT0gYylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGZsb29kQm9hcmQuc2V0KHUsIHYsIGMpO1xyXG4gICAgICAgICAgICB2aXNpdCh1ICsgMSwgdiArIDAsIGNvc3QgKyAxKTtcclxuICAgICAgICAgICAgdmlzaXQodSArIDEsIHYgKyAxLCBjb3N0ICsgc3FydDIpO1xyXG4gICAgICAgICAgICB2aXNpdCh1ICsgMCwgdiArIDEsIGNvc3QgKyAxKTtcclxuICAgICAgICAgICAgdmlzaXQodSAtIDEsIHYgKyAxLCBjb3N0ICsgc3FydDIpO1xyXG4gICAgICAgICAgICB2aXNpdCh1IC0gMSwgdiArIDAsIGNvc3QgKyAxKTtcclxuICAgICAgICAgICAgdmlzaXQodSAtIDEsIHYgLSAxLCBjb3N0ICsgc3FydDIpO1xyXG4gICAgICAgICAgICB2aXNpdCh1ICsgMCwgdiAtIDEsIGNvc3QgKyAxKTtcclxuICAgICAgICAgICAgdmlzaXQodSArIDEsIHYgLSAxLCBjb3N0ICsgc3FydDIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ29weSB0aGUgZmxvb2RlZCBwaXhlbHMgdG8gdGhpc1xyXG4gICAgICAgIHRoaXMuYWRkKGZsb29kQm9hcmQsIGMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNldHMgcGl4ZWxzIG9uIHRoZSBib3JkZXJzIG9mIHJlZ2lvbnMgb2YgbWFzay1jb2xvcmVkIHBpeGVscyBvbiBib2FyZCB0byBvbiwgYW5kIGFsbCBvdGhlciBwaXhlbHMgdG8gb2ZmXHJcbiAgICBvdXRsaW5lKG1hc2ssIG9uLCBvZmYsIHNyYylcclxuICAgIHtcclxuICAgICAgICB0aGlzLm1hdGNoRGltZW5zaW9ucyhzcmMpO1xyXG4gICAgICAgIGZvciAobGV0IHUgPSAwOyB1IDwgdGhpcy53aWR0aDsgdSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgdiA9IDA7IHYgPCB0aGlzLmhlaWdodDsgdisrKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgYyA9IChzcmMuZ2V0KHUsIHYpID09IG1hc2sgJiYgKFxyXG4gICAgICAgICAgICAgICAgICAgIHNyYy5nZXQodSAtIDEsIHYpICE9IG1hc2sgfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgc3JjLmdldCh1ICsgMSwgdikgIT0gbWFzayB8fCBcclxuICAgICAgICAgICAgICAgICAgICBzcmMuZ2V0KHUsIHYgLSAxKSAhPSBtYXNrIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgIHNyYy5nZXQodSwgdiArIDEpICE9IG1hc2spKVxyXG4gICAgICAgICAgICAgICAgICAgID8gb24gOiBvZmY7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldCh1LCB2LCBjKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvL1xyXG4gICAgLy8gQ29tcG9zaXRpb25cclxuICAgIC8vXHJcbiAgICBcclxuICAgIC8vIFNldHMgZXZlcnkgcGl4ZWwgdG8gYy5cclxuICAgIGNsZWFyKGMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5hbGxmKChpKSA9PiB7IHRoaXMuZGF0YVtpXSA9IGM7IH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENvcGllcyBzcmMgaW50byB0aGlzLiAgU3JjIG11c3QgaGF2ZSB0aGUgc2FtZSBkaW1lbnNpb25zIGFzIHRoaXMuXHJcbiAgICBjb3B5KHNyYylcclxuICAgIHtcclxuICAgICAgICB0aGlzLm1hdGNoRGltZW5zaW9ucyhzcmMpO1xyXG4gICAgICAgIHRoaXMuYWxsZigoaSkgPT4geyB0aGlzLmRhdGFbaV0gPSBzcmMuZGF0YVtpXTsgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRm9yIGV2ZXJ5IHBpeGVsIG9mIHNyYyBzZXQgdG8gYywgc2V0cyB0aGUgc2FtZSBwaXhlbCBpbiB0aGlzIGJvYXJkIHRvIGMuICBTcmMgbXVzdCBoYXZlIHRoZSBzYW1lIGRpbWVuc2lvbnMgYXMgdGhpcy5cclxuICAgIGFkZChzcmMsIGMpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5tYXRjaERpbWVuc2lvbnMoc3JjKTtcclxuICAgICAgICB0aGlzLmFsbGYoKGkpID0+XHJcbiAgICAgICAgeyBcclxuICAgICAgICAgICAgaWYgKHNyYy5kYXRhW2ldID09IGMpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YVtpXSA9IGM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvL1xyXG4gICAgLy8gSGVscGVyc1xyXG4gICAgLy9cclxuXHJcbiAgICBtYXRjaERpbWVuc2lvbnMoYm9hcmQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMud2lkdGggIT0gYm9hcmQud2lkdGggJiYgdGhpcy5oZWlnaHQgIT0gYm9hcmQuaGVpZ2h0KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhyb3cgJ1RoZSBpbnB1dCBib2FyZCBoYXMgZGlmZmVyZW50IGRpbWVuc2lvbnMgdGhhbiB0aGlzIG9uZSc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vXHJcbiAgICAvLyBPdXRwdXRcclxuICAgIC8vXHJcblxyXG4gICAgLy8gUmV0dXJucyBhbiBhcnJheSB3aGVyZSB0aGUgaXRoIGVsZW1lbnQgaGFzIHRoZSBudW1iZXIgb2YgcGl4ZWxzIHdpdGggdmFsdWUgPSBpXHJcbiAgICBjb3VudChudW1WYWx1ZXMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGEgPSBBcnJheShudW1WYWx1ZXMpLmZpbGwoMCk7XHJcbiAgICAgICAgdGhpcy5hbGxmKChpKSA9PlxyXG4gICAgICAgIHsgXHJcbiAgICAgICAgICAgIGxldCB2YWx1ZUNvdW50ID0gYVt0aGlzLmRhdGFbaV1dO1xyXG4gICAgICAgICAgICBpZiAodmFsdWVDb3VudCA9PSBudWxsKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZUNvdW50ID0gMTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHZhbHVlQ291bnQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBhW3RoaXMuZGF0YVtpXV0gPSB2YWx1ZUNvdW50O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBhO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJldHVybnMgdGhlIGJ1ZmZlciBzaXplIHJlcXVpcmVkIHRvIHJlbmRlciB0aGlzLiAgKFNlZSBjb21tZW50cyBvbiByZW5kZXIoKSBmb3IgYnVmZmVyIGZvcm1hdCkuXHJcbiAgICBidWZmZXJTaXplKHNjYWxlKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFNjYWxlIGVhY2ggZGltZW5zaW9uLCB0aGVuIG11bHRpcGx5IGJ5IDQgYnl0ZXMgcGVyIHBpeGVsLlxyXG4gICAgICAgIHJldHVybiAodGhpcy53aWR0aCAqIHNjYWxlKSAqICh0aGlzLmhlaWdodCAqIHNjYWxlKSAqIDQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFJlbmRlciB0aGlzIHRvIGEgYnVmZmVyIHRoYXQgY2FuIGJlIHVwbG9hZGVkIHRvIGEgdGV4dHVyZS4gIElmIG5vIGJ1ZmZlciBpcyBwYXNzZWQgaW4sIGEgbmV3IG9uZSBvZiB0aGUgY29ycmVjdCBzaXplIGlzIGNyZWF0ZWQuXHJcbiAgICAvLyBSZXR1cm5zIHRoZSBidWZmZXIuXHJcbiAgICAvLyBzY2FsZTogcG9zaXRpdmUgaW50ZWdlciBwaXhlbCBtdWx0aXBsaWVyXHJcbiAgICAvLyBwYWxldHRlOiBtYXAgdmFsdWVzIGluIHRoaXMgdG8gW3IsIGcsIGIsIGFdLlxyXG4gICAgLy8gYnVmZmVyOiBVSW50OEFycmF5LiAgcigwLCAwKSwgZygwLCAwKSwgYigwLCAwKSwgYSgwLCAwKSwgcigxLCAwKSwgLi4uLCBhKHdpZHRoIC0gMSwgMCksIHIoMCwgMSksIC4uLlxyXG4gICAgcmVuZGVyKHNjYWxlLCBwYWxldHRlLCBidWZmZXIgPSBuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlclNpemUoc2NhbGUpKSlcclxuICAgIHtcclxuICAgICAgICBpZiAoYnVmZmVyLmxlbmd0aCAhPSB0aGlzLmJ1ZmZlclNpemUoc2NhbGUpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhyb3cgJ0luY29ycmVjdCBidWZmZXIgc2l6ZSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBwaXhlbCA9IDQ7XHJcbiAgICAgICAgbGV0IHBpdGNoID0gdGhpcy53aWR0aCAqIHBpeGVsICogc2NhbGU7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLndpZHRoOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRoaXMuaGVpZ2h0OyBqKyspXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBjb2xvciA9IHBhbGV0dGVbdGhpcy5nZXQoaSwgaildO1xyXG4gICAgICAgICAgICAgICAgbGV0IGsgPSBqICogcGl0Y2ggKiBzY2FsZSArIGkgKiBwaXhlbCAqIHNjYWxlO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgdSA9IDA7IHUgPCBzY2FsZTsgdSsrKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IHYgPSAwOyB2IDwgc2NhbGU7IHYrKylcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBsID0gayArIHBpeGVsICogdjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyW2xdID0gY29sb3JbMF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1ZmZlcltsICsgMV0gPSBjb2xvclsxXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVmZmVyW2wgKyAyXSA9IGNvbG9yWzJdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBidWZmZXJbbCArIDNdID0gY29sb3JbM107XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGsgKz0gcGl0Y2g7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBidWZmZXI7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQm9hcmQ7XHJcbiIsImNvbnN0IENhcmRUeXBlID0gcmVxdWlyZSgnLi9DYXJkVHlwZS5qcycpO1xyXG5jb25zdCBHYW1lID0gcmVxdWlyZSgnLi9nYW1lLmpzJyk7XHJcbmNvbnN0IEJvYXJkID0gcmVxdWlyZSgnLi9ib2FyZC5qcycpO1xyXG5jb25zdCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKTtcclxuXHJcbi8vIENvbnN0YW50c1xyXG5jb25zdCBzY2FsZSA9IDI7IC8vIFNjcmVlbiBwaXhlbHMgcGVyIGJvYXJkIHBpeGVsXHJcbmNvbnN0IGNvbG9ycyA9IFsgLy8gUGxheWVyIGNvbG9yc1xyXG4gICAgMHgzZDFkZWZmZiwgLy8gcGxheWVyIDAgcmdiYVxyXG4gICAgMHhlZDA3MzBmZiwgLy8gcGxheWVyIDEgcmdiYVxyXG4gICAgMHgyM2QxMDBmZiwgLy8gZXRjXHJcbiAgICAweGZmZDgwMGZmLFxyXG4gICAgMHg5MDI4Y2NmZixcclxuICAgIDB4ZmY3YzNhZmYsXHJcbiAgICAweGZmZmZmZmZmICAvLyBibGFua1xyXG5dO1xyXG5jb25zdCBtYXhQbGF5ZXJzID0gMjtcclxuXHJcbmxldCBjYXJkUGFsZXR0ZSA9IFtcclxuICAgIFsweDIyLCAweDIyLCAweDIyLCAweGZmXSxcclxuICAgIFsweGZmLCAweGZmLCAweGZmLCAweGZmXVxyXG5dXHJcblxyXG5jb25zdCBjYXJkV2lkdGggPSAxMDA7XHJcbmNvbnN0IGNhcmRIZWlnaHQgPSAxNTA7XHJcbmNvbnN0IHBsYXllckhlaWdodCA9IGNhcmRIZWlnaHQgKyAyMDtcclxuXHJcbi8vXHJcbi8vIEdsb2JhbCBoZWxwZXJzXHJcbi8vXHJcblxyXG5mdW5jdGlvbiBjYXJkTmFtZShjYXJkKVxyXG57XHJcbiAgICByZXR1cm4gKGNhcmQubmFtZSA9PSBudWxsID8gY2FyZC50eXBlIDogY2FyZC5uYW1lKTtcclxufVxyXG5cclxuLy8gUmVuZGVyIGEgYm9hcmQgdG8gYSBQSVhJIHRleHR1cmVcclxuZnVuY3Rpb24gcnR0KGJvYXJkLCBzY2FsZSwgcGFsZXR0ZSlcclxue1xyXG4gICAgbGV0IG9wdGlvbnMgPSB7d2lkdGg6IHNjYWxlICogYm9hcmQud2lkdGgsIGhlaWdodDogc2NhbGUgKiBib2FyZC5oZWlnaHR9O1xyXG4gICAgcmV0dXJuIFBJWEkuVGV4dHVyZS5mcm9tKG5ldyBQSVhJLnJlc291cmNlcy5CdWZmZXJSZXNvdXJjZShib2FyZC5yZW5kZXIoc2NhbGUsIHBhbGV0dGUpLCBvcHRpb25zKSk7XHJcbn1cclxuXHJcbi8vIFJldHVybnMgYSBCb2FyZCByZXByZXNlbnRpbmcgd2hhdCB0aGUgY2FyZCB3aWxsIGFsbG93IHRoZSBwbGF5ZXIgdG8gZHJhd1xyXG5mdW5jdGlvbiByZW5kZXJDYXJkKGNhcmQsIG9uLCBvZmYsIG1pblNpemUgPSAwKVxyXG57XHJcbiAgICAvLyBEZXRlcm1pbmUgdGhlIGRpbWVuc2lvbnMgcmVxdWlyZWRcclxuICAgIGxldCB3ID0gMDtcclxuICAgIGxldCBoID0gMDtcclxuICAgIHN3aXRjaCAoY2FyZC50eXBlKVxyXG4gICAge1xyXG4gICAgICAgIGNhc2UgQ2FyZFR5cGUuQ0lSQ0xFOlxyXG4gICAgICAgIGNhc2UgQ2FyZFR5cGUuUEFJTlQ6XHJcbiAgICAgICAgY2FzZSBDYXJkVHlwZS5QT0xZOlxyXG4gICAgICAgIGNhc2UgQ2FyZFR5cGUuRVJBU0VSOlxyXG4gICAgICAgICAgICB3ID0gTWF0aC5mbG9vcihjYXJkLnJhZGl1cykgKiAyICsgMTtcclxuICAgICAgICAgICAgaCA9IHc7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgQ2FyZFR5cGUuQk9YOlxyXG4gICAgICAgICAgICB3ID0gTWF0aC5mbG9vcihjYXJkLndpZHRoKTtcclxuICAgICAgICAgICAgaCA9IE1hdGguZmxvb3IoY2FyZC5oZWlnaHQpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB3ID0gbWluU2l6ZTtcclxuICAgICAgICAgICAgaCA9IG1pblNpemU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEVuZm9yY2UgbWluU2l6ZVxyXG4gICAgdyA9IE1hdGgubWF4KHcsIG1pblNpemUpO1xyXG4gICAgaCA9IE1hdGgubWF4KGgsIG1pblNpemUpO1xyXG4gICAgXHJcbiAgICBpZiAodyAlIDIgPT0gMCB8fCBoICUgMiA9PSAwKVxyXG4gICAge1xyXG4gICAgICAgIHRocm93ICd1bmV4cGVjdGVkIGV2ZW4gZGltZW5zaW9uJzsgLy8gdW5oYW5kbGVkIGFtYmlndWl0eSBpbiBjaG9vc2luZyB0aGUgbWlkZGxlIHBpeGVsXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBib2FyZCA9IG5ldyBCb2FyZCh3LCBoKTtcclxuICAgIGJvYXJkLmNsZWFyKG9mZik7XHJcbiAgICBsZXQgeCA9IE1hdGguZmxvb3IoKHcgLSAxKSAvIDIpO1xyXG4gICAgbGV0IHkgPSBNYXRoLmZsb29yKChoIC0gMSkgLyAyKTtcclxuXHJcbiAgICBzd2l0Y2ggKGNhcmQudHlwZSlcclxuICAgIHtcclxuICAgICAgICBjYXNlIENhcmRUeXBlLkNJUkNMRTpcclxuICAgICAgICBjYXNlIENhcmRUeXBlLlBBSU5UOlxyXG4gICAgICAgIGNhc2UgQ2FyZFR5cGUuRVJBU0VSOlxyXG4gICAgICAgICAgICBib2FyZC5jaXJjbGUoeCwgeSwgY2FyZC5yYWRpdXMsIG9uKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBDYXJkVHlwZS5CT1g6XHJcbiAgICAgICAgICAgIGJvYXJkLmJveCh4LCB5LCB3LCBoLCBvbik7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgQ2FyZFR5cGUuUE9MWTpcclxuICAgICAgICAgICAgYm9hcmQucG9seSh4LCB5LCBjYXJkLnNpZGVzLCBjYXJkLnJhZGl1cywgY2FyZC5hbmdsZSwgb24pO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gYm9hcmQ7XHJcbn1cclxuXHJcbmNsYXNzIENsaWVudFxyXG57XHJcbiAgICBjb25zdHJ1Y3RvcigpXHJcbiAgICB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0NsaWVudCgpISEhJyk7XHJcbiAgICB9XHJcblxyXG4gICAgYmVnaW4oc29ja2V0LCBwbGF5ZXJOYW1lcywgbG9jYWxQbGF5ZXJJZClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnNvY2tldCA9IHNvY2tldDtcclxuICAgICAgICB0aGlzLmxvY2FsUGxheWVySWQgPSBsb2NhbFBsYXllcklkO1xyXG5cclxuICAgICAgICAvL1xyXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgZ2FtZSBhbmQgbGlzdGVuIGZvciBpdHMgZXZlbnRzXHJcbiAgICAgICAgLy9cclxuXHJcbiAgICAgICAgbGV0IG51bVBsYXllcnMgPSBwbGF5ZXJOYW1lcy5sZW5ndGg7XHJcbiAgICAgICAgY29uc3Qgc2h1ZmZsZSA9IHRoaXMuaXNMb2NhbEdhbWUoKTtcclxuICAgICAgICBnYW1lID0gbmV3IEdhbWUobnVtUGxheWVycywgc2h1ZmZsZSk7XHJcblxyXG4gICAgICAgIGdhbWUub24oJ3VwZGF0ZUJvYXJkJywgKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGdhbWUuYm9hcmQucmVuZGVyKHNjYWxlLCB0aGlzLnBhbGV0dGUsIHRoaXMuYnVmZmVyKTtcclxuICAgICAgICAgICAgbGV0IGJvYXJkU2l6ZSA9IHNjYWxlICogZ2FtZS5zaXplO1xyXG4gICAgICAgICAgICBsZXQgb3B0aW9ucyA9IHt3aWR0aDogYm9hcmRTaXplLCBoZWlnaHQ6IGJvYXJkU2l6ZX07XHJcbiAgICAgICAgICAgIGxldCByZXNvdXJjZSA9IG5ldyBQSVhJLnJlc291cmNlcy5CdWZmZXJSZXNvdXJjZSh0aGlzLmJ1ZmZlciwgb3B0aW9ucyk7XHJcbiAgICAgICAgICAgIHRoaXMuYm9hcmRTcHJpdGUudGV4dHVyZSA9IFBJWEkuVGV4dHVyZS5mcm9tKHJlc291cmNlKTtcclxuICAgIFxyXG4gICAgICAgICAgICBsZXQgY291bnQgPSBnYW1lLmJvYXJkLmNvdW50KHRoaXMucGxheWVycy5sZW5ndGggKyAxKTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnBsYXllcnMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyc1tpXS5zZXRDb3VudChjb3VudFtpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZ2FtZS5vbignZGVhbCcsIChwbGF5ZXJJZCwgY2FyZElkKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJzW3BsYXllcklkXS5hZGRDYXJkKGNhcmRJZCwgdGhpcy5waWxlLngsIHRoaXMucGlsZS55KTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQaWxlKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGdhbWUub24oJ3BsYXknLCAocGxheWVySWQsIGNhcmRJZCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyc1twbGF5ZXJJZF0ucGxheShjYXJkSWQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBnYW1lLm9uKCdiZWdpblR1cm4nLCAocGxheWVySWQpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXJzW3BsYXllcklkXS5sb2NhbClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0dXMudGV4dCA9ICdZb3VyIHR1cm4gLSBwbGF5IGEgY2FyZCEnXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllcnNbcGxheWVySWRdLnNldEVuYWJsZWQodHJ1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXR1cy50ZXh0ID0gdGhpcy5wbGF5ZXJzW3BsYXllcklkXS5uYW1lICsgJ1xcJ3MgdHVybic7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSBhcHBcclxuICAgICAgICB0aGlzLmFwcCA9IG5ldyBQSVhJLkFwcGxpY2F0aW9uKHtcclxuICAgICAgICAgICAgd2lkdGg6IHdpbmRvdy5pbm5lcldpZHRoLCBoZWlnaHQ6IHdpbmRvdy5pbm5lckhlaWdodCwgYmFja2dyb3VuZENvbG9yOiAweGVlZWVlZSwgcmVzb2x1dGlvbjogd2luZG93LmRldmljZVBpeGVsUmF0aW8gfHwgMSwgYW50aWFsaWFzOiB0cnVlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmFwcC52aWV3KTtcclxuXHJcbiAgICAgICAgdGhpcy5hcHAuc3RhZ2UuaW50ZXJhY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYXBwLnN0YWdlLm9uKCdtb3VzZW1vdmUnLCB0aGlzLm1vdXNlTW92ZSwgdGhpcyk7XHJcbiAgICAgICAgdGhpcy5hcHAudGlja2VyLmFkZCh0aGlzLnVwZGF0ZSwgdGhpcyk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgY29sb3IgcGFsZXR0ZXMgICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIHJnYmEoY29sb3IpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm4gW2NvbG9yID4+IDI0LCAoY29sb3IgPj4gMTYpICYgMHhmZiwgKGNvbG9yID4+IDgpICYgMHhmZiwgY29sb3IgJiAweGZmXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wYWxldHRlID0gbmV3IEFycmF5KG51bVBsYXllcnMgKyAxKTtcclxuICAgICAgICB0aGlzLnByZXZpZXdQYWxldHRlID0gbmV3IEFycmF5KHRoaXMucGFsZXR0ZS5sZW5ndGgpO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtUGxheWVyczsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5wYWxldHRlW2ldID0gcmdiYShjb2xvcnNbaV0pO1xyXG4gICAgICAgICAgICB0aGlzLnByZXZpZXdQYWxldHRlW2ldID0gcmdiYSgweGFhYWFhYWZmKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wYWxldHRlW251bVBsYXllcnNdID0gcmdiYShjb2xvcnNbY29sb3JzLmxlbmd0aCAtIDFdKTtcclxuICAgICAgICB0aGlzLnByZXZpZXdQYWxldHRlW251bVBsYXllcnNdID0gcmdiYSgwKTtcclxuXHJcbiAgICAgICAgLy9cclxuICAgICAgICAvLyBCb2FyZCBkaXNwbGF5XHJcbiAgICAgICAgLy9cclxuXHJcbiAgICAgICAgLy8gQ29udGFpbmVyIGZvciB0aGUgYm9hcmQgYW5kIGV2ZXJ5dGhpbmcgdGllZCB0byBpdHMgcG9zaXRpb25cclxuICAgICAgICB0aGlzLmJvYXJkQ29udGFpbmVyID0gbmV3IFBJWEkuQ29udGFpbmVyKCk7XHJcbiAgICAgICAgdGhpcy5hcHAuc3RhZ2UuYWRkQ2hpbGQodGhpcy5ib2FyZENvbnRhaW5lcik7XHJcblxyXG4gICAgICAgIC8vIEdhbWUgYm9hcmQgZGlzcGxheVxyXG4gICAgICAgIGxldCBib2FyZFNpemUgPSBnYW1lLnNpemUgKiAyO1xyXG4gICAgICAgIHRoaXMuYnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYm9hcmRTaXplICogYm9hcmRTaXplICogNCk7XHJcbiAgICAgICAgdGhpcy5ib2FyZEdyYXBoaWNzID0gbmV3IFBJWEkuR3JhcGhpY3MoKTtcclxuICAgICAgICB0aGlzLmJvYXJkQ29udGFpbmVyLmFkZENoaWxkKHRoaXMuYm9hcmRHcmFwaGljcyk7XHJcbiAgICAgICAgdGhpcy5ib2FyZFNwcml0ZSA9IG5ldyBQSVhJLlNwcml0ZSgpO1xyXG4gICAgICAgIHRoaXMuYm9hcmRTcHJpdGUuaW50ZXJhY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYm9hcmRDb250YWluZXIuYWRkQ2hpbGQodGhpcy5ib2FyZFNwcml0ZSk7XHJcblxyXG4gICAgICAgIC8vIEJvYXJkIG92ZXJsYXkgZm9yIHByZXZpZXcgb2YgcGxheWVyIGFjdGlvbnNcclxuICAgICAgICB0aGlzLm92ZXJsYXlCdWZmZXIgPSBuZXcgVWludDhBcnJheShib2FyZFNpemUgKiBib2FyZFNpemUgKiA0KTtcclxuICAgICAgICB0aGlzLm92ZXJsYXlCb2FyZCA9IG5ldyBCb2FyZChnYW1lLnNpemUsIGdhbWUuc2l6ZSk7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5U3ByaXRlID0gbmV3IFBJWEkuU3ByaXRlKCk7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5U3ByaXRlLnZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmJvYXJkQ29udGFpbmVyLmFkZENoaWxkKHRoaXMub3ZlcmxheVNwcml0ZSk7XHJcblxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgLy8gTW91c2UgaW50ZXJhY3Rpb24gc2V0dXBcclxuICAgICAgICAvL1xyXG5cclxuICAgICAgICAvLyBDb2xsZWN0aW9uIG9mIG1vdXNlIG1vdmVzIHNpbmNlIHRoZSBsYXN0IHVwZGF0ZVxyXG4gICAgICAgIHRoaXMubW91c2VNb3ZlcyA9IFtdO1xyXG5cclxuICAgICAgICB0aGlzLm9uQm9hcmRNb3VzZVVwID0gbnVsbDtcclxuICAgICAgICB0aGlzLmJvYXJkU3ByaXRlLm9uKCdtb3VzZXVwJywgKGV2ZW50KSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBvaW50ID0gZXZlbnQuZGF0YS5nZXRMb2NhbFBvc2l0aW9uKHRoaXMuYm9hcmRTcHJpdGUpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5vbkJvYXJkTW91c2VVcClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vbkJvYXJkTW91c2VVcChNYXRoLmZsb29yKHBvaW50LnggLyAyKSwgTWF0aC5mbG9vcihwb2ludC55IC8gMikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5vbkJvYXJkTW91c2VEb3duID0gbnVsbDtcclxuICAgICAgICB0aGlzLmJvYXJkU3ByaXRlLm9uKCdtb3VzZWRvd24nLCAoZXZlbnQpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgcG9pbnQgPSBldmVudC5kYXRhLmdldExvY2FsUG9zaXRpb24odGhpcy5ib2FyZFNwcml0ZSk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uQm9hcmRNb3VzZURvd24pXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25Cb2FyZE1vdXNlRG93bihNYXRoLmZsb29yKHBvaW50LnggLyAyKSwgTWF0aC5mbG9vcihwb2ludC55IC8gMikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgZHJhdyBwaWxlXHJcbiAgICAgICAgdGhpcy5waWxlID0gbmV3IFBJWEkuQ29udGFpbmVyO1xyXG4gICAgICAgIHRoaXMucGlsZS54ID0gMTA7XHJcbiAgICAgICAgdGhpcy5waWxlLnkgPSAxMDtcclxuICAgICAgICB0aGlzLmFwcC5zdGFnZS5hZGRDaGlsZCh0aGlzLnBpbGUpO1xyXG5cclxuICAgICAgICB0aGlzLnBpbGVDYXJkID0gbmV3IENDYXJkKC0xKTtcclxuICAgICAgICB0aGlzLnBpbGUuYWRkQ2hpbGQodGhpcy5waWxlQ2FyZC5ncmFwaGljcyk7XHJcblxyXG4gICAgICAgIHRoaXMucGlsZVRleHQgPSBuZXcgUElYSS5UZXh0KCcnLCB7Zm9udEZhbWlseSA6ICdBcmlhbCcsIGZvbnRTaXplOiAyNCwgZmlsbCA6IDB4MDAwMDAwfSk7XHJcbiAgICAgICAgdGhpcy5waWxlLmFkZENoaWxkKHRoaXMucGlsZVRleHQpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlUGlsZSgpO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgdGhlIHN0YXR1cyBiYXJcclxuICAgICAgICB0aGlzLnN0YXR1cyA9IG5ldyBQSVhJLlRleHQoJycsIHtmb250RmFtaWx5IDogJ0FyaWFsJywgZm9udFNpemU6IDI0LCBmaWxsIDogMHgwMDAwMDB9KTtcclxuICAgICAgICB0aGlzLmFwcC5zdGFnZS5hZGRDaGlsZCh0aGlzLnN0YXR1cyk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBwbGF5ZXJzXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJzID0gbmV3IEFycmF5KG51bVBsYXllcnMpO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtUGxheWVyczsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IG5hbWUgPSBwbGF5ZXJOYW1lc1tpXTtcclxuICAgICAgICAgICAgbGV0IGxvY2FsID0gKHRoaXMuaXNMb2NhbEdhbWUoKSB8fCBpID09IGxvY2FsUGxheWVySWQpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllcnNbaV0gPSBuZXcgQ1BsYXllcihpLCBuYW1lLCBsb2NhbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBCZWdpbiB0aGUgZ2FtZVxyXG4gICAgICAgIGdhbWUuYmVnaW4oKTtcclxuXHJcbiAgICAgICAgLy8gTGlzdGVuIGZvciBldmVudHMgZnJvbSB0aGUgc2VydmVyXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzTG9jYWxHYW1lKCkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBDYXJkIHJldmVhbGVkXHJcbiAgICAgICAgICAgIGxldCBvblJldmVhbCA9IChjYXJkSWQsIGRlY2tJZCkgPT4geyBnYW1lLnJldmVhbChjYXJkSWQsIGRlY2tJZCk7IH1cclxuICAgICAgICAgICAgc29ja2V0Lm9uKCdyZXZlYWwnLCBvblJldmVhbCk7XHJcblxyXG4gICAgICAgICAgICAvLyBBbm90aGVyIHBsYXllciBwbGF5ZWQgYSBjYXJkXHJcbiAgICAgICAgICAgIHNvY2tldC5vbigncGxheScsIChhY3Rpb24pID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIC8vIFJlYWQgYW55IHJldmVhbHMgYXR0YWNoZWQgdG8gdGhlIGFjdGlvblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgcmV2ZWFsIG9mIGFjdGlvbi5yZXZlYWxzKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIG9uUmV2ZWFsKHJldmVhbC5jYXJkSWQsIHJldmVhbC5kZWNrSWQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5IHRoZSBhY3Rpb25cclxuICAgICAgICAgICAgICAgIGdhbWUucGxheShhY3Rpb24pO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFub3RoZXIgcGxheWVyIGxlZnQgdGhlIGdhbWVcclxuICAgICAgICAgICAgc29ja2V0Lm9uKCdyZW1vdmVQbGF5ZXInLCAocGxheWVySWQpID0+XHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGdhbWUucmVtb3ZlUGxheWVyKHBsYXllcklkKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBOb3RpZnkgdGhlIHNlcnZlciB0aGF0IHRoaXMgY2xpZW50IGlzIHJlYWR5IHRvIHJlY2VpdmUgbWVzc2FnZXNcclxuICAgICAgICAgICAgc29ja2V0LmVtaXQoJ3JlYWR5Jyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBMaXN0ZW4gZm9yIHdpbmRvdyByZXNpemVzXHJcbiAgICAgICAgd2luZG93Lm9ucmVzaXplID0gKCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB3ID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgICAgICAgIGxldCBoID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgICAgICB0aGlzLmFwcC5yZXNpemUodywgaCk7XHJcbiAgICAgICAgICAgIHRoaXMuYXBwLnZpZXcuc3R5bGUud2lkdGggPSB3O1xyXG4gICAgICAgICAgICB0aGlzLmFwcC52aWV3LnN0eWxlLmhlaWdodCA9IGg7XHJcbiAgICAgICAgICAgIHRoaXMuYXBwLnJlbmRlcmVyLnJlc2l6ZSh3LCBoKTtcclxuICAgICAgICAgICAgY2xpZW50LmxheW91dCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB3aW5kb3cub25yZXNpemUoKTsgLy8gcGl4aSBzY2FsZXMgaW5jb3JyZWN0bHkgd2hlbiByZXMgIT0gMSwgcmVzaXplIG5vdyB0byBmaXggaXRcclxuICAgIH1cclxuICAgIFxyXG4gICAgaXNMb2NhbEdhbWUoKSB7IHJldHVybiAodGhpcy5sb2NhbFBsYXllcklkID09IC0xKTsgfVxyXG5cclxuICAgIGxheW91dCgpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5ib2FyZENvbnRhaW5lci54ID0gMTA7XHJcbiAgICAgICAgdGhpcy5ib2FyZENvbnRhaW5lci55ID0gTWF0aC5mbG9vcigod2luZG93LmlubmVySGVpZ2h0IC0gdGhpcy5ib2FyZENvbnRhaW5lci5oZWlnaHQpIC8gMik7XHJcblxyXG4gICAgICAgIGxldCBwbGF5ZXJYID0gdGhpcy5ib2FyZENvbnRhaW5lci54ICsgdGhpcy5ib2FyZENvbnRhaW5lci53aWR0aCArIDEwO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wbGF5ZXJzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJzW2ldLmNvbnRhaW5lci54ID0gcGxheWVyWDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJzW2ldLmNvbnRhaW5lci55ID0gMTAgKyBpICogMjAwICsgMTA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnN0YXR1cy54ID0gMTA7XHJcbiAgICAgICAgdGhpcy5zdGF0dXMueSA9IHRoaXMuYm9hcmRDb250YWluZXIueSArIHRoaXMuYm9hcmRDb250YWluZXIuaGVpZ2h0ICsgMTA7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0Q3Vyc29yU3R5bGUoY3Vyc29yU3R5bGUpXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5jdXJzb3IgPSBjdXJzb3JTdHlsZTtcclxuICAgICAgICB0aGlzLmFwcC5yZW5kZXJlci5wbHVnaW5zLmludGVyYWN0aW9uLmN1cnNvclN0eWxlcy5kZWZhdWx0ID0gY3Vyc29yU3R5bGU7XHJcbiAgICAgICAgdGhpcy5hcHAucmVuZGVyZXIucGx1Z2lucy5pbnRlcmFjdGlvbi5jdXJzb3JTdHlsZXMuaG92ZXIgPSBjdXJzb3JTdHlsZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVQaWxlKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnBpbGVUZXh0LnRleHQgPSBnYW1lLnBpbGUubGVuZ3RoICsgJyc7XHJcbiAgICAgICAgdGhpcy5waWxlVGV4dC54ID0gdGhpcy5waWxlQ2FyZC5ncmFwaGljcy53aWR0aCAtIHRoaXMucGlsZVRleHQud2lkdGggLSAxMDtcclxuICAgICAgICB0aGlzLnBpbGVUZXh0LnkgPSAxMDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGEpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMubW91c2VNb3Zlcy5sZW5ndGggPT0gMClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBwb2ludCA9IHRoaXMubW91c2VNb3Zlc1t0aGlzLm1vdXNlTW92ZXMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgdGhpcy5sYXN0UG9pbnQgPSBwb2ludDtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuY3Vyc29yICE9IG51bGwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUN1cnNvcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMucHJldmlldylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjYXJkID0gZ2FtZS5kZWNrW2dhbWUuc2h1ZmZsZVt0aGlzLmN1cnJlbnRDYXJkSWRdXTtcclxuICAgICAgICAgICAgc3dpdGNoIChjYXJkLnR5cGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgQ2FyZFR5cGUuTElORTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm92ZXJsYXlCb2FyZC5jbGVhcih0aGlzLnByZXZpZXdQYWxldHRlLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3ZlcmxheUJvYXJkLmxpbmUodGhpcy54UGl2b3QsIHRoaXMueVBpdm90LCBwb2ludC54LCBwb2ludC55LCBjYXJkLnBpeGVscywgMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIENhcmRUeXBlLkZJTEw6XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGlzb0JvYXJkID0gbmV3IEJvYXJkKHRoaXMub3ZlcmxheUJvYXJkLndpZHRoLCB0aGlzLm92ZXJsYXlCb2FyZC5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlzb0JvYXJkLmlzb2xhdGUocG9pbnQueCwgcG9pbnQueSwgZ2FtZS5jdXJyZW50UGxheWVyLCB0aGlzLnBhbGV0dGUubGVuZ3RoIC0gMSwgZ2FtZS5ib2FyZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vdmVybGF5Qm9hcmQub3V0bGluZShnYW1lLmN1cnJlbnRQbGF5ZXIsIDAsIHRoaXMucHJldmlld1BhbGV0dGUubGVuZ3RoIC0gMSwgaXNvQm9hcmQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5QQUlOVDpcclxuICAgICAgICAgICAgICAgICAgICBsZXQgbGFzdCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm1vdXNlTW92ZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbmV4dCA9IHRoaXMubW91c2VNb3Zlc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGFpbnRQb2ludHMubGVuZ3RoID09IDApXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3QgPSBuZXh0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdCA9IHRoaXMucGFpbnRQb2ludHNbdGhpcy5wYWludFBvaW50cy5sZW5ndGggLSAxXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0LnggPT0gbGFzdC54ICYmIG5leHQueSA9PSBsYXN0LnkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYWludFBvaW50cy5wdXNoKG5leHQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcGFpbnRQaXhlbHMgPSB0aGlzLm92ZXJsYXlCb2FyZC5wYWludChsYXN0LngsIGxhc3QueSwgbmV4dC54LCBuZXh0LnksIGNhcmQucmFkaXVzLCB0aGlzLnBhaW50UGl4ZWxzLCBnYW1lLmN1cnJlbnRQbGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhaW50UGl4ZWxzID0gTWF0aC5taW4ocGFpbnRQaXhlbHMsIHRoaXMucGFpbnRQaXhlbHMgLSAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGFpbnRQaXhlbHMgPD0gMClcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmRQYWludCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXR1cy50ZXh0ID0gJ1BhaW50aW5nICgnICsgdGhpcy5wYWludFBpeGVscyArICdweCBsZWZ0KSc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdwcmV2aWV3IHVuZXhwZWN0ZWQgY2FyZCB0eXBlJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZU92ZXJsYXlCb2FyZCgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5tb3VzZU1vdmVzLmxlbmd0aCA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheUNhcmQoY2FyZElkKVxyXG4gICAge1xyXG4gICAgICAgIC8vIENyZWF0ZSBhIGN1cnNvciBmb3IgdGhlIGNob3NlbiBjYXJkXHJcbiAgICAgICAgbGV0IGNhcmQgPSBnYW1lLmdldENhcmQoY2FyZElkKTtcclxuICAgICAgICB0aGlzLnNldEN1cnNvcihjYXJkKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBVcGRhdGUgdGhlIHN0YXR1c1xyXG4gICAgICAgIHRoaXMuc3RhdHVzLnRleHQgPSAnUGxheWluZyAnICsgY2FyZE5hbWUoY2FyZCkgKyAnIC0gY2xpY2sgb24gdGhlIGJvYXJkIHRvIGRyYXcsIHN0YXJ0aW5nIG9uIHlvdXIgb3duIGNvbG9yISc7XHJcblxyXG4gICAgICAgIC8vIFNldCB0aGUgY2FyZCdzIGV2ZW50IGxpc3RlbmVyXHJcbiAgICAgICAgc3dpdGNoIChjYXJkLnR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBTaW5nbGUtY2xpY2sgY2FyZHMgd2l0aCBubyBzcGVjaWFsIHZpc3VhbGl6YXRpb25cclxuICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5DSVJDTEU6XHJcbiAgICAgICAgICAgIGNhc2UgQ2FyZFR5cGUuQk9YOlxyXG4gICAgICAgICAgICBjYXNlIENhcmRUeXBlLlBPTFk6XHJcbiAgICAgICAgICAgIGNhc2UgQ2FyZFR5cGUuRVJBU0VSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5vbkJvYXJkTW91c2VEb3duID0gKHgsIHkpID0+XHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFnYW1lLnN0YXJ0T2soeCwgeSkpXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uQm9hcmRNb3VzZURvd24gPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheUFjdGlvbih7Y2FyZElkOmNhcmRJZCwgeDp4LCB5Onl9KTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsZWFyQ3Vyc29yKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIC8vIExpbmUgLSB0d28gY2xpY2tzIHdpdGggbGluZSB2aXN1YWxpemF0aW9uIGFmdGVyIHRoZSBmaXJzdCBjbGlja1xyXG4gICAgICAgICAgICBjYXNlIENhcmRUeXBlLkxJTkU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uQm9hcmRNb3VzZURvd24gPSAoeCwgeSkgPT5cclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWdhbWUuc3RhcnRPayh4LCB5KSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIDFzdCBwb2ludFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMueFBpdm90ID0geDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnlQaXZvdCA9IHk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iZWdpblByZXZpZXcoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uQm9hcmRNb3VzZURvd24gPSAoeCwgeSkgPT5cclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIDJuZCBwb2ludFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9uQm9hcmRNb3VzZURvd24gPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlBY3Rpb24oe2NhcmRJZDpjYXJkSWQsIHg6dGhpcy54UGl2b3QsIHk6dGhpcy55UGl2b3QsIHgyOngsIHkyOnl9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmRQcmV2aWV3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gUGFpbnQgLSB0d28gY2xpY2tzIHdpdGggdmlzdWFsaXphdGlvbiBhZnRlciB0aGUgZmlyc3QgY2xpY2tcclxuICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5QQUlOVDpcclxuICAgICAgICAgICAgICAgIHRoaXMub25Cb2FyZE1vdXNlRG93biA9ICh4LCB5KSA9PlxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghZ2FtZS5zdGFydE9rKHgsIHkpKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyBTZXR1cCB0aGUgcGFpbnQgdmlzdWFsaXphdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmVnaW5QcmV2aWV3KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYWludFBvaW50cyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubW91c2VNb3ZlcyA9IFt7eDp4LCB5Onl9XTsgLy8gRmFrZSBhIG1vdXNlIG1vdmUgZXZlbnQgdG8gZHJhdyBpbiB0aGUgc3RhcnQgcG9zaXRpb25cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhaW50UGl4ZWxzID0gY2FyZC5waXhlbHM7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vbkJvYXJkTW91c2VEb3duID0gKHgsIHkpID0+XHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZFBhaW50KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgLy8gRmlsbCAtIHNpbmdsZSBjbGljayB3aXRoIHZpc3VhbGl6YXRpb24gb2YgdGhlIHJhbmdlIHRoYXQgd2lsbCBiZSBleHRlbmRlZFxyXG4gICAgICAgICAgICBjYXNlIENhcmRUeXBlLkZJTEw6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJlZ2luUHJldmlldygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vbkJvYXJkTW91c2VEb3duID0gKHgsIHkpID0+XHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFnYW1lLnN0YXJ0T2soeCwgeSkpXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25Cb2FyZE1vdXNlRG93biA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5QWN0aW9uKHtjYXJkSWQ6Y2FyZElkLCB4OngsIHk6eX0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW5kUHJldmlldygpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNhdmUgdGhlIGNhcmQgZm9yIGFueSB2aXN1YWxpemF0aW9uIGxvZ2ljIGluIHVwZGF0ZSgpXHJcbiAgICAgICAgdGhpcy5jdXJyZW50Q2FyZElkID0gY2FyZElkO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlBY3Rpb24oYWN0aW9uKVxyXG4gICAge1xyXG4gICAgICAgIC8vIFRlbGwgYm90aCB0aGUgbG9jYWwgYW5kIHJlbW92ZSBnYW1lIGFib3V0IHRoZSBhY3Rpb25cclxuICAgICAgICBnYW1lLnBsYXkoYWN0aW9uKTtcclxuICAgICAgICBpZiAoIXRoaXMuaXNMb2NhbEdhbWUoKSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LmVtaXQoJ3BsYXknLCBhY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzZXRDdXJzb3IoY2FyZClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmNsZWFyQ3Vyc29yKCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgdGhlIGNhcmQncyBzaGFwZSB0byBhIGJvYXJkLiAgKFRoaXMgd2lsbCByZXR1cm4gYW4gZW1wdHkgYm9hcmQgaWYgdGhlcmUgaXMgbm8gc2hhcGUpLlxyXG4gICAgICAgIGNvbnN0IGNyb3NzUmFkaXVzID0gMztcclxuICAgICAgICBjb25zdCBjcm9zc1NpemUgPSAyICogY3Jvc3NSYWRpdXMgKyAxO1xyXG4gICAgICAgIGxldCBzaGFwZUJvYXJkID0gcmVuZGVyQ2FyZChjYXJkLCAwLCB0aGlzLnByZXZpZXdQYWxldHRlLmxlbmd0aCAtIDEsIGNyb3NzU2l6ZSk7XHJcblxyXG4gICAgICAgIC8vIFRha2UgdGhlIG91dGxpbmUgb2YgdGhlIHNoYXBlLCBhbmQgdGhlbiBhZGQgYSBjcm9zc2hhaXIgdG8gaXQuXHJcbiAgICAgICAgbGV0IGN1cnNvckJvYXJkID0gbmV3IEJvYXJkKHNoYXBlQm9hcmQud2lkdGgsIHNoYXBlQm9hcmQuaGVpZ2h0KTtcclxuICAgICAgICBjdXJzb3JCb2FyZC5vdXRsaW5lKDAsIDAsIHRoaXMucHJldmlld1BhbGV0dGUubGVuZ3RoIC0gMSwgc2hhcGVCb2FyZCk7XHJcbiAgICAgICAgY3Vyc29yQm9hcmQuY3Jvc3NoYWlyKE1hdGguZmxvb3Ioc2hhcGVCb2FyZC53aWR0aCAvIDIpLCBNYXRoLmZsb29yKHNoYXBlQm9hcmQuaGVpZ2h0IC8gMiksIGNyb3NzUmFkaXVzLCAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdXJzb3IgPSBuZXcgUElYSS5TcHJpdGUocnR0KGN1cnNvckJvYXJkLCBzY2FsZSwgdGhpcy5wcmV2aWV3UGFsZXR0ZSkpO1xyXG4gICAgICAgIHRoaXMuYm9hcmRTcHJpdGUuYWRkQ2hpbGQodGhpcy5jdXJzb3IpO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZUN1cnNvcigpO1xyXG5cclxuICAgICAgICB0aGlzLmJvYXJkR3JhcGhpY3MubGluZVN0eWxlKDIsIDB4ZWUwMDAwLCAxKTtcclxuICAgICAgICB0aGlzLmJvYXJkR3JhcGhpY3MuZHJhd1JlY3QoLTEsIC0xLCB0aGlzLmJvYXJkU3ByaXRlLndpZHRoICsgMiwgdGhpcy5ib2FyZFNwcml0ZS5oZWlnaHQgKyAyKTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVDdXJzb3IoKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwb2ludCA9IHRoaXMubGFzdFBvaW50O1xyXG4gICAgICAgIHRoaXMuY3Vyc29yLnggPSBzY2FsZSAqIChwb2ludC54IC0gTWF0aC5mbG9vcih0aGlzLmN1cnNvci53aWR0aCAvICgyICogc2NhbGUpKSk7XHJcbiAgICAgICAgdGhpcy5jdXJzb3IueSA9IHNjYWxlICogKHBvaW50LnkgLSBNYXRoLmZsb29yKHRoaXMuY3Vyc29yLmhlaWdodCAvICgyICogc2NhbGUpKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IG9uQm9hcmQgPSAocG9pbnQueCA+PSAwICYmIHBvaW50LnggPCBnYW1lLnNpemUgJiYgcG9pbnQueSA+PSAwICYmIHBvaW50LnkgPCBnYW1lLnNpemUpO1xyXG4gICAgICAgIHRoaXMuY3Vyc29yLnZpc2libGUgPSBvbkJvYXJkO1xyXG4gICAgICAgIHRoaXMuY3Vyc29yLmFscGhhID0gKGdhbWUuc3RhcnRPayhwb2ludC54LCBwb2ludC55KSA/IDEgOiAwLjUpO1xyXG4gICAgICAgIHRoaXMuc2V0Q3Vyc29yU3R5bGUob25Cb2FyZCA/IFwibm9uZVwiIDogXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgY2xlYXJDdXJzb3IoKVxyXG4gICAge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnNvciAhPSBudWxsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5ib2FyZFNwcml0ZS5yZW1vdmVDaGlsZCh0aGlzLmN1cnNvcik7XHJcbiAgICAgICAgICAgIHRoaXMuY3Vyc29yLmRlc3Ryb3koKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJzb3IgPSBudWxsO1xyXG4gICAgICAgICAgICB0aGlzLnNldEN1cnNvclN0eWxlKFwiXCIpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5ib2FyZEdyYXBoaWNzLmNsZWFyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGJlZ2luUHJldmlldygpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5wcmV2aWV3ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLm92ZXJsYXlCb2FyZC5jbGVhcih0aGlzLnBsYXllcnMubGVuZ3RoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZU92ZXJsYXlCb2FyZCgpO1xyXG4gICAgICAgIHRoaXMub3ZlcmxheVNwcml0ZS52aXNpYmxlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBlbmRQcmV2aWV3KClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnByZXZpZXcgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmNsZWFyQ3Vyc29yKCk7XHJcbiAgICAgICAgdGhpcy5vdmVybGF5U3ByaXRlLnZpc2libGUgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBlbmRQYWludCgpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQ2xlYXIgdGhlIHByZXZpZXdcclxuICAgICAgICB0aGlzLnByZXZpZXdQYWludCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMub3ZlcmxheUJvYXJkLmNsZWFyKHRoaXMucHJldmlld1BhbGV0dGUubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVPdmVybGF5Qm9hcmQoKTtcclxuXHJcbiAgICAgICAgdGhpcy5vbkJvYXJkTW91c2VEb3duID0gbnVsbDtcclxuICAgICAgICB0aGlzLnBsYXlBY3Rpb24oe2NhcmRJZDp0aGlzLmN1cnJlbnRDYXJkSWQsIHBvaW50czp0aGlzLnBhaW50UG9pbnRzfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5lbmRQcmV2aWV3KCk7XHJcbiAgICB9XHJcblxyXG4gICAgbW91c2VNb3ZlKGV2ZW50KVxyXG4gICAge1xyXG4gICAgICAgIGxldCBwb2ludCA9IGV2ZW50LmRhdGEuZ2V0TG9jYWxQb3NpdGlvbih0aGlzLmJvYXJkU3ByaXRlKTtcclxuICAgICAgICB0aGlzLm1vdXNlTW92ZXMucHVzaCh7eDpNYXRoLmZsb29yKHBvaW50LnggLyBzY2FsZSksIHk6TWF0aC5mbG9vcihwb2ludC55IC8gc2NhbGUpfSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlT3ZlcmxheUJvYXJkKClcclxuICAgIHtcclxuICAgICAgICB0aGlzLm92ZXJsYXlCb2FyZC5yZW5kZXIoc2NhbGUsIHRoaXMucHJldmlld1BhbGV0dGUsIHRoaXMub3ZlcmxheUJ1ZmZlcik7XHJcbiAgICAgICAgbGV0IGJvYXJkU2l6ZSA9IHNjYWxlICogZ2FtZS5zaXplO1xyXG4gICAgICAgIGxldCBvcHRpb25zID0ge3dpZHRoOiBib2FyZFNpemUsIGhlaWdodDogYm9hcmRTaXplfTtcclxuICAgICAgICBsZXQgcmVzb3VyY2UgPSBuZXcgUElYSS5yZXNvdXJjZXMuQnVmZmVyUmVzb3VyY2UodGhpcy5vdmVybGF5QnVmZmVyLCBvcHRpb25zKTtcclxuICAgICAgICB0aGlzLm92ZXJsYXlTcHJpdGUudGV4dHVyZSA9IFBJWEkuVGV4dHVyZS5mcm9tKHJlc291cmNlKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQ1BsYXllclxyXG57XHJcbiAgICBjb25zdHJ1Y3RvcihpZCwgbmFtZSwgbG9jYWwpXHJcbiAgICB7XHJcbiAgICAgICAgdGhpcy5pZCA9IGlkO1xyXG4gICAgICAgIHRoaXMuY2FyZHMgPSBbXTtcclxuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IG5ldyBQSVhJLkNvbnRhaW5lcigpO1xyXG4gICAgICAgIHRoaXMubG9jYWwgPSBsb2NhbDtcclxuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xyXG5cclxuICAgICAgICBsZXQgbmFtZVRleHQgPSBuZXcgUElYSS5UZXh0KG5hbWUsIHtmb250RmFtaWx5IDogJ0FyaWFsJywgZm9udFNpemU6IDI0LCBmaWxsIDogY29sb3JzW3RoaXMuaWRdLCBhbGlnbiA6ICdsZWZ0J30pO1xyXG4gICAgICAgIHRoaXMuY29udGFpbmVyLmFkZENoaWxkKG5hbWVUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jb3VudCA9IC0xO1xyXG4gICAgICAgIHRoaXMuZGVsdGEgPSAwO1xyXG4gICAgICAgIHRoaXMuc3RhdHVzID0gbmV3IFBJWEkuVGV4dCgnJywge2ZvbnRGYW1pbHkgOiAnQXJpYWwnLCBmb250U2l6ZTogMTgsIGZpbGwgOiAweDMzMzMzMywgYWxpZ24gOiAnbGVmdCd9KTtcclxuICAgICAgICB0aGlzLnN0YXR1cy54ID0gbmFtZVRleHQueCArIG5hbWVUZXh0LndpZHRoICsgMTA7XHJcbiAgICAgICAgdGhpcy5zdGF0dXMueSA9IG5hbWVUZXh0LnkgKyBuYW1lVGV4dC5oZWlnaHQgLSB0aGlzLnN0YXR1cy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5jb250YWluZXIuYWRkQ2hpbGQodGhpcy5zdGF0dXMpO1xyXG4gICAgICAgIHRoaXMubGFzdFBsYXllZCA9IG51bGw7XHJcblxyXG4gICAgICAgIGNsaWVudC5hcHAuc3RhZ2UuYWRkQ2hpbGQodGhpcy5jb250YWluZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZVN0YXR1cygpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHN0YXR1c1N0ciA9IHRoaXMuY291bnQgKyAncHgnO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5kZWx0YSAhPSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHNpZ24gPSAodGhpcy5kZWx0YSA+PSAwKSA/ICcrJyA6ICcnO1xyXG4gICAgICAgICAgICBzdGF0dXNTdHIgPSBzdGF0dXNTdHIgKyAnICgnICsgc2lnbiArIHRoaXMuZGVsdGEgKyAnKSc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5sYXN0UGxheWVkICE9IG51bGwpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBzdGF0dXNTdHIgPSBzdGF0dXNTdHIgKyAnIGxhc3QgcGxheWVkOiAnICsgdGhpcy5sYXN0UGxheWVkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5zdGF0dXMudGV4dCA9IHN0YXR1c1N0cjtcclxuICAgIH1cclxuXHJcbiAgICBzZXRDb3VudChjb3VudClcclxuICAgIHtcclxuICAgICAgICB0aGlzLmRlbHRhID0gKHRoaXMuY291bnQgPj0gMCkgPyAoY291bnQgLSB0aGlzLmNvdW50KSA6IDA7XHJcbiAgICAgICAgdGhpcy5jb3VudCA9IGNvdW50O1xyXG4gICAgICAgIHRoaXMudXBkYXRlU3RhdHVzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0RW5hYmxlZChlbmFibGVkKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuY2FyZHMuZm9yRWFjaChjYXJkID0+IHsgY2FyZC5zZXRFbmFibGVkKGVuYWJsZWQpOyB9KTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRDYXJkKGNhcmRJZCwgeCwgeSlcclxuICAgIHtcclxuICAgICAgICBsZXQgY2FyZCA9IG5ldyBDQ2FyZChjYXJkSWQpO1xyXG4gICAgICAgIHRoaXMuY29udGFpbmVyLmFkZENoaWxkKGNhcmQuZ3JhcGhpY3MpO1xyXG4gICAgICAgIGNhcmQuc2V0UG9zaXRpb24oeCAtIHRoaXMuY29udGFpbmVyLngsIHkgLSB0aGlzLmNvbnRhaW5lci55KTtcclxuICAgICAgICB0aGlzLmNhcmRzLnB1c2goY2FyZCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVUYXJnZXRzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2FyZC5vbignY2xpY2snLCAoY2FyZElkKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5zZXRFbmFibGVkKGZhbHNlKTtcclxuICAgICAgICAgICAgY2xpZW50LnBsYXlDYXJkKGNhcmRJZCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheShjYXJkSWQpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRmluZCB0aGUgY2FyZCBhbmQgcmVtb3ZlIGl0XHJcbiAgICAgICAgbGV0IGNhcmRJbmRleCA9IHRoaXMuY2FyZHMuZmluZEluZGV4KGNhcmQgPT4gY2FyZC5jYXJkSWQgPT0gY2FyZElkKTtcclxuICAgICAgICBsZXQgY2FyZCA9IHRoaXMuY2FyZHNbY2FyZEluZGV4XTtcclxuICAgICAgICB0aGlzLmNhcmRzLnNwbGljZShjYXJkSW5kZXgsIDEpO1xyXG4gICAgICAgIHRoaXMuY29udGFpbmVyLnJlbW92ZUNoaWxkKGNhcmQuZ3JhcGhpY3MpO1xyXG4gICAgICAgIGNhcmQuZGVzdHJveSgpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlVGFyZ2V0cygpO1xyXG5cclxuICAgICAgICAvLyBSZXBvcnQgdGhlIGxhc3QgY2FyZCBwbGF5ZWQgaW4gdGhlIHN0YXR1c1xyXG4gICAgICAgIGxldCBnYW1lQ2FyZCA9IGdhbWUuZ2V0Q2FyZChjYXJkSWQpO1xyXG4gICAgICAgIHRoaXMubGFzdFBsYXllZCA9IGNhcmROYW1lKGdhbWVDYXJkKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZVN0YXR1cygpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZVRhcmdldHMoKVxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5jYXJkcy5sZW5ndGg7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FyZHNbaV0uc2V0VGFyZ2V0KDEwICsgaSAqIDExMCwgMzQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gTWFwIGhpZGRlbiBjYXJkIElEcyB0byB0aGVpciBDQ2FyZHMsIGluIG9yZGVyIHRvIHVwZGF0ZSB0aGUgZ3JhcGhpY3Mgb24gcmV2ZWFsXHJcbmNsYXNzIENDYXJkIGV4dGVuZHMgRXZlbnRFbWl0dGVyXHJcbntcclxuICAgIGNvbnN0cnVjdG9yKGNhcmRJZClcclxuICAgIHtcclxuICAgICAgICBzdXBlcigpO1xyXG5cclxuICAgICAgICB0aGlzLmNhcmRJZCA9IGNhcmRJZDtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzID0gbmV3IFBJWEkuR3JhcGhpY3MoKTtcclxuICAgICAgICB0aGlzLmVuYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLm1vdXNlT3ZlciA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMudGFyZ2V0WCA9IDA7XHJcbiAgICAgICAgdGhpcy50YXJnZXRZID0gMDtcclxuICAgICAgICB0aGlzLnVwZGF0ZUdyYXBoaWNzKCk7XHJcblxyXG4gICAgICAgIC8vXHJcbiAgICAgICAgLy8gSGFuZGxlIG1vdXNlIGV2ZW50c1xyXG4gICAgICAgIC8vXHJcblxyXG4gICAgICAgIHRoaXMuZ3JhcGhpY3Mub24oJ21vdXNldXAnLCAoKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdjbGljaycsIGNhcmRJZClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuZ3JhcGhpY3Mub24oJ21vdXNlb3ZlcicsICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlT3ZlciA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlR3JhcGhpY3MoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLm9uKCdtb3VzZW91dCcsICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlT3ZlciA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUdyYXBoaWNzKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSByZXZlYWxcclxuICAgICAgICBnYW1lLm9uKCdyZXZlYWwnLCBjYXJkSWQgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmIChjYXJkSWQgPT0gdGhpcy5jYXJkSWQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlR3JhcGhpY3MoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBBZGQgdG8gdGlja2VyIGZvciBhbmltYXRlZCBwb3NpdGlvbiB1cGRhdGVzXHJcbiAgICAgICAgY2xpZW50LmFwcC50aWNrZXIuYWRkKHRoaXMudXBkYXRlLCB0aGlzKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ2FsbCB0byBkZXN0cm95IGdyYXBoaWNzIHJlc291cmNlc1xyXG4gICAgZGVzdHJveSgpXHJcbiAgICB7XHJcbiAgICAgICAgY2xpZW50LmFwcC50aWNrZXIucmVtb3ZlKHRoaXMudXBkYXRlLCB0aGlzKTtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLmRlc3Ryb3koKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBIZXBsZXIgZ2V0dGVyc1xyXG4gICAgZ2V0Q2FyZCgpIHsgcmV0dXJuIGdhbWUuZ2V0Q2FyZCh0aGlzLmNhcmRJZCk7IH1cclxuICAgIGlzSGlkZGVuKCkgeyByZXR1cm4gZ2V0Q2FyZCgpID09IG51bGw7IH1cclxuXHJcbiAgICAvLyBTZXQgdGhlIHBvc2l0aW9uIGltbWVkaWF0ZWx5XHJcbiAgICBzZXRQb3NpdGlvbih4LCB5KVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZ3JhcGhpY3MueCA9IHg7XHJcbiAgICAgICAgdGhpcy5ncmFwaGljcy55ID0geTtcclxuICAgICAgICB0aGlzLnRhcmdldFggPSB4O1xyXG4gICAgICAgIHRoaXMudGFyZ2V0WSA9IHk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2V0IHRoZSBwb3NpdGlvbiB0byBhbmltYXRlIHRvXHJcbiAgICBzZXRUYXJnZXQoeCwgeSlcclxuICAgIHtcclxuICAgICAgICB0aGlzLnRhcmdldFggPSB4O1xyXG4gICAgICAgIHRoaXMudGFyZ2V0WSA9IHk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQW5pbWF0ZXMgcG9zaXRpb25cclxuICAgIHVwZGF0ZShkZWx0YSlcclxuICAgIHtcclxuICAgICAgICBsZXQgZHggPSB0aGlzLmdyYXBoaWNzLnggLSB0aGlzLnRhcmdldFg7XHJcbiAgICAgICAgbGV0IGR5ID0gdGhpcy5ncmFwaGljcy55IC0gdGhpcy50YXJnZXRZO1xyXG4gICAgICAgIGxldCBkaXN0ID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcclxuICAgICAgICBpZiAoZGlzdCA9PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBnYWluUGVyRnJhbWUgPSAwLjE7XHJcbiAgICAgICAgY29uc3QgZXhwID0gLU1hdGgubG9nKDEgLSBnYWluUGVyRnJhbWUpO1xyXG4gICAgICAgIGxldCByYXRpbyA9IE1hdGguZXhwKC1kZWx0YSAqIGV4cCk7XHJcbiAgICAgICAgbGV0IG5ld0Rpc3QgPSByYXRpbyAqIGRpc3Q7XHJcbiAgICAgICAgaWYgKG5ld0Rpc3QgPCAwLjI1KVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmF0aW8gPSAwO1xyXG4gICAgICAgICAgICBuZXdEaXN0ID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgZHggKj0gcmF0aW87XHJcbiAgICAgICAgZHkgKj0gcmF0aW87XHJcbiAgICAgICAgdGhpcy5ncmFwaGljcy54ID0gdGhpcy50YXJnZXRYICsgZHg7XHJcbiAgICAgICAgdGhpcy5ncmFwaGljcy55ID0gdGhpcy50YXJnZXRZICsgZHk7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0RW5hYmxlZChlbmFibGVkKVxyXG4gICAge1xyXG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XHJcbiAgICAgICAgdGhpcy5ncmFwaGljcy5pbnRlcmFjdGl2ZSA9IGVuYWJsZWQ7XHJcbiAgICAgICAgaWYgKCFlbmFibGVkKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5tb3VzZU92ZXIgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy51cGRhdGVHcmFwaGljcyhmYWxzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlR3JhcGhpY3Mob3ZlcilcclxuICAgIHtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLnJlbW92ZUNoaWxkcmVuKCk7XHJcbiAgICAgICAgaWYgKHRoaXMudGV4dHVyZSAhPSBudWxsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy50ZXh0dXJlLmRlc3Ryb3koKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGNhcmQgPSB0aGlzLmdldENhcmQoKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBBZGQgdGhlIGNhcmQgYmFja2dyb3VuZFxyXG4gICAgICAgIHRoaXMuZ3JhcGhpY3MuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLmxpbmVTdHlsZSgyLCB0aGlzLmdyYXBoaWNzLmludGVyYWN0aXZlID8gKG92ZXIgPyAweGVlMDAwMCA6IDB4MDAwMGVlKSA6IDB4MzMzMzMzLCAxKTtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLmJlZ2luRmlsbChjYXJkID09IG51bGwgPyAweGFhYWFhYSA6IDB4ZmZmZmZmKTtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLmRyYXdSb3VuZGVkUmVjdCgwLCAwLCBjYXJkV2lkdGgsIGNhcmRIZWlnaHQsIDEwKTtcclxuICAgICAgICB0aGlzLmdyYXBoaWNzLmVuZEZpbGwoKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHRoZSBjYXJkIGNvbnRlbnRcclxuICAgICAgICBpZiAoY2FyZCA9PSBudWxsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gVW5yZXZlYWxlZCBjYXJkXHJcbiAgICAgICAgICAgIGxldCB0ZXh0ID0gbmV3IFBJWEkuVGV4dCgnPycsIHtmb250RmFtaWx5IDogJ0FyaWFsJywgZm9udFNpemU6IDI0LCBmaWxsIDogMHgzMzMzMzMsIGFsaWduIDogJ2xlZnQnfSk7XHJcbiAgICAgICAgICAgIHRleHQueCA9IE1hdGguZmxvb3IoKGNhcmRXaWR0aCAtIHRleHQud2lkdGgpIC8gMik7XHJcbiAgICAgICAgICAgIHRleHQueSA9IE1hdGguZmxvb3IoKGNhcmRIZWlnaHQgLSB0ZXh0LmhlaWdodCkgLyAyKTtcclxuICAgICAgICAgICAgdGhpcy5ncmFwaGljcy5hZGRDaGlsZCh0ZXh0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IHBpeGVscyA9IDA7XHJcbiAgICAgICAgICAgIHN3aXRjaCAoY2FyZC50eXBlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIENhcmRUeXBlLkNJUkNMRTpcclxuICAgICAgICAgICAgICAgIGNhc2UgQ2FyZFR5cGUuQk9YOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5QT0xZOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5FUkFTRVI6XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGJvYXJkID0gcmVuZGVyQ2FyZChjYXJkLCAwLCAxLCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBwaXhlbHMgPSBib2FyZC5jb3VudCgxKVswXTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmUgPSBydHQoYm9hcmQsIDEsIGNhcmRQYWxldHRlKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgc3ByaXRlID0gbmV3IFBJWEkuU3ByaXRlKHRoaXMudGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgc3ByaXRlLnggPSBNYXRoLmZsb29yKHRoaXMuZ3JhcGhpY3Mud2lkdGggLSBzcHJpdGUud2lkdGgpIC8gMjtcclxuICAgICAgICAgICAgICAgICAgICBzcHJpdGUueSA9IE1hdGguZmxvb3IodGhpcy5ncmFwaGljcy5oZWlnaHQgLSBzcHJpdGUuaGVpZ2h0KSAvIDI7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmFwaGljcy5hZGRDaGlsZChzcHJpdGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5MSU5FOlxyXG4gICAgICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5QQUlOVDpcclxuICAgICAgICAgICAgICAgICAgICBwaXhlbHMgPSBjYXJkLnBpeGVscztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGxldCB0ZXh0ID0gbmV3IFBJWEkuVGV4dChjYXJkTmFtZShjYXJkKSwge2ZvbnRGYW1pbHkgOiAnQXJpYWwnLCBmb250U2l6ZTogMjQsIGZpbGwgOiAweDIyMjIyMiwgYWxpZ24gOiAnbGVmdCd9KTtcclxuICAgICAgICAgICAgdGV4dC54ID0gTWF0aC5mbG9vcigoY2FyZFdpZHRoIC0gdGV4dC53aWR0aCkgLyAyKTtcclxuICAgICAgICAgICAgdGV4dC55ID0gTWF0aC5mbG9vcigxMCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhpY3MuYWRkQ2hpbGQodGV4dCk7XHJcblxyXG4gICAgICAgICAgICBsZXQgcHhTdHJpbmcgPSAoKHBpeGVscyA9PSAwKSA/ICcqJyA6IHBpeGVscykgKyAncHgnO1xyXG4gICAgICAgICAgICBsZXQgcHhUZXh0ID0gbmV3IFBJWEkuVGV4dChweFN0cmluZywge2ZvbnRGYW1pbHkgOiAnQXJpYWwnLCBmb250U2l6ZTogMTgsIGZpbGwgOiAweDIyMjIyMiwgYWxpZ24gOiAnbGVmdCd9KTtcclxuICAgICAgICAgICAgcHhUZXh0LnggPSBNYXRoLmZsb29yKChjYXJkV2lkdGggLSBweFRleHQud2lkdGgpIC8gMik7XHJcbiAgICAgICAgICAgIHB4VGV4dC55ID0gTWF0aC5mbG9vcihjYXJkSGVpZ2h0IC0gcHhUZXh0LmhlaWdodCAtIDEwKTtcclxuICAgICAgICAgICAgdGhpcy5ncmFwaGljcy5hZGRDaGlsZChweFRleHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDbGllbnQ7XHJcbiIsImNvbnN0IENhcmRUeXBlID0gcmVxdWlyZSgnLi9DYXJkVHlwZS5qcycpO1xyXG5jb25zdCBCb2FyZCA9IHJlcXVpcmUoJy4vYm9hcmQuanMnKTtcclxuY29uc3QgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJyk7XHJcblxyXG4vL1xyXG4vLyBFdmVudHNcclxuLy8gdXBkYXRlQm9hcmQoKTogdGhpcy5ib2FyZCBoYXMgY2hhbmdlZFxyXG4vLyByZXZlYWwoY2FyZElkLCBkZWNrSWQpOiBjYXJkSWQgaGFzIGJlZW4gcmV2ZWFsZWQgdG8gYWxsIHBsYXllcnMsIGRlY2tJZCBpcyBpdHMgaW5kZXggaW4gdGhpcy5kZWNrXHJcbi8vIGRlYWwocGxheWVySWQsIGNhcmRJZCk6IGNhcmRJZCBoYXMgYmVlbiBkZWFsdCB0byBwbGF5ZXJJZFxyXG4vLyBwbGF5KHBsYXllcklkLCBjYXJkSWQpOiBwbGF5ZXJJZCBoYXMgcGxheWVkIGFuZCBkaXNjYXJkZWQgY2FyZElkXHJcbi8vIGJlZ2luVHVybihwbGF5ZXJJZCk6IHBsYXllcklkJ3MgdHVybiBoYXMgYmVndW5cclxuLy9cclxuY2xhc3MgR2FtZSBleHRlbmRzIEV2ZW50RW1pdHRlclxyXG57XHJcbiAgICBjb25zdHJ1Y3RvcihudW1QbGF5ZXJzLCBzaHVmZmxlKVxyXG4gICAge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcblxyXG4gICAgICAgIC8vIENvbnN0YW50c1xyXG4gICAgICAgIHRoaXMuc2l6ZSA9IDI5OTsgLy8gR2FtZWJvYXJkIGRpbWVuc2lvblxyXG5cclxuICAgICAgICAvLyBJbml0aWFsaXplIHRoZSBnYW1lIGJvYXJkXHJcbiAgICAgICAgdGhpcy5ib2FyZCA9IG5ldyBCb2FyZCh0aGlzLnNpemUsIHRoaXMuc2l6ZSk7XHJcbiAgICAgICAgdGhpcy5ib2FyZC5jbGVhcihudW1QbGF5ZXJzKTtcclxuXHJcbiAgICAgICAgaWYgKCEobnVtUGxheWVycyA+PSAxICYmIG51bVBsYXllcnMgPD0gNikpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aHJvdyAnVW5zdXBwb3J0ZWQgcGxheWVyIGNvdW50ICcgKyBudW1QbGF5ZXJzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWFrZSBhIGRlY2sgb2YgY2FyZHNcclxuICAgICAgICB0aGlzLmRlY2sgPSBbXTtcclxuICAgICAgICBjb25zdCBjb3VudExvdyA9IFswLCAzLCAzLCA0LCA1LCA2LCA3XVtudW1QbGF5ZXJzXTtcclxuICAgICAgICBjb25zdCBjb3VudE1lZCA9IFswLCA1LCA1LCA1LCA2LCA3LCA4XVtudW1QbGF5ZXJzXTtcclxuICAgICAgICBjb25zdCBjb3VudEhpZ2ggPSBbMCwgNywgNywgNywgOCwgOCwgOV1bbnVtUGxheWVyc107XHJcblxyXG4gICAgICAgIHRoaXMuZGVjayA9IHRoaXMuZGVjay5jb25jYXQoQXJyYXkoY291bnRMb3cpLmZpbGwoeyB0eXBlOiBDYXJkVHlwZS5FUkFTRVIsIHJhZGl1czogMzAuNSwgbmFtZTogJ0VyYXNlcicgfSkpO1xyXG4gICAgICAgIHRoaXMuZGVjayA9IHRoaXMuZGVjay5jb25jYXQoQXJyYXkoY291bnRMb3cpLmZpbGwoeyB0eXBlOiBDYXJkVHlwZS5CT1gsIHdpZHRoOiA0NSwgaGVpZ2h0OiAyMSwgbmFtZTogJ0JveCcgfSkpO1xyXG4gICAgICAgIHRoaXMuZGVjayA9IHRoaXMuZGVjay5jb25jYXQoQXJyYXkoY291bnRMb3cpLmZpbGwoeyB0eXBlOiBDYXJkVHlwZS5CT1gsIHdpZHRoOiAyMSwgaGVpZ2h0OiA0NSwgbmFtZTogJ0JveCcgfSkpO1xyXG4gICAgICAgIHRoaXMuZGVjayA9IHRoaXMuZGVjay5jb25jYXQoQXJyYXkoY291bnRIaWdoKS5maWxsKHsgdHlwZTogQ2FyZFR5cGUuTElORSwgcGl4ZWxzOiAxNDAsIG5hbWU6ICdMaW5lJyB9KSk7XHJcbiAgICAgICAgdGhpcy5kZWNrID0gdGhpcy5kZWNrLmNvbmNhdChBcnJheShjb3VudE1lZCkuZmlsbCh7IHR5cGU6IENhcmRUeXBlLkZJTEwsIHJhZGl1czogNCwgbmFtZTogJ0dyb3cnIH0pKTtcclxuICAgICAgICB0aGlzLmRlY2sgPSB0aGlzLmRlY2suY29uY2F0KEFycmF5KGNvdW50SGlnaCkuZmlsbCh7IHR5cGU6IENhcmRUeXBlLlBBSU5ULCByYWRpdXM6IDQsIHBpeGVsczogNjAwLCBuYW1lOiAnQnJ1c2gnIH0pKTtcclxuICAgICAgICB0aGlzLmRlY2sgPSB0aGlzLmRlY2suY29uY2F0KEFycmF5KGNvdW50TG93KS5maWxsKHsgdHlwZTogQ2FyZFR5cGUuUE9MWSwgc2lkZXM6IDMsIHJhZGl1czogMjUuNSwgYW5nbGU6IDAuMiwgbmFtZTogJ1BvbHlnb24nIH0pKTtcclxuICAgICAgICB0aGlzLmRlY2sgPSB0aGlzLmRlY2suY29uY2F0KEFycmF5KGNvdW50TG93KS5maWxsKHsgdHlwZTogQ2FyZFR5cGUuUE9MWSwgc2lkZXM6IDUsIHJhZGl1czogMjMuNSwgYW5nbGU6IDAuNCwgbmFtZTogJ1BvbHlnb24nIH0pKTtcclxuICAgICAgICB0aGlzLmRlY2sgPSB0aGlzLmRlY2suY29uY2F0KEFycmF5KGNvdW50TG93KS5maWxsKHsgdHlwZTogQ2FyZFR5cGUuUE9MWSwgc2lkZXM6IDcsIHJhZGl1czogMjEuNSwgYW5nbGU6IDAuNiwgbmFtZTogJ1BvbHlnb24nIH0pKTtcclxuXHJcbiAgICAgICAgLy8gU2h1ZmZsZSB0aGUgZGVjayBvbiBzZXJ2ZXIgKHNodWZmbGUgPSB0cnVlKSwgbWFyayBhbGwgY2FyZHMgaGlkZGVuIG9uIGNsaWVudCAoc2h1ZmZsZSA9IGZhbHNlKVxyXG4gICAgICAgIGxldCBjb3VudCA9IHRoaXMuZGVjay5sZW5ndGg7XHJcbiAgICAgICAgdGhpcy5zaHVmZmxlID0gbmV3IEFycmF5KGNvdW50KTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnNodWZmbGVbaV0gPSBzaHVmZmxlID8gaSA6IC0xO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoc2h1ZmZsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGogPSBNYXRoLmZsb29yKGkgKyBNYXRoLnJhbmRvbSgpICogKGNvdW50IC0gaSkpO1xyXG4gICAgICAgICAgICAgICAgbGV0IHRlbXAgPSB0aGlzLnNodWZmbGVbaV07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNodWZmbGVbaV0gPSB0aGlzLnNodWZmbGVbal07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNodWZmbGVbal0gPSB0ZW1wO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJbml0aWFsaXplIHRoZSBkcmF3IHBpbGVcclxuICAgICAgICBjb3VudCAtPSBjb3VudCAlIG51bVBsYXllcnM7IC8vIEVxdWFsIG51bWJlciBvZiBjYXJkcyBmb3IgZWFjaCBwbGF5ZXJcclxuICAgICAgICB0aGlzLnBpbGUgPSBuZXcgQXJyYXkoY291bnQpO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRoaXMucGlsZVtpXSA9IGk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDcmVhdGUgdGhlIHBsYXllcnNcclxuICAgICAgICB0aGlzLnBsYXllcnMgPSBuZXcgQXJyYXkobnVtUGxheWVycyk7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1QbGF5ZXJzOyBpKyspXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllcnNbaV0gPSB7IGhhbmQ6IFtdLCBkaXNjb25uZWN0ZWQ6IGZhbHNlIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMubnVtQ29ubmVjdGVkLS07XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q2FyZChjYXJkSWQpXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGVja1t0aGlzLnNodWZmbGVbY2FyZElkXV1cclxuICAgIH1cclxuXHJcbiAgICAvL1xyXG4gICAgLy8gRVhURVJOQUwgZnVuY3Rpb25zXHJcbiAgICAvL1xyXG5cclxuICAgIGJlZ2luKClcclxuICAgIHtcclxuICAgICAgICAvLyBQdXQgc29tZSBzdGFydGluZyBzcG90cyBvbiB0aGUgYm9hcmRcclxuICAgICAgICBsZXQgbnVtUGxheWVycyA9IHRoaXMucGxheWVycy5sZW5ndGg7XHJcbiAgICAgICAgbGV0IGNlbnRlciA9IE1hdGguZmxvb3IodGhpcy5zaXplIC8gMik7IC8vIEdhbWVib2FyZCBtaWRkbGUgcGl4ZWwgaW5kZXhcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bVBsYXllcnM7IGkrKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCB4ID0gTWF0aC5mbG9vcihjZW50ZXIgKyBNYXRoLmNvcyhpICogTWF0aC5QSSAqIDIgLyBudW1QbGF5ZXJzKSAqIHRoaXMuc2l6ZSAvIDMpO1xyXG4gICAgICAgICAgICBsZXQgeSA9IE1hdGguZmxvb3IoY2VudGVyICsgTWF0aC5zaW4oaSAqIE1hdGguUEkgKiAyIC8gbnVtUGxheWVycykgKiB0aGlzLnNpemUgLyAzKTtcclxuICAgICAgICAgICAgdGhpcy5ib2FyZC5jaXJjbGUoeCwgeSwgOC41LCBpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW1pdCgndXBkYXRlQm9hcmQnKTtcclxuXHJcbiAgICAgICAgLy8gRGVhbCBjYXJkcyB0byBlYWNoIHBsYXllclxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wbGF5ZXJzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5kZWFsKGkpO1xyXG4gICAgICAgICAgICB0aGlzLmRlYWwoaSk7XHJcbiAgICAgICAgICAgIHRoaXMuZGVhbChpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0YXJ0IHRoZSBmaXJzdCBwbGF5ZXIncyB0dXJuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50UGxheWVyID0gLTE7XHJcbiAgICAgICAgdGhpcy5uZXh0VHVybigpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldmVhbChjYXJkSWQsIGRlY2tJZClcclxuICAgIHtcclxuICAgICAgICB0aGlzLnNodWZmbGVbY2FyZElkXSA9IGRlY2tJZDtcclxuICAgICAgICB0aGlzLmVtaXQoJ3JldmVhbCcsIGNhcmRJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gcmV0dXJucyB0cnVlIG9uIHN1Y2Nlc3MsIGZhbHNlIG9uIGZhaWx1cmVcclxuICAgIHBsYXkoYWN0aW9uKVxyXG4gICAge1xyXG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgY2FyZCBiZWxvbmdzIHRvIHRoZSBjdXJyZW50IHBsYXllclxyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJzW3RoaXMuY3VycmVudFBsYXllcl0uaGFuZC5pbmNsdWRlcyhhY3Rpb24uY2FyZElkKSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRocm93ICdHYW1lLnBsYXkoKSBmYWlsZWQnO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gR2V0IHRoZSBjYXJkIGRhdGFcclxuICAgICAgICBsZXQgY2FyZCA9IHRoaXMuZ2V0Q2FyZChhY3Rpb24uY2FyZElkKTtcclxuICAgICAgICBpZiAoY2FyZCA9PSBudWxsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhyb3cgJ0dhbWUucGxheSgpIGZhaWxlZCc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQZXJmb3JtIHRoZSByaWdodCBhY3Rpb24gZm9yIHRoZSBjYXJkXHJcbiAgICAgICAgc3dpdGNoIChjYXJkLnR5cGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYXNlIENhcmRUeXBlLkNJUkNMRTpcclxuICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5FUkFTRVI6XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc3RhcnRPayhhY3Rpb24ueCwgYWN0aW9uLnkpKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdHYW1lLnBsYXkoKSBmYWlsZWQnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IGNvbG9yID0gKGNhcmQudHlwZSA9PSBDYXJkVHlwZS5DSVJDTEUpID8gdGhpcy5jdXJyZW50UGxheWVyIDogdGhpcy5wbGF5ZXJzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9hcmQuY2lyY2xlKGFjdGlvbi54LCBhY3Rpb24ueSwgY2FyZC5yYWRpdXMsIGNvbG9yKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIENhcmRUeXBlLkJPWDpcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zdGFydE9rKGFjdGlvbi54LCBhY3Rpb24ueSkpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0dhbWUucGxheSgpIGZhaWxlZCc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvYXJkLmJveChhY3Rpb24ueCwgYWN0aW9uLnksIGNhcmQud2lkdGgsIGNhcmQuaGVpZ2h0LCB0aGlzLmN1cnJlbnRQbGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgQ2FyZFR5cGUuUE9MWTpcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zdGFydE9rKGFjdGlvbi54LCBhY3Rpb24ueSkpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0dhbWUucGxheSgpIGZhaWxlZCc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvYXJkLnBvbHkoYWN0aW9uLngsIGFjdGlvbi55LCBjYXJkLnNpZGVzLCBjYXJkLnJhZGl1cywgY2FyZC5hbmdsZSwgdGhpcy5jdXJyZW50UGxheWVyKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIENhcmRUeXBlLkxJTkU6XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc3RhcnRPayhhY3Rpb24ueCwgYWN0aW9uLnkpIHx8IGFjdGlvbi54MiA9PSBudWxsIHx8IGFjdGlvbi55MiA9PSBudWxsKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdHYW1lLnBsYXkoKSBmYWlsZWQnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2FyZC5saW5lKGFjdGlvbi54LCBhY3Rpb24ueSwgYWN0aW9uLngyLCBhY3Rpb24ueTIsIGNhcmQucGl4ZWxzLCB0aGlzLmN1cnJlbnRQbGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgQ2FyZFR5cGUuUEFJTlQ6XHJcbiAgICAgICAgICAgICAgICBpZiAoYWN0aW9uLnBvaW50cyA9PSBudWxsIHx8IGFjdGlvbi5wb2ludHMubGVuZ3RoID09IDAgfHwgYWN0aW9uLnBvaW50cy5sZW5ndGggPiBjYXJkLnBpeGVscyB8fCAhdGhpcy5zdGFydE9rKGFjdGlvbi5wb2ludHNbMF0ueCwgYWN0aW9uLnBvaW50c1swXS55KSlcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnR2FtZS5wbGF5KCkgZmFpbGVkJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgYWN0aW9uLnBvaW50cy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuY29vcmRzT2soYWN0aW9uLnBvaW50c1tpXS54LCBhY3Rpb24ucG9pbnRzW2ldLnkpKVxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0dhbWUucGxheSgpIGZhaWxlZCc7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGV0IHAgPSBjYXJkLnBpeGVscztcclxuICAgICAgICAgICAgICAgIGxldCByID0gY2FyZC5yYWRpdXM7XHJcbiAgICAgICAgICAgICAgICBsZXQgcGFpbnRCb2FyZCA9IG5ldyBCb2FyZCh0aGlzLnNpemUsIHRoaXMuc2l6ZSk7XHJcbiAgICAgICAgICAgICAgICBwYWludEJvYXJkLmNsZWFyKHRoaXMucGxheWVycy5sZW5ndGgpO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhY3Rpb24ucG9pbnRzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChwIDw9IDApXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyAnR2FtZS5wbGF5KCkgZmFpbGVkJzsgLy8gdG9vIG1hbnkgcG9pbnRzXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBsZXQgaiA9IE1hdGgubWF4KGkgLSAxLCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgcDIgPSBwYWludEJvYXJkLnBhaW50KGFjdGlvbi5wb2ludHNbal0ueCwgYWN0aW9uLnBvaW50c1tqXS55LCBhY3Rpb24ucG9pbnRzW2ldLngsIGFjdGlvbi5wb2ludHNbaV0ueSwgciwgcCwgdGhpcy5jdXJyZW50UGxheWVyKTtcclxuICAgICAgICAgICAgICAgICAgICBwID0gTWF0aC5taW4ocDIsIHAgLSAxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuYm9hcmQuYWRkKHBhaW50Qm9hcmQsIHRoaXMuY3VycmVudFBsYXllcik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBDYXJkVHlwZS5GSUxMOlxyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnN0YXJ0T2soYWN0aW9uLngsIGFjdGlvbi55KSlcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnR2FtZS5wbGF5KCkgZmFpbGVkJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuYm9hcmQuZmxvb2QoYWN0aW9uLngsIGFjdGlvbi55LCBjYXJkLnJhZGl1cywgdGhpcy5jdXJyZW50UGxheWVyKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgdGhyb3cgJ0dhbWUucGxheSgpIGZhaWxlZCc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVtaXQoJ3VwZGF0ZUJvYXJkJyk7XHJcbiAgICAgICAgdGhpcy5lbWl0KCdyZXZlYWwnLCBhY3Rpb24uY2FyZElkKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIGNhcmQgZnJvbSB0aGUgcGxheWVyJ3MgaGFuZFxyXG4gICAgICAgIGxldCBwbGF5ZXIgPSB0aGlzLnBsYXllcnNbdGhpcy5jdXJyZW50UGxheWVyXTtcclxuICAgICAgICBwbGF5ZXIuaGFuZC5zcGxpY2UocGxheWVyLmhhbmQuaW5kZXhPZihhY3Rpb24uY2FyZElkKSwgMSk7XHJcbiAgICAgICAgdGhpcy5lbWl0KCdwbGF5JywgdGhpcy5jdXJyZW50UGxheWVyLCBhY3Rpb24uY2FyZElkKTtcclxuXHJcbiAgICAgICAgdGhpcy5uZXh0VHVybigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEhhbmRsZSBkaXNjb25uZWN0c1xyXG4gICAgcmVtb3ZlUGxheWVyKHBsYXllcklkKVxyXG4gICAge1xyXG4gICAgICAgIGlmICgtLXRoaXMubnVtQ29ubmVjdGVkID09IDEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBUT0RPIGdhbWUgaXMgb3ZlclxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJzW3BsYXllcklkXS5kaXNjb25uZWN0ZWQgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBUT0RPIC0gaGFuZGxlIGlmIGl0J3MgdGhhdCBwbGF5ZXIncyB0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgLy9cclxuICAgIC8vIElOVEVSTkFMIGZ1bmN0aW9uc1xyXG4gICAgLy9cclxuXHJcbiAgICAvLyBEZWFsIG9uZSBjYXJkIGZyb20gdGhlIHBpbGUgdG8gYSBwbGF5ZXJcclxuICAgIGRlYWwocGxheWVySWQpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKHRoaXMucGlsZS5sZW5ndGgpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgY2FyZElkID0gdGhpcy5waWxlLnBvcCgpO1xyXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2RlYWwnLCBwbGF5ZXJJZCwgY2FyZElkKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJzW3BsYXllcklkXS5oYW5kLnB1c2goY2FyZElkKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgbmV4dFR1cm4oKVxyXG4gICAge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wbGF5ZXJzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UGxheWVyID0gKHRoaXMuY3VycmVudFBsYXllciArIDEpICUgdGhpcy5wbGF5ZXJzLmxlbmd0aDsgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5wbGF5ZXJzW3RoaXMuY3VycmVudFBsYXllcl0uZGlzY29ubmVjdGVkKSAvLyBqdXN0IHNraXAgREMnZCBwbGF5ZXJzXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZGVhbCh0aGlzLmN1cnJlbnRQbGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdiZWdpblR1cm4nLCB0aGlzLmN1cnJlbnRQbGF5ZXIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29vcmRzT2soeCwgeSlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4geCA+IC0xMDAwMDAgJiYgeCA8IDEwMDAwMCAmJiB5ID4gLTEwMDAwMCAmJiB5IDwgMTAwMDAwO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0T2soeCwgeSlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gKHRoaXMuYm9hcmQuZ2V0KHgsIHkpID09IHRoaXMuY3VycmVudFBsYXllciB8fCB0aGlzLmJvYXJkLmNvdW50KHRoaXMucGxheWVycy5sZW5ndGggKyAxKVt0aGlzLmN1cnJlbnRQbGF5ZXJdID09IDApO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEdhbWU7XHJcbiIsIi8vIFRoaXMgcmVxdWlyZXMgdGhlIHNvY2tldC5pby5qcyBjbGllbnQgaW4gdGhlIGdsb2JhbCBzY29wZVxyXG5jb25zdCBDbGllbnQgPSByZXF1aXJlKCcuL2NsaWVudC5qcycpO1xyXG5cclxuLy8gRW50cnkgcG9pbnQuXHJcbi8vIE1hbmFnZXMgdGhlIGxvYmJ5IFVJIGluIGluZGV4Lmh0bWwuXHJcbiQoZnVuY3Rpb24oKVxyXG57XHJcbiAgICBsZXQgaG9zdCA9IGZhbHNlO1xyXG4gICAgbGV0IHNvY2tldCA9IG51bGw7XHJcbiAgICBsZXQga2V5ID0gJyc7XHJcbiAgICBsZXQgbG9jYWxQbGF5ZXJJZCA9IC0xO1xyXG4gICAgbGV0IGxvYmJ5UGxheWVycyA9IFtdO1xyXG5cclxuICAgIC8vXHJcbiAgICAvLyBIZWxwZXIgZnVuY3Rpb25zXHJcbiAgICAvL1xyXG5cclxuICAgIGZ1bmN0aW9uIGFkZFBsYXllcihuYW1lKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBsaSA9ICQoJzxsaT4nKS50ZXh0KG5hbWUpO1xyXG4gICAgICAgIGlmIChsb2JieVBsYXllcnMubGVuZ3RoID09IDApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsaS5hcHBlbmQoJyAoaG9zdCknKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgJCgnI3BsYXllckxpc3QnKS5hcHBlbmQobGkpO1xyXG4gICAgICAgIGxvYmJ5UGxheWVycy5wdXNoKHtuYW1lOiBuYW1lLCBsaTogbGl9KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBiZWNvbWVIb3N0KClcclxuICAgIHtcclxuICAgICAgICAkKCcjc3RhcnRGb3JtJykuc2hvdygpO1xyXG4gICAgICAgICQoJyNzdGFydEZvcm0nKS5zdWJtaXQoZnVuY3Rpb24oKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgc29ja2V0LmVtaXQoJ3N0YXJ0Jyk7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gRG9uJ3QgcmVsb2FkIHRoZSBwYWdlXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3RhcnRHYW1lKClcclxuICAgIHtcclxuICAgICAgICAkKCcjbG9iYnknKS5oaWRlKCk7XHJcbiAgICAgICAgJCgnI3BsYXllckxpc3QnKS5lbXB0eSgpO1xyXG5cclxuICAgICAgICBsZXQgcGxheWVyTmFtZXMgPSBbXTtcclxuICAgICAgICBsb2JieVBsYXllcnMuZm9yRWFjaChwbGF5ZXIgPT4gcGxheWVyTmFtZXMucHVzaChwbGF5ZXIubmFtZSkpO1xyXG4gICAgICAgIGNsaWVudCA9IG5ldyBDbGllbnQoKTtcclxuICAgICAgICBjbGllbnQuYmVnaW4oc29ja2V0LCBwbGF5ZXJOYW1lcywgbG9jYWxQbGF5ZXJJZCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEpvaW4gYW4gZXhpc3RpbmcgbG9iYnkgb3IgY3JlYXRlIGEgbmV3IG9uZVxyXG4gICAgc29ja2V0ID0gaW8oKTtcclxuICAgIGxldCBqb2luRm9ybSA9ICQoJyNqb2luRm9ybScpO1xyXG4gICAgbGV0IGxvY2FsRm9ybSA9ICQoJyNsb2NhbEZvcm0nKTtcclxuICAgIGtleSA9IGRvY3VtZW50LmxvY2F0aW9uLnNlYXJjaC5zbGljZSgxKTtcclxuICAgIGlmIChrZXkubGVuZ3RoID09IDYpXHJcbiAgICB7XHJcbiAgICAgICAgaG9zdCA9IGZhbHNlO1xyXG4gICAgICAgICQoJyNqb2luQnV0dG9uJykudGV4dChcIkpvaW4gZ2FtZVwiKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICAvLyBUZXN0aW5nIG9wdGlvbiAtIHF1aWNrIHN0YXJ0IGEgbG9jYWwgZ2FtZVxyXG4gICAgICAgIGxvY2FsRm9ybS5zaG93KCk7XHJcbiAgICAgICAgbG9jYWxGb3JtLnN1Ym1pdChmdW5jdGlvbigpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBzb2NrZXQuY2xvc2UoKTtcclxuICAgICAgICAgICAgam9pbkZvcm0uaGlkZSgpO1xyXG4gICAgICAgICAgICBsb2NhbEZvcm0uaGlkZSgpO1xyXG4gICAgICAgICAgICBsZXQgbnVtUGxheWVycyA9ICQoJyNsb2NhbFBsYXllcnNJbnB1dCcpLnZhbCgpO1xyXG4gICAgICAgICAgICBsb2NhbFBsYXllcklkID0gLTE7XHJcbiAgICAgICAgICAgIGxvYmJ5UGxheWVycyA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bVBsYXllcnM7IGkrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgYWRkUGxheWVyKCdQbGF5ZXIgJyArIChpICsgMSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaG9zdCA9IHRydWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIFNob3cgdGhlIGxvYmJ5IG9uY2UgdGhlIHBsYXllciBqb2luc1xyXG4gICAgam9pbkZvcm0uc2hvdygpO1xyXG4gICAgam9pbkZvcm0uc3VibWl0KGZ1bmN0aW9uKClcclxuICAgIHtcclxuICAgICAgICBqb2luRm9ybS5oaWRlKCk7XHJcbiAgICAgICAgbG9jYWxGb3JtLmhpZGUoKTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgcGxheWVyTmFtZSA9ICQoJyNuYW1lSW5wdXQnKS52YWwoKTtcclxuXHJcbiAgICAgICAgLy8gV2hlbiBJIGVudGVyIHRoZSBsb2JieVxyXG4gICAgICAgIHNvY2tldC5vbignam9pbicsIChnYW1lS2V5LCBwbGF5ZXJzKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgJCgnI2xvYmJ5Jykuc2hvdygpO1xyXG4gICAgICAgICAgICBrZXkgPSBnYW1lS2V5O1xyXG4gICAgICAgICAgICBsb2NhbFBsYXllcklkID0gcGxheWVycy5sZW5ndGg7XHJcbiAgICAgICAgICAgIGxvYmJ5UGxheWVycyA9IFtdO1xyXG4gICAgICAgICAgICBsZXQgdXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArICc/JyArIGtleTtcclxuICAgICAgICAgICAgJCgnI2dhbWVVcmwnKS5odG1sKHVybCkuYXR0cignaHJlZicsIHVybCk7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGxheWVycy5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgYWRkUGxheWVyKHBsYXllcnNbaV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGFkZFBsYXllcihwbGF5ZXJOYW1lKTtcclxuICAgICAgICAgICAgaWYgKHBsYXllcnMubGVuZ3RoID09IDApXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGJlY29tZUhvc3QoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBXaGVuIGFub3RoZXIgcGxheWVyIGVudGVycyB0aGUgbG9iYnlcclxuICAgICAgICBzb2NrZXQub24oJ2FkZFBsYXllcicsIChuYW1lKSA9PlxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgYWRkUGxheWVyKG5hbWUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBXaGVuIGFub3RoZXIgcGxheWVyIGxlYXZlcyB0aGUgbG9iYnlcclxuICAgICAgICBzb2NrZXQub24oJ3JlbW92ZVBsYXllcicsIChpZCkgPT5cclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxvYmJ5UGxheWVyc1tpZF0ubGkucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIGxvYmJ5UGxheWVycy5zcGxpY2UoaWQsIDEpO1xyXG4gICAgICAgICAgICBpZiAoaWQgPT0gMClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbG9iYnlQbGF5ZXJzWzBdLmxpLmFwcGVuZCgnIChob3N0KScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChsb2NhbFBsYXllcklkID4gaWQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxvY2FsUGxheWVySWQtLTtcclxuICAgICAgICAgICAgICAgIGlmIChsb2NhbFBsYXllcklkID09IDApXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgYmVjb21lSG9zdCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFdoZW4gdGhlIHNlcnZlciByZWplY3RzIHRoZSBqb2luXHJcbiAgICAgICAgc29ja2V0Lm9uKCdlcnJvcicsICgpID0+XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgdXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcclxuICAgICAgICAgICAgJCgnI3N0YXJ0VXJsJykuYXR0cignaHJlZicsIHVybCk7XHJcbiAgICAgICAgICAgICQoJyNlcnJvcicpLnNob3coKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gV2hlbiB0aGUgZ2FtZSBiZWdpbnNcclxuICAgICAgICAvLyBUT0RPIC0gbmVlZCB0byBmb3JiaWQgaW5wdXRzIHVudGlsIHJlYWR5LiAgY2FuJ3Qgc2VuZCBhbnkgZ2FtZSBtZXNzYWdlcyB0byB0aGUgc2VydmVyIHVudGlsIGl0IHRlbGxzIHVzIGl0J3MgcmVhZHkuXHJcbiAgICAgICAgc29ja2V0Lm9uKCdzdGFydCcsIHN0YXJ0R2FtZSk7XHJcblxyXG4gICAgICAgIC8vIFNlbmQgZmlyc3QgbWVzc2FnZSB0byB0aGUgc2VydmVyXHJcbiAgICAgICAgc29ja2V0LmVtaXQoJ2pvaW4nLCBwbGF5ZXJOYW1lLCBrZXkpO1xyXG5cclxuICAgICAgICAvLyBEb24ndCByZWxvYWQgdGhlIHBhZ2VcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9KTtcclxufSk7XHJcbiIsIihmdW5jdGlvbihmKXtpZih0eXBlb2YgZXhwb3J0cz09PVwib2JqZWN0XCImJnR5cGVvZiBtb2R1bGUhPT1cInVuZGVmaW5lZFwiKXttb2R1bGUuZXhwb3J0cz1mKCl9ZWxzZSBpZih0eXBlb2YgZGVmaW5lPT09XCJmdW5jdGlvblwiJiZkZWZpbmUuYW1kKXtkZWZpbmUoW10sZil9ZWxzZXt2YXIgZztpZih0eXBlb2Ygd2luZG93IT09XCJ1bmRlZmluZWRcIil7Zz13aW5kb3d9ZWxzZSBpZih0eXBlb2YgZ2xvYmFsIT09XCJ1bmRlZmluZWRcIil7Zz1nbG9iYWx9ZWxzZSBpZih0eXBlb2Ygc2VsZiE9PVwidW5kZWZpbmVkXCIpe2c9c2VsZn1lbHNle2c9dGhpc31nLlByaW9yaXR5UXVldWUgPSBmKCl9fSkoZnVuY3Rpb24oKXt2YXIgZGVmaW5lLG1vZHVsZSxleHBvcnRzO3JldHVybiAoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSh7MTpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG52YXIgQWJzdHJhY3RQcmlvcml0eVF1ZXVlLCBBcnJheVN0cmF0ZWd5LCBCSGVhcFN0cmF0ZWd5LCBCaW5hcnlIZWFwU3RyYXRlZ3ksIFByaW9yaXR5UXVldWUsXG4gIGV4dGVuZCA9IGZ1bmN0aW9uKGNoaWxkLCBwYXJlbnQpIHsgZm9yICh2YXIga2V5IGluIHBhcmVudCkgeyBpZiAoaGFzUHJvcC5jYWxsKHBhcmVudCwga2V5KSkgY2hpbGRba2V5XSA9IHBhcmVudFtrZXldOyB9IGZ1bmN0aW9uIGN0b3IoKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfSBjdG9yLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7IGNoaWxkLnByb3RvdHlwZSA9IG5ldyBjdG9yKCk7IGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7IHJldHVybiBjaGlsZDsgfSxcbiAgaGFzUHJvcCA9IHt9Lmhhc093blByb3BlcnR5O1xuXG5BYnN0cmFjdFByaW9yaXR5UXVldWUgPSBfZGVyZXFfKCcuL1ByaW9yaXR5UXVldWUvQWJzdHJhY3RQcmlvcml0eVF1ZXVlJyk7XG5cbkFycmF5U3RyYXRlZ3kgPSBfZGVyZXFfKCcuL1ByaW9yaXR5UXVldWUvQXJyYXlTdHJhdGVneScpO1xuXG5CaW5hcnlIZWFwU3RyYXRlZ3kgPSBfZGVyZXFfKCcuL1ByaW9yaXR5UXVldWUvQmluYXJ5SGVhcFN0cmF0ZWd5Jyk7XG5cbkJIZWFwU3RyYXRlZ3kgPSBfZGVyZXFfKCcuL1ByaW9yaXR5UXVldWUvQkhlYXBTdHJhdGVneScpO1xuXG5Qcmlvcml0eVF1ZXVlID0gKGZ1bmN0aW9uKHN1cGVyQ2xhc3MpIHtcbiAgZXh0ZW5kKFByaW9yaXR5UXVldWUsIHN1cGVyQ2xhc3MpO1xuXG4gIGZ1bmN0aW9uIFByaW9yaXR5UXVldWUob3B0aW9ucykge1xuICAgIG9wdGlvbnMgfHwgKG9wdGlvbnMgPSB7fSk7XG4gICAgb3B0aW9ucy5zdHJhdGVneSB8fCAob3B0aW9ucy5zdHJhdGVneSA9IEJpbmFyeUhlYXBTdHJhdGVneSk7XG4gICAgb3B0aW9ucy5jb21wYXJhdG9yIHx8IChvcHRpb25zLmNvbXBhcmF0b3IgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgICByZXR1cm4gKGEgfHwgMCkgLSAoYiB8fCAwKTtcbiAgICB9KTtcbiAgICBQcmlvcml0eVF1ZXVlLl9fc3VwZXJfXy5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICB9XG5cbiAgcmV0dXJuIFByaW9yaXR5UXVldWU7XG5cbn0pKEFic3RyYWN0UHJpb3JpdHlRdWV1ZSk7XG5cblByaW9yaXR5UXVldWUuQXJyYXlTdHJhdGVneSA9IEFycmF5U3RyYXRlZ3k7XG5cblByaW9yaXR5UXVldWUuQmluYXJ5SGVhcFN0cmF0ZWd5ID0gQmluYXJ5SGVhcFN0cmF0ZWd5O1xuXG5Qcmlvcml0eVF1ZXVlLkJIZWFwU3RyYXRlZ3kgPSBCSGVhcFN0cmF0ZWd5O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFByaW9yaXR5UXVldWU7XG5cblxufSx7XCIuL1ByaW9yaXR5UXVldWUvQWJzdHJhY3RQcmlvcml0eVF1ZXVlXCI6MixcIi4vUHJpb3JpdHlRdWV1ZS9BcnJheVN0cmF0ZWd5XCI6MyxcIi4vUHJpb3JpdHlRdWV1ZS9CSGVhcFN0cmF0ZWd5XCI6NCxcIi4vUHJpb3JpdHlRdWV1ZS9CaW5hcnlIZWFwU3RyYXRlZ3lcIjo1fV0sMjpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG52YXIgQWJzdHJhY3RQcmlvcml0eVF1ZXVlO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFic3RyYWN0UHJpb3JpdHlRdWV1ZSA9IChmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gQWJzdHJhY3RQcmlvcml0eVF1ZXVlKG9wdGlvbnMpIHtcbiAgICB2YXIgcmVmO1xuICAgIGlmICgob3B0aW9ucyAhPSBudWxsID8gb3B0aW9ucy5zdHJhdGVneSA6IHZvaWQgMCkgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgJ011c3QgcGFzcyBvcHRpb25zLnN0cmF0ZWd5LCBhIHN0cmF0ZWd5JztcbiAgICB9XG4gICAgaWYgKChvcHRpb25zICE9IG51bGwgPyBvcHRpb25zLmNvbXBhcmF0b3IgOiB2b2lkIDApID09IG51bGwpIHtcbiAgICAgIHRocm93ICdNdXN0IHBhc3Mgb3B0aW9ucy5jb21wYXJhdG9yLCBhIGNvbXBhcmF0b3InO1xuICAgIH1cbiAgICB0aGlzLnByaXYgPSBuZXcgb3B0aW9ucy5zdHJhdGVneShvcHRpb25zKTtcbiAgICB0aGlzLmxlbmd0aCA9IChvcHRpb25zICE9IG51bGwgPyAocmVmID0gb3B0aW9ucy5pbml0aWFsVmFsdWVzKSAhPSBudWxsID8gcmVmLmxlbmd0aCA6IHZvaWQgMCA6IHZvaWQgMCkgfHwgMDtcbiAgfVxuXG4gIEFic3RyYWN0UHJpb3JpdHlRdWV1ZS5wcm90b3R5cGUucXVldWUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHRoaXMubGVuZ3RoKys7XG4gICAgdGhpcy5wcml2LnF1ZXVlKHZhbHVlKTtcbiAgICByZXR1cm4gdm9pZCAwO1xuICB9O1xuXG4gIEFic3RyYWN0UHJpb3JpdHlRdWV1ZS5wcm90b3R5cGUuZGVxdWV1ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgaWYgKCF0aGlzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgJ0VtcHR5IHF1ZXVlJztcbiAgICB9XG4gICAgdGhpcy5sZW5ndGgtLTtcbiAgICByZXR1cm4gdGhpcy5wcml2LmRlcXVldWUoKTtcbiAgfTtcblxuICBBYnN0cmFjdFByaW9yaXR5UXVldWUucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIGlmICghdGhpcy5sZW5ndGgpIHtcbiAgICAgIHRocm93ICdFbXB0eSBxdWV1ZSc7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnByaXYucGVlaygpO1xuICB9O1xuXG4gIEFic3RyYWN0UHJpb3JpdHlRdWV1ZS5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgcmV0dXJuIHRoaXMucHJpdi5jbGVhcigpO1xuICB9O1xuXG4gIHJldHVybiBBYnN0cmFjdFByaW9yaXR5UXVldWU7XG5cbn0pKCk7XG5cblxufSx7fV0sMzpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG52YXIgQXJyYXlTdHJhdGVneSwgYmluYXJ5U2VhcmNoRm9ySW5kZXhSZXZlcnNlZDtcblxuYmluYXJ5U2VhcmNoRm9ySW5kZXhSZXZlcnNlZCA9IGZ1bmN0aW9uKGFycmF5LCB2YWx1ZSwgY29tcGFyYXRvcikge1xuICB2YXIgaGlnaCwgbG93LCBtaWQ7XG4gIGxvdyA9IDA7XG4gIGhpZ2ggPSBhcnJheS5sZW5ndGg7XG4gIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgbWlkID0gKGxvdyArIGhpZ2gpID4+PiAxO1xuICAgIGlmIChjb21wYXJhdG9yKGFycmF5W21pZF0sIHZhbHVlKSA+PSAwKSB7XG4gICAgICBsb3cgPSBtaWQgKyAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBoaWdoID0gbWlkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbG93O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBBcnJheVN0cmF0ZWd5ID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBBcnJheVN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICB2YXIgcmVmO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgdGhpcy5jb21wYXJhdG9yID0gdGhpcy5vcHRpb25zLmNvbXBhcmF0b3I7XG4gICAgdGhpcy5kYXRhID0gKChyZWYgPSB0aGlzLm9wdGlvbnMuaW5pdGlhbFZhbHVlcykgIT0gbnVsbCA/IHJlZi5zbGljZSgwKSA6IHZvaWQgMCkgfHwgW107XG4gICAgdGhpcy5kYXRhLnNvcnQodGhpcy5jb21wYXJhdG9yKS5yZXZlcnNlKCk7XG4gIH1cblxuICBBcnJheVN0cmF0ZWd5LnByb3RvdHlwZS5xdWV1ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgdmFyIHBvcztcbiAgICBwb3MgPSBiaW5hcnlTZWFyY2hGb3JJbmRleFJldmVyc2VkKHRoaXMuZGF0YSwgdmFsdWUsIHRoaXMuY29tcGFyYXRvcik7XG4gICAgdGhpcy5kYXRhLnNwbGljZShwb3MsIDAsIHZhbHVlKTtcbiAgICByZXR1cm4gdm9pZCAwO1xuICB9O1xuXG4gIEFycmF5U3RyYXRlZ3kucHJvdG90eXBlLmRlcXVldWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5kYXRhLnBvcCgpO1xuICB9O1xuXG4gIEFycmF5U3RyYXRlZ3kucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5kYXRhW3RoaXMuZGF0YS5sZW5ndGggLSAxXTtcbiAgfTtcblxuICBBcnJheVN0cmF0ZWd5LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZGF0YS5sZW5ndGggPSAwO1xuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgcmV0dXJuIEFycmF5U3RyYXRlZ3k7XG5cbn0pKCk7XG5cblxufSx7fV0sNDpbZnVuY3Rpb24oX2RlcmVxXyxtb2R1bGUsZXhwb3J0cyl7XG52YXIgQkhlYXBTdHJhdGVneTtcblxubW9kdWxlLmV4cG9ydHMgPSBCSGVhcFN0cmF0ZWd5ID0gKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiBCSGVhcFN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICB2YXIgYXJyLCBpLCBqLCBrLCBsZW4sIHJlZiwgcmVmMSwgc2hpZnQsIHZhbHVlO1xuICAgIHRoaXMuY29tcGFyYXRvciA9IChvcHRpb25zICE9IG51bGwgPyBvcHRpb25zLmNvbXBhcmF0b3IgOiB2b2lkIDApIHx8IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgIHJldHVybiBhIC0gYjtcbiAgICB9O1xuICAgIHRoaXMucGFnZVNpemUgPSAob3B0aW9ucyAhPSBudWxsID8gb3B0aW9ucy5wYWdlU2l6ZSA6IHZvaWQgMCkgfHwgNTEyO1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICBzaGlmdCA9IDA7XG4gICAgd2hpbGUgKCgxIDw8IHNoaWZ0KSA8IHRoaXMucGFnZVNpemUpIHtcbiAgICAgIHNoaWZ0ICs9IDE7XG4gICAgfVxuICAgIGlmICgxIDw8IHNoaWZ0ICE9PSB0aGlzLnBhZ2VTaXplKSB7XG4gICAgICB0aHJvdyAncGFnZVNpemUgbXVzdCBiZSBhIHBvd2VyIG9mIHR3byc7XG4gICAgfVxuICAgIHRoaXMuX3NoaWZ0ID0gc2hpZnQ7XG4gICAgdGhpcy5fZW1wdHlNZW1vcnlQYWdlVGVtcGxhdGUgPSBhcnIgPSBbXTtcbiAgICBmb3IgKGkgPSBqID0gMCwgcmVmID0gdGhpcy5wYWdlU2l6ZTsgMCA8PSByZWYgPyBqIDwgcmVmIDogaiA+IHJlZjsgaSA9IDAgPD0gcmVmID8gKytqIDogLS1qKSB7XG4gICAgICBhcnIucHVzaChudWxsKTtcbiAgICB9XG4gICAgdGhpcy5fbWVtb3J5ID0gW107XG4gICAgdGhpcy5fbWFzayA9IHRoaXMucGFnZVNpemUgLSAxO1xuICAgIGlmIChvcHRpb25zLmluaXRpYWxWYWx1ZXMpIHtcbiAgICAgIHJlZjEgPSBvcHRpb25zLmluaXRpYWxWYWx1ZXM7XG4gICAgICBmb3IgKGsgPSAwLCBsZW4gPSByZWYxLmxlbmd0aDsgayA8IGxlbjsgaysrKSB7XG4gICAgICAgIHZhbHVlID0gcmVmMVtrXTtcbiAgICAgICAgdGhpcy5xdWV1ZSh2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgQkhlYXBTdHJhdGVneS5wcm90b3R5cGUucXVldWUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHRoaXMubGVuZ3RoICs9IDE7XG4gICAgdGhpcy5fd3JpdGUodGhpcy5sZW5ndGgsIHZhbHVlKTtcbiAgICB0aGlzLl9idWJibGVVcCh0aGlzLmxlbmd0aCwgdmFsdWUpO1xuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQkhlYXBTdHJhdGVneS5wcm90b3R5cGUuZGVxdWV1ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciByZXQsIHZhbDtcbiAgICByZXQgPSB0aGlzLl9yZWFkKDEpO1xuICAgIHZhbCA9IHRoaXMuX3JlYWQodGhpcy5sZW5ndGgpO1xuICAgIHRoaXMubGVuZ3RoIC09IDE7XG4gICAgaWYgKHRoaXMubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5fd3JpdGUoMSwgdmFsKTtcbiAgICAgIHRoaXMuX2J1YmJsZURvd24oMSwgdmFsKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5wZWVrID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3JlYWQoMSk7XG4gIH07XG5cbiAgQkhlYXBTdHJhdGVneS5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5fbWVtb3J5Lmxlbmd0aCA9IDA7XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5fd3JpdGUgPSBmdW5jdGlvbihpbmRleCwgdmFsdWUpIHtcbiAgICB2YXIgcGFnZTtcbiAgICBwYWdlID0gaW5kZXggPj4gdGhpcy5fc2hpZnQ7XG4gICAgd2hpbGUgKHBhZ2UgPj0gdGhpcy5fbWVtb3J5Lmxlbmd0aCkge1xuICAgICAgdGhpcy5fbWVtb3J5LnB1c2godGhpcy5fZW1wdHlNZW1vcnlQYWdlVGVtcGxhdGUuc2xpY2UoMCkpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fbWVtb3J5W3BhZ2VdW2luZGV4ICYgdGhpcy5fbWFza10gPSB2YWx1ZTtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5fcmVhZCA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgcmV0dXJuIHRoaXMuX21lbW9yeVtpbmRleCA+PiB0aGlzLl9zaGlmdF1baW5kZXggJiB0aGlzLl9tYXNrXTtcbiAgfTtcblxuICBCSGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5fYnViYmxlVXAgPSBmdW5jdGlvbihpbmRleCwgdmFsdWUpIHtcbiAgICB2YXIgY29tcGFyZSwgaW5kZXhJblBhZ2UsIHBhcmVudEluZGV4LCBwYXJlbnRWYWx1ZTtcbiAgICBjb21wYXJlID0gdGhpcy5jb21wYXJhdG9yO1xuICAgIHdoaWxlIChpbmRleCA+IDEpIHtcbiAgICAgIGluZGV4SW5QYWdlID0gaW5kZXggJiB0aGlzLl9tYXNrO1xuICAgICAgaWYgKGluZGV4IDwgdGhpcy5wYWdlU2l6ZSB8fCBpbmRleEluUGFnZSA+IDMpIHtcbiAgICAgICAgcGFyZW50SW5kZXggPSAoaW5kZXggJiB+dGhpcy5fbWFzaykgfCAoaW5kZXhJblBhZ2UgPj4gMSk7XG4gICAgICB9IGVsc2UgaWYgKGluZGV4SW5QYWdlIDwgMikge1xuICAgICAgICBwYXJlbnRJbmRleCA9IChpbmRleCAtIHRoaXMucGFnZVNpemUpID4+IHRoaXMuX3NoaWZ0O1xuICAgICAgICBwYXJlbnRJbmRleCArPSBwYXJlbnRJbmRleCAmIH4odGhpcy5fbWFzayA+PiAxKTtcbiAgICAgICAgcGFyZW50SW5kZXggfD0gdGhpcy5wYWdlU2l6ZSA+PiAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFyZW50SW5kZXggPSBpbmRleCAtIDI7XG4gICAgICB9XG4gICAgICBwYXJlbnRWYWx1ZSA9IHRoaXMuX3JlYWQocGFyZW50SW5kZXgpO1xuICAgICAgaWYgKGNvbXBhcmUocGFyZW50VmFsdWUsIHZhbHVlKSA8IDApIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICB0aGlzLl93cml0ZShwYXJlbnRJbmRleCwgdmFsdWUpO1xuICAgICAgdGhpcy5fd3JpdGUoaW5kZXgsIHBhcmVudFZhbHVlKTtcbiAgICAgIGluZGV4ID0gcGFyZW50SW5kZXg7XG4gICAgfVxuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQkhlYXBTdHJhdGVneS5wcm90b3R5cGUuX2J1YmJsZURvd24gPSBmdW5jdGlvbihpbmRleCwgdmFsdWUpIHtcbiAgICB2YXIgY2hpbGRJbmRleDEsIGNoaWxkSW5kZXgyLCBjaGlsZFZhbHVlMSwgY2hpbGRWYWx1ZTIsIGNvbXBhcmU7XG4gICAgY29tcGFyZSA9IHRoaXMuY29tcGFyYXRvcjtcbiAgICB3aGlsZSAoaW5kZXggPCB0aGlzLmxlbmd0aCkge1xuICAgICAgaWYgKGluZGV4ID4gdGhpcy5fbWFzayAmJiAhKGluZGV4ICYgKHRoaXMuX21hc2sgLSAxKSkpIHtcbiAgICAgICAgY2hpbGRJbmRleDEgPSBjaGlsZEluZGV4MiA9IGluZGV4ICsgMjtcbiAgICAgIH0gZWxzZSBpZiAoaW5kZXggJiAodGhpcy5wYWdlU2l6ZSA+PiAxKSkge1xuICAgICAgICBjaGlsZEluZGV4MSA9IChpbmRleCAmIH50aGlzLl9tYXNrKSA+PiAxO1xuICAgICAgICBjaGlsZEluZGV4MSB8PSBpbmRleCAmICh0aGlzLl9tYXNrID4+IDEpO1xuICAgICAgICBjaGlsZEluZGV4MSA9IChjaGlsZEluZGV4MSArIDEpIDw8IHRoaXMuX3NoaWZ0O1xuICAgICAgICBjaGlsZEluZGV4MiA9IGNoaWxkSW5kZXgxICsgMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNoaWxkSW5kZXgxID0gaW5kZXggKyAoaW5kZXggJiB0aGlzLl9tYXNrKTtcbiAgICAgICAgY2hpbGRJbmRleDIgPSBjaGlsZEluZGV4MSArIDE7XG4gICAgICB9XG4gICAgICBpZiAoY2hpbGRJbmRleDEgIT09IGNoaWxkSW5kZXgyICYmIGNoaWxkSW5kZXgyIDw9IHRoaXMubGVuZ3RoKSB7XG4gICAgICAgIGNoaWxkVmFsdWUxID0gdGhpcy5fcmVhZChjaGlsZEluZGV4MSk7XG4gICAgICAgIGNoaWxkVmFsdWUyID0gdGhpcy5fcmVhZChjaGlsZEluZGV4Mik7XG4gICAgICAgIGlmIChjb21wYXJlKGNoaWxkVmFsdWUxLCB2YWx1ZSkgPCAwICYmIGNvbXBhcmUoY2hpbGRWYWx1ZTEsIGNoaWxkVmFsdWUyKSA8PSAwKSB7XG4gICAgICAgICAgdGhpcy5fd3JpdGUoY2hpbGRJbmRleDEsIHZhbHVlKTtcbiAgICAgICAgICB0aGlzLl93cml0ZShpbmRleCwgY2hpbGRWYWx1ZTEpO1xuICAgICAgICAgIGluZGV4ID0gY2hpbGRJbmRleDE7XG4gICAgICAgIH0gZWxzZSBpZiAoY29tcGFyZShjaGlsZFZhbHVlMiwgdmFsdWUpIDwgMCkge1xuICAgICAgICAgIHRoaXMuX3dyaXRlKGNoaWxkSW5kZXgyLCB2YWx1ZSk7XG4gICAgICAgICAgdGhpcy5fd3JpdGUoaW5kZXgsIGNoaWxkVmFsdWUyKTtcbiAgICAgICAgICBpbmRleCA9IGNoaWxkSW5kZXgyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGNoaWxkSW5kZXgxIDw9IHRoaXMubGVuZ3RoKSB7XG4gICAgICAgIGNoaWxkVmFsdWUxID0gdGhpcy5fcmVhZChjaGlsZEluZGV4MSk7XG4gICAgICAgIGlmIChjb21wYXJlKGNoaWxkVmFsdWUxLCB2YWx1ZSkgPCAwKSB7XG4gICAgICAgICAgdGhpcy5fd3JpdGUoY2hpbGRJbmRleDEsIHZhbHVlKTtcbiAgICAgICAgICB0aGlzLl93cml0ZShpbmRleCwgY2hpbGRWYWx1ZTEpO1xuICAgICAgICAgIGluZGV4ID0gY2hpbGRJbmRleDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdm9pZCAwO1xuICB9O1xuXG4gIHJldHVybiBCSGVhcFN0cmF0ZWd5O1xuXG59KSgpO1xuXG5cbn0se31dLDU6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xudmFyIEJpbmFyeUhlYXBTdHJhdGVneTtcblxubW9kdWxlLmV4cG9ydHMgPSBCaW5hcnlIZWFwU3RyYXRlZ3kgPSAoZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIEJpbmFyeUhlYXBTdHJhdGVneShvcHRpb25zKSB7XG4gICAgdmFyIHJlZjtcbiAgICB0aGlzLmNvbXBhcmF0b3IgPSAob3B0aW9ucyAhPSBudWxsID8gb3B0aW9ucy5jb21wYXJhdG9yIDogdm9pZCAwKSB8fCBmdW5jdGlvbihhLCBiKSB7XG4gICAgICByZXR1cm4gYSAtIGI7XG4gICAgfTtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5kYXRhID0gKChyZWYgPSBvcHRpb25zLmluaXRpYWxWYWx1ZXMpICE9IG51bGwgPyByZWYuc2xpY2UoMCkgOiB2b2lkIDApIHx8IFtdO1xuICAgIHRoaXMuX2hlYXBpZnkoKTtcbiAgfVxuXG4gIEJpbmFyeUhlYXBTdHJhdGVneS5wcm90b3R5cGUuX2hlYXBpZnkgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaSwgaiwgcmVmO1xuICAgIGlmICh0aGlzLmRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChpID0gaiA9IDEsIHJlZiA9IHRoaXMuZGF0YS5sZW5ndGg7IDEgPD0gcmVmID8gaiA8IHJlZiA6IGogPiByZWY7IGkgPSAxIDw9IHJlZiA/ICsraiA6IC0taikge1xuICAgICAgICB0aGlzLl9idWJibGVVcChpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZvaWQgMDtcbiAgfTtcblxuICBCaW5hcnlIZWFwU3RyYXRlZ3kucHJvdG90eXBlLnF1ZXVlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB0aGlzLmRhdGEucHVzaCh2YWx1ZSk7XG4gICAgdGhpcy5fYnViYmxlVXAodGhpcy5kYXRhLmxlbmd0aCAtIDEpO1xuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQmluYXJ5SGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5kZXF1ZXVlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGxhc3QsIHJldDtcbiAgICByZXQgPSB0aGlzLmRhdGFbMF07XG4gICAgbGFzdCA9IHRoaXMuZGF0YS5wb3AoKTtcbiAgICBpZiAodGhpcy5kYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuZGF0YVswXSA9IGxhc3Q7XG4gICAgICB0aGlzLl9idWJibGVEb3duKDApO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9O1xuXG4gIEJpbmFyeUhlYXBTdHJhdGVneS5wcm90b3R5cGUucGVlayA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmRhdGFbMF07XG4gIH07XG5cbiAgQmluYXJ5SGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmRhdGEubGVuZ3RoID0gMDtcbiAgICByZXR1cm4gdm9pZCAwO1xuICB9O1xuXG4gIEJpbmFyeUhlYXBTdHJhdGVneS5wcm90b3R5cGUuX2J1YmJsZVVwID0gZnVuY3Rpb24ocG9zKSB7XG4gICAgdmFyIHBhcmVudCwgeDtcbiAgICB3aGlsZSAocG9zID4gMCkge1xuICAgICAgcGFyZW50ID0gKHBvcyAtIDEpID4+PiAxO1xuICAgICAgaWYgKHRoaXMuY29tcGFyYXRvcih0aGlzLmRhdGFbcG9zXSwgdGhpcy5kYXRhW3BhcmVudF0pIDwgMCkge1xuICAgICAgICB4ID0gdGhpcy5kYXRhW3BhcmVudF07XG4gICAgICAgIHRoaXMuZGF0YVtwYXJlbnRdID0gdGhpcy5kYXRhW3Bvc107XG4gICAgICAgIHRoaXMuZGF0YVtwb3NdID0geDtcbiAgICAgICAgcG9zID0gcGFyZW50O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgQmluYXJ5SGVhcFN0cmF0ZWd5LnByb3RvdHlwZS5fYnViYmxlRG93biA9IGZ1bmN0aW9uKHBvcykge1xuICAgIHZhciBsYXN0LCBsZWZ0LCBtaW5JbmRleCwgcmlnaHQsIHg7XG4gICAgbGFzdCA9IHRoaXMuZGF0YS5sZW5ndGggLSAxO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBsZWZ0ID0gKHBvcyA8PCAxKSArIDE7XG4gICAgICByaWdodCA9IGxlZnQgKyAxO1xuICAgICAgbWluSW5kZXggPSBwb3M7XG4gICAgICBpZiAobGVmdCA8PSBsYXN0ICYmIHRoaXMuY29tcGFyYXRvcih0aGlzLmRhdGFbbGVmdF0sIHRoaXMuZGF0YVttaW5JbmRleF0pIDwgMCkge1xuICAgICAgICBtaW5JbmRleCA9IGxlZnQ7XG4gICAgICB9XG4gICAgICBpZiAocmlnaHQgPD0gbGFzdCAmJiB0aGlzLmNvbXBhcmF0b3IodGhpcy5kYXRhW3JpZ2h0XSwgdGhpcy5kYXRhW21pbkluZGV4XSkgPCAwKSB7XG4gICAgICAgIG1pbkluZGV4ID0gcmlnaHQ7XG4gICAgICB9XG4gICAgICBpZiAobWluSW5kZXggIT09IHBvcykge1xuICAgICAgICB4ID0gdGhpcy5kYXRhW21pbkluZGV4XTtcbiAgICAgICAgdGhpcy5kYXRhW21pbkluZGV4XSA9IHRoaXMuZGF0YVtwb3NdO1xuICAgICAgICB0aGlzLmRhdGFbcG9zXSA9IHg7XG4gICAgICAgIHBvcyA9IG1pbkluZGV4O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2b2lkIDA7XG4gIH07XG5cbiAgcmV0dXJuIEJpbmFyeUhlYXBTdHJhdGVneTtcblxufSkoKTtcblxuXG59LHt9XX0se30sWzFdKSgxKVxufSk7Il19
