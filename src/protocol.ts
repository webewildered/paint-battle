import { Rules } from './game';

// Types used in client/server communication
export class GameEvent
{
    constructor(public event: string, public args: any[]) {}
}

export class GameLog
{
    constructor(public players: string[], public rules: Rules, public events: GameEvent[]) {}
}