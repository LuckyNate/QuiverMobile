// QuiverMobile world setup. Planet dimensions and biome contents live here.
import {TERRAIN_AMPLITUDE_RATIO} from './terrain-height.js';
export const WORLD_SETUP=Object.freeze({
 rootEdgeMeters:256,
 finestTerrainMeters:1,
 collisionResolutionMeters:1,
 collisionChunkMeters:32,
 resourceCellMeters:32,
 resourceStreamRootFraction:.25,
 cameraMaxZoomDiameters:2,
 cameraFarClipDiameters:6,
 seaLevelOffsetMeters:-1
});
const radius=WORLD_SETUP.rootEdgeMeters*Math.sqrt(10+2*Math.sqrt(5))/4;
const diameter=radius*2;
const octreeHalfSize=2**Math.ceil(Math.log2(radius*(1+TERRAIN_AMPLITUDE_RATIO)+64));
export const WORLD_SCALE=Object.freeze({
 radius,diameter,octreeHalfSize,
 maxTerrainLod:Math.max(0,Math.round(Math.log2(WORLD_SETUP.rootEdgeMeters/WORLD_SETUP.finestTerrainMeters))),
 octreeMaxDepth:Math.max(0,Math.round(Math.log2(2*octreeHalfSize/WORLD_SETUP.collisionResolutionMeters))),
 cameraMaxZoomMeters:diameter*WORLD_SETUP.cameraMaxZoomDiameters,
 cameraFarMeters:diameter*WORLD_SETUP.cameraFarClipDiameters,
 resourceStreamMeters:WORLD_SETUP.rootEdgeMeters*WORLD_SETUP.resourceStreamRootFraction
});
// Edit each face's name, ground color, densities, and optional grass style here.
// null groundColor uses the original altitude-driven sand/green/rock palette.
// Density units: expected resources per square kilometer. Empty {} spawns none.
export const STARTER_BIOME_FACE=6;
const biomeDefinitions=[
 {name:'Face 00',groundColor:0xc26665,resources:{}},
 {name:'Face 01',groundColor:0xd4a15c,resources:{}},
 {name:'Face 02',groundColor:0xcac756,resources:{}},
 {name:'Face 03',groundColor:0x9bca68,resources:{}},
 {name:'Face 04',groundColor:0x58ad80,resources:{}},
 {name:'Face 05',groundColor:0x59bba9,resources:{}},
 {name:'Meadows',groundColor:null,resources:{tree:4500,grass:36000,stick:12000,stone:8000}},
 {name:'Face 07',groundColor:0x579fcd,resources:{}},
 {name:'Face 08',groundColor:0x6477ca,resources:{}},
 {name:'Face 09',groundColor:0x956ac8,resources:{}},
 {name:'Face 10',groundColor:0xc06caa,resources:{}},
 {name:'Face 11',groundColor:0xd27289,resources:{}},
 {name:'Face 12',groundColor:0x8f6956,resources:{}},
 {name:'Face 13',groundColor:0x9ea565,resources:{}},
 {name:'Face 14',groundColor:0x59aaa9,resources:{}},
 {name:'Face 15',groundColor:0xbd9bc7,resources:{}},
 {name:'Face 16',groundColor:0xb18b55,resources:{}},
 {name:'Face 17',groundColor:0x75a86c,resources:{}},
 {name:'Face 18',groundColor:0x9e79bc,resources:{}},
 {name:'Face 19',groundColor:0xcf899c,resources:{}}
];
export const BIOME_SETUP=Object.freeze(biomeDefinitions.map((entry,id)=>Object.freeze({
 id,name:entry.name,groundColor:entry.groundColor,
 resourceDensity:Object.freeze({...entry.resources}),
 grassStyle:Object.freeze({...entry.grassStyle})
})));
