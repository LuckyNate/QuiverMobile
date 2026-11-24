// QuiverMobile world setup. Planet dimensions and biome contents live here.
import {TERRAIN_AMPLITUDE_RATIO} from './terrain-height.js';
export const WORLD_SETUP=Object.freeze({
 rootEdgeMeters:256,
 finestTerrainMeters:1,
 terrainLodBandMeters:20,
 terrainLodRefreshMeters:4,
 collisionResolutionMeters:1,
 collisionChunkMeters:32,
 resourceCellMeters:32,
 // Half the root edge, 128 m: further out the terrain mesh is coarser than the
 // surface resources are placed on, so trees stop meeting the ground.
 resourceStreamRootFraction:.5,
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
// Fixed 20 m horizontal bands: LOD 8 within 20 m, then one level lower
// for each successive ring, down to LOD 0 beyond 160 m.
// Resources stand on the analytic surface, not on the mesh, so the ground under
// them has to be nearly as fine as the surface itself. Inside the resource ring
// the bands stop at LOD 6, a 4 m triangle: without that floor the mesh is 64 m
// facets out there and a 6 m pine hangs over the flat it is standing on.
export function terrainLodAtHorizontalDistance(meters,maxLod=WORLD_SCALE.maxTerrainLod){
 const band=Math.floor(Math.max(0,meters)/WORLD_SETUP.terrainLodBandMeters);
 const byDistance=Math.max(0,maxLod-band);
 if(meters>WORLD_SCALE.resourceStreamMeters)return byDistance;
 return Math.max(byDistance,Math.max(0,maxLod-2));
}
// Edit each face's name, ground color, densities, and optional grass style here.
// null groundColor uses the original altitude-driven sand/green/rock palette.
// Density units: resources per 32 m resource cell, the unit the world spawns in.
// Trees that would grow into a neighbour are pushed apart at spawn, so this figure is
// exactly what the cell plants.
// A fraction is a chance per cell: boar:0.7 is one boar in seven cells of ten.
// Empty {} spawns none.
export const STARTER_BIOME_FACE=6;
const biomeDefinitions=[
 {name:'Face 00',groundColor:0xc26665,resources:{}},
 {name:'Face 01',groundColor:0xd4a15c,resources:{}},
 {name:'Face 02',groundColor:0xcac756,resources:{}},
 {name:'Face 03',groundColor:0x9bca68,resources:{}},
 {name:'Face 04',groundColor:0x58ad80,resources:{}},
 {name:'Face 05',groundColor:0x59bba9,resources:{}},
 {name:'Meadows',groundColor:null,resources:{tree:18,grass:36,stick:12,stone:8,boar:0.7}},
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
