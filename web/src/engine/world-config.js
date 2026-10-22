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
// Face 06 is the only populated Meadows. All other faces are distinct colors
// with no resources. null means use the original elevation-based terrain palette.
// Resource densities are expected entities per square kilometer.
export const STARTER_BIOME_FACE=6;
const faceColors=[0xc26665,0xd4a15c,0xcac756,0x9bca68,0x58ad80,
 0x59bba9,null,0x579fcd,0x6477ca,0x956ac8,0xc06caa,0xd27289,
 0x8f6956,0x9ea565,0x59aaa9,0xbd9bc7,0xb18b55,0x75a86c,0x9e79bc,0xcf899c];
export const BIOME_SETUP=Object.freeze(faceColors.map((groundColor,id)=>Object.freeze({
 id,name:id===STARTER_BIOME_FACE?'Meadows':`Face ${String(id).padStart(2,'0')}`,
 groundColor,
 resourceDensity:Object.freeze(id===STARTER_BIOME_FACE?{tree:4500,grass:36000,stick:12000,stone:8000}:{}),
 grassStyle:Object.freeze({})
})));
