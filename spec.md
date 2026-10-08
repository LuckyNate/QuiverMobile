# QuiverMobile — Engine Specification

**Version:** 0.1.0 (Planning)  
**Status:** Draft  
**Parent concept:** QuiverGL

## 1. Purpose

QuiverMobile is a lightweight, native Android 3D game engine designed for large, continuous outdoor environments.

Android is the initial platform. Native VR is the intended next platform, using the same engine core.

The engine prioritizes rendering efficiency, spatial organization, simplicity, and extensibility.

## 2. Core Architecture

- Native C++ engine core.
- Kotlin Android application shell.
- Android NDK build system.
- Rendering API abstraction supporting an initial Android renderer and future VR requirements.
- Separation between world simulation, rendering, physics, input, and platform services.
- GitHub Actions for APK compilation and distribution.

## 3. World Representation

- Planetary world based on an icosphere.
- Recursive triangular subdivision.
- Target maximum terrain resolution of approximately 1 meter.
- Hierarchical spatial partitioning for world queries.
- Large-world coordinate handling to maintain local precision.
- Continuous world navigation without predefined map boundaries.

## 4. Rendering

- Native GPU-accelerated 3D rendering.
- Hierarchical visibility determination.
- Terrain detail derived from the spatial hierarchy.
- Reduced geometric complexity at distance.
- Outdoor skybox and distance fog.
- Frustum culling.
- Efficient geometry batching.
- Texture and geometry resource management.
- Configurable draw distance.

Rendering should scale with visible complexity rather than total world size.

## 5. Physics and Collision

- Spatial partitioning supplies broad-phase collision candidates.
- Solid world objects maintain collision representations.
- Physics operates on nearby relevant objects.
- Box2D integration is proposed; its role in the 3D simulation requires definition.
- Physics implementation must remain independent of rendering.

## 6. Camera and Input

- Touchscreen input.
- Configurable virtual controls.
- Camera movement independent of world simulation.
- Support for perspective cameras.
- Camera architecture capable of later stereoscopic rendering.
- Hardware controller support as a future capability.

## 7. VR Path

- Native OpenXR integration as a future development phase.
- Head tracking and stereoscopic cameras.
- VR controller input.
- Frame timing and rendering optimized for headset requirements.
- Shared world simulation and asset systems between Android and VR.

VR support must not require replacing the underlying world architecture.

## 8. Asset Pipeline

- Blender-compatible modeling workflow.
- Importable mesh, material, and texture formats.
- Reusable asset definitions.
- Resource loading independent of scene management.
- Asset streaming as a future capability.

## 9. Performance

- Target a broad range of modern Android GPU capabilities.
- Minimize draw calls and unnecessary geometry processing.
- Avoid loading or simulating distant objects without need.
- Manage memory and thermal load.
- Make frame timing measurable.
- Adjustable graphics quality and rendering distance.

## 10. Initial Milestone

The first working APK should:

1. Launch successfully on Android.
2. Initialize the native engine.
3. Display an outdoor 3D environment with a skybox.
4. Render simple terrain.
5. Permit touchscreen camera movement.
6. Maintain a functioning render loop.
7. Build automatically through GitHub Actions.

## 11. Deferred Decisions

- Initial rendering backend: OpenGL ES or Vulkan.
- Exact spatial partition implementation.
- Box2D's responsibilities in a 3D environment.
- World terrain generation and storage.
- Asset format and conversion pipeline.
- Minimum Android API level.
- Initial performance targets and reference devices.

Decisions remain open until explicitly agreed upon.
