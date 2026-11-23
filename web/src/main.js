import {Game} from './game/game.js';

const app=document.getElementById('app');
const bootstrap=document.getElementById('bootstrap');
if(bootstrap)bootstrap.remove();
new Game({app}).start();
