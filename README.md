## CyberPunk Interactive Particle System

<img width="1920" height="1080" alt="Screenshot from 2026-02-18 13-42-43" src="https://github.com/user-attachments/assets/3b2b3b4f-846c-42a0-b332-2203baca423d" />


## Hnad Gesture 3D Models

<img width="1920" height="1080" alt="Screenshot from 2026-03-05 19-52-04" src="https://github.com/user-attachments/assets/15939bc3-a497-4602-a753-fcfddf484f0b" />

```
Create a demo using Mediapipe hand tracking and vanilla JS. Show a full width/height webcam feed on the page (mirrored). draw hand landmarks on top of the user's hands. Keep it simple and ensure that it runs locally. We will add more features later on
```
Use the above prompt for the first prompt.

## Gesture-Controlled WebGL Interactive App

<img width="1893" height="1000" alt="image" src="https://github.com/user-attachments/assets/cfb5a656-470d-4658-9955-6788ea5b44ba" />

```
Role: You are an expert creative coder, specializing in React, Three.js (React Three Fiber), WebGL Shaders, and Computer Vision (MediaPipe).

Task: Build a web application that uses the user's webcam to track their hands. When two hands are held up, it creates a "Dynamic Frame" (a bounding box) between them. Inside this bounding box, a WebGL shader applies various visual effects to the camera feed. Outside the box, the normal camera feed is shown. Bringing the hands together (clapping/praying gesture) switches the effect.

Tech Stack:

React 18 (Vite)

Tailwind CSS

@react-three/fiber and three

@mediapipe/tasks-vision


1. Application Architecture & State
`App.tsx`: The main component. Manages the hidden <video> element, initializes MediaPipe, runs the tracking loop via requestAnimationFrame, handles the 2D canvas overlay for drawing hand skeletons, and renders the 3D <Canvas>.

`EffectsCanvas.tsx`: A React Three Fiber component that renders a full-screen <planeGeometry args={[2, 2]} /> with a custom <shaderMaterial>.

State: Track videoReady, modelsReady, effectIndex (0 to 5), errorMsg, and a boxRef (a mutable ref array [xMin, yMin, xMax, yMax] in normalized 0-1 coordinates).

 

2. MediaPipe & Hand Tracking
Load FilesetResolver and HandLandmarker from @mediapipe/tasks-vision (use the CDN URL https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm).

Configure HandLandmarker for numHands: 2, runningMode: "VIDEO", and delegate: "GPU".

Request webcam access (1280x720 ideal).

In the tracking loop, call landmarker.detectForVideo(video, performance.now()).

 

3. 2D Overlay & Gestures
Skeleton Drawing: On a 2D <canvas> positioned absolutely over the 3D canvas, draw the hand landmarks.

Nodes: Solid #ffffff, radius 3.

Connections: rgba(255, 255, 255, 0.6), line width 2.

Note: Remember to flip the X coordinate (`1 - x`) for a mirrored experience.

Dynamic Box Calculation: If exactly 2 hands are detected:

Find the center point between the two hands using landmark 9 (middle finger MCP) of both hands.

Calculate the distance between these two points.

Box Width = distance * 1.2. Box Height = Box Width * 0.8.

Update boxRef.current with [xMin, yMin, xMax, yMax].

Clap Gesture to Switch:

If the distance between the hands is < 0.1, trigger an effect switch (effectIndex = (effectIndex + 1) % 6).

Implement a 1000ms cooldown using a ref so it doesn't switch rapidly.

While clapping (distance < 0.1), hide the box (boxRef.current = [0,0,0,0]).

 

4. WebGL Shader (EffectsCanvas.tsx)
Pass video (as a THREE.VideoTexture), boxRef, and effectIndex to this component.

Uniforms: uTexture, uTime, uBox (Vector4), uEffect (float), uResolution (Vector2).

CRITICAL WEBGL RULE: Do not sample textures (texture2D) inside conditional if statements. Pre-calculate all texture samples at the top of the fragment shader, then use if (uEffect < 0.5) etc., to select the final color.

Base Logic:

Flip UVs horizontally for a mirror effect.

Check if the current pixel is inside uBox. If not, or if uBox.z <= 0.0, output the base video color and return.

Draw a subtle white border (thickness 0.005) exactly on the edge of the uBox.

 

The 6 Effects (Implement exactly as described):
1. Burning (`uEffect < 0.5`):

Displace UVs using Simplex 2D noise and uTime.

Calculate luminance of the displaced texture.

Map luminance to a fire gradient: vec3(0.1, 0, 0) -> vec3(1, 0, 0) -> vec3(1, 0.5, 0) -> vec3(1, 1, 0).

2. Glow (`uEffect < 1.5`):

High contrast stark silhouette.

Boost luminance: pow(lum, 1.2) * 1.5.

Add grain to edges: float edgeNoise = snoise(uv * 200.0 + uTime * 0.5) * 0.15;

Core: smoothstep(0.5 + edgeNoise, 0.7 + edgeNoise, lum).

Halo: smoothstep(0.2 + edgeNoise, 0.6 + edgeNoise, lum).

Mix pure black background with a bright cyan halo vec3(0.4, 0.9, 1.0), then mix with pure white core.

3. Thermal Vision (`uEffect < 2.5`):

Bold, smooth ramp.

Contrast: float t = clamp((lum - 0.1) * 1.2, 0.0, 1.0);

Colors: vec3(0,0,0.2) (dark blue) -> vec3(0.1,0,1) (blue) -> vec3(0,1,0) (green) -> vec3(1,0.9,0) (yellow) -> vec3(1,0,0) (red).

4. Pixelated (`uEffect < 3.5`):

Downsample UVs to a grid (e.g., 80 pixels across, accounting for aspect ratio).

Sample texture at grid UVs. Calculate luminance.

Draw a circle inside each grid cell. If distance to cell center < 0.35, color is vec3(0, lum > 0.25 ? 1.0 : 0.0, 0). Else, dark green vec3(0, 0.1, 0).

5. Glitch (`uEffect < 4.5`):

Chromatic aberration: Offset R, G, B channels using noise and uTime.

Add horizontal scanlines: -= sin(uv.y * 800.0 + uTime * 10.0) * 0.05.

6. Neon Edges (`uEffect < 5.5`):

Implement a Sobel edge detection filter (sample 8 surrounding pixels).

Color the edges with cyberpunk cyan/green: vec3(0.1, 1.0, 0.8) * edge * 2.5.

Add 30% of the base video color back in.

 

5. UI & Styling
Full-screen, bg-zinc-950, overflow-hidden.

Loading State: Show a spinner and "Waiting for Camera..." / "Loading AI Models..." text.

Error State: Show a red error icon and the error message with a "Reload Page" button.

Active State: NO text overlays, NO UI buttons. Just the video feed, the silver hand tracking lines, and the dynamic shader box. Everything is controlled via the clap gesture.
```

Created this using `Antigravity`, used the above prompt to create this.
