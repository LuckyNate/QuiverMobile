import {Game} from './game/game.js';

// Bootstrap only: find the mount point and start the game. Systems, panels,
// readiness and the frame loop all live in their own modules under game/,
// engine/, gui/, ui/ and console/.
const app=document.getElementById('app');
const bootstrap=document.getElementById('bootstrap');
if(bootstrap)bootstrap.remove();
new Game({app}).start();
