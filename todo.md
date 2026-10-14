# TODO

- [ ] Add an Admin-tab control for WebGL canvas render resolution/pixel ratio, independently adjustable from terrain LOD. Keep the CSS canvas size, touch coordinates, camera field of view, and gameplay unchanged. Make the chosen value persistent between app launches. Do not implement until separately approved.

- [ ] Implement approved fine-LOD-owned terrain seams in `web/src/world.js`: identify mixed-LOD neighbors (including cross-face); use finer-node normalized-midpoint boundary positions and shared height samples; triangulate the coarse border only; account for neighbor edge configuration in cache identity/invalidation. Preserve streaming, coarse interiors, physics, water, and observed frame rate. Documented 2026-10-13; implementation pending.
