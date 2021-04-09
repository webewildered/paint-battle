import * as PIXI from 'pixi.js-legacy';
import { Point, Aabb, Board } from './board';

$(function()
{
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
    
    let palette = [
        [0x3d, 0x1d, 0xef, 0xff],
        [0xff, 0xff, 0xff, 0xff],
        [0xee, 0x12, 0x12, 0xff],
    ];
    let c = 0;
    let e = 1;

    let app = new PIXI.Application({
        width: 800, height: 800, backgroundColor: 0xeeeeee, resolution: window.devicePixelRatio || 1, antialias: true
    });
    document.body.appendChild(app.view);

    let board = new Board(149, 149);
    board.clear(e);
    board.drawAabb(new Aabb(new Point(10, 10), new Point(20, 20)), c);

    let path = board.pathf(new Point(10, 10), new Point(19, 11), (point: Point) => board.get(point) === c);
    if (path)
    {
        for (let i = 0; i < path.length; i++)
        {
            console.log(i + '\t' + path[i]);
            board.set(path[i], 2);
        }
    }

    let scale = 2;
    let sprite = new PIXI.Sprite;
    sprite.x = 10;
    sprite.y = 10;
    sprite.texture = rtt(board, palette);
    sprite.interactive = true;
    sprite.scale.set(4, 4);
    app.stage.addChild(sprite);

    let text = new PIXI.Text('', {fontFamily : 'Arial', fontSize: 24, fill : 0x000000});
    app.stage.addChild(text);
    text.y = sprite.y + sprite.height + 10;
    text.x = sprite.x + 10;
    text.text = board.count(0)[0].toString();

    sprite.on('mousedown', (event: PIXI.InteractionEvent) =>
    {
        text.text = board.count(0)[0].toString();
        sprite.texture = rtt(board, palette);
    });
});