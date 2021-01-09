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