# QuiverGL — Development Notes

## Toolchain
- Node 22+, npm
- Three.js / WebGL2
- box3d-wasm (single-thread default for WebView and ordinary hosted pages)
- Vite bundles the **same** web application for desktop and Android.
- Android Gradle uses the Vite output as packaged assets. App still checks published APK updates.

## Desktop
```sh
cd web
npm install
npm run dev
```

## Android release build
CI runs `npm install --no-audit --no-fund` and `npm run build` within `web`, then copies `web/dist` to `app/src/main/assets/web` before invoking Gradle. The Android WebView serves these files from `https://appassets.androidplatform.net/assets/web/` using WebViewAssetLoader so ES modules and WASM resources resolve like normal web pages.

Do not load `file://` URLs for this app. Do not make debug lines the only rendering path.

## Coordinates and initial test
GLB avatar authored Y-up, origin at feet. The world uses meters; reference icosahedron root edge 128 m. The initial static test platform is an AABB indexed by the solidity octree and installed as a static Box3D shape; this confirms physics authority plumbing before expanding to streamed globe occupancy.

## Remaining work
- Sweep-based static AABB proxy streaming/rebasing against full globe geometry.
- Planet-local gravitational frames and player motion from Box3D pose.
- Continuous LOD selection and strict distance caps with robust horizon/frustum rejection.
- User-tunable diagnostics, loaded model variants, and physics stress tests.
