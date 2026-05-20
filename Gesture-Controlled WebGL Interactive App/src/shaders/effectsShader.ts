// Custom shaders for the webcam hand-tracking application.
// Implements 6 visual effects in GLSL with all texture sampling pre-calculated.

export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec4 uBox; // [xMin, yMin, xMax, yMax] in normalized mirrored UV space
  uniform float uEffect; // effectIndex: 0 to 5
  uniform vec2 uResolution; // Screen resolution

  varying vec2 vUv;

  // --- Simplex 2D Noise by Ashima Arts ---
  vec3 permute(vec3 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,   // (3.0-sqrt(3.0))/6.0
      0.366025403784439,   // 0.5*(sqrt(3.0)-1.0)
      -0.577350269189626,  // -1.0 + 2.0 * C.x
      0.024390243902439    // 1.0 / 41.0
    );

    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx) ;

    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0) )
      + i.x + vec3(0.0, i1.x, 1.0) );

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 a0 = x - floor(x + 0.5);

    vec3 norm = 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    return 130.0 * dot(m, g * norm);
  }

  // --- Palette Helper Functions ---
  vec3 firePalette(float t) {
    vec3 c0 = vec3(0.1, 0.0, 0.0); // Dark red
    vec3 c1 = vec3(1.0, 0.0, 0.0); // Red
    vec3 c2 = vec3(1.0, 0.5, 0.0); // Orange
    vec3 c3 = vec3(1.0, 1.0, 0.0); // Yellow
    
    if (t < 0.33) {
      return mix(c0, c1, t / 0.33);
    } else if (t < 0.66) {
      return mix(c1, c2, (t - 0.33) / 0.33);
    } else {
      return mix(c2, c3, clamp((t - 0.66) / 0.34, 0.0, 1.0));
    }
  }

  vec3 thermalPalette(float t) {
    vec3 c0 = vec3(0.0, 0.0, 0.2); // Dark blue
    vec3 c1 = vec3(0.1, 0.0, 1.0); // Blue
    vec3 c2 = vec3(0.0, 1.0, 0.0); // Green
    vec3 c3 = vec3(1.0, 0.9, 0.0); // Yellow
    vec3 c4 = vec3(1.0, 0.0, 0.0); // Red
    
    if (t < 0.25) {
      return mix(c0, c1, t / 0.25);
    } else if (t < 0.5) {
      return mix(c1, c2, (t - 0.25) / 0.25);
    } else if (t < 0.75) {
      return mix(c2, c3, (t - 0.5) / 0.25);
    } else {
      return mix(c3, c4, clamp((t - 0.75) / 0.25, 0.0, 1.0));
    }
  }

  void main() {
    // 1. Flip UV horizontally for mirror mode
    vec2 uv = vUv;
    uv.x = 1.0 - uv.x;

    // --- PRE-CALCULATE ALL TEXTURE UV COORDINATES ---
    
    // Base & generic calculations
    vec2 texel = 1.0 / uResolution;

    // A. Burning UV
    vec2 displace = vec2(
      snoise(uv * 10.0 + uTime * 0.8),
      snoise(uv * 10.0 - uTime * 0.8 + 2.0)
    ) * 0.05;
    vec2 uvBurn = uv + displace;

    // B. Pixelated UV
    float aspect = uResolution.x / uResolution.y;
    float gridX = 80.0;
    float gridY = gridX / aspect;
    vec2 cellUv = floor(uv * vec2(gridX, gridY)) / vec2(gridX, gridY);
    vec2 cellCenterUv = cellUv + vec2(0.5) / vec2(gridX, gridY);

    // C. Glitch UV (chromatic aberration offsets)
    float glitchNoise = snoise(vec2(uTime * 15.0, uv.y * 10.0));
    float shift = 0.0;
    if (glitchNoise > 0.6) {
      shift = glitchNoise * 0.03;
    } else {
      shift = 0.005 * sin(uTime * 5.0);
    }
    vec2 uvRed = uv + vec2(shift, 0.0);
    vec2 uvGreen = uv;
    vec2 uvBlue = uv - vec2(shift, 0.0);

    // D. Sobel/Neon Edge UVs (8 surrounding + center)
    vec2 uv00 = uv + vec2(-1.0,  1.0) * texel;
    vec2 uv01 = uv + vec2( 0.0,  1.0) * texel;
    vec2 uv02 = uv + vec2( 1.0,  1.0) * texel;
    vec2 uv10 = uv + vec2(-1.0,  0.0) * texel;
    vec2 uv11 = uv;
    vec2 uv12 = uv + vec2( 1.0,  0.0) * texel;
    vec2 uv20 = uv + vec2(-1.0, -1.0) * texel;
    vec2 uv21 = uv + vec2( 0.0, -1.0) * texel;
    vec2 uv22 = uv + vec2( 1.0, -1.0) * texel;

    // --- PRE-CALCULATE ALL TEXTURE SAMPLES (CRITICAL WEBGL RULE) ---
    vec4 baseSample  = texture2D(uTexture, uv);
    vec4 burnSample  = texture2D(uTexture, uvBurn);
    vec4 pixelSample = texture2D(uTexture, cellCenterUv);
    
    // Chromatic samples
    float rGlitch = texture2D(uTexture, uvRed).r;
    float gGlitch = texture2D(uTexture, uvGreen).g;
    float bGlitch = texture2D(uTexture, uvBlue).b;

    // Sobel samples
    vec4 s00 = texture2D(uTexture, uv00);
    vec4 s01 = texture2D(uTexture, uv01);
    vec4 s02 = texture2D(uTexture, uv02);
    vec4 s10 = texture2D(uTexture, uv10);
    vec4 s11 = baseSample; // Center is baseSample
    vec4 s12 = texture2D(uTexture, uv12);
    vec4 s20 = texture2D(uTexture, uv20);
    vec4 s21 = texture2D(uTexture, uv21);
    vec4 s22 = texture2D(uTexture, uv22);

    // --- BOX AND BORDER CHECK ---
    // If not inside the box or if box is hidden (uBox.z <= 0.0), output clean feed
    if (uBox.z <= 0.0 || uv.x < uBox.x || uv.x > uBox.z || uv.y < uBox.y || uv.y > uBox.w) {
      gl_FragColor = baseSample;
      return;
    }

    // Draw subtle white border (thickness 0.005) on the edge of the box
    if (uv.x - uBox.x < 0.005 || uBox.z - uv.x < 0.005 || uv.y - uBox.y < 0.005 || uBox.w - uv.y < 0.005) {
      gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      return;
    }

    // --- EFFECT COMPUTATIONS ---
    vec3 finalColor = baseSample.rgb;

    if (uEffect < 0.5) {
      // 1. BURNING
      float lum = dot(burnSample.rgb, vec3(0.299, 0.587, 0.114));
      finalColor = firePalette(lum);

    } else if (uEffect < 1.5) {
      // 2. GLOW
      float lum = dot(baseSample.rgb, vec3(0.299, 0.587, 0.114));
      float edgeNoise = snoise(uv * 200.0 + uTime * 0.5) * 0.15;
      float core = smoothstep(0.5 + edgeNoise, 0.7 + edgeNoise, lum);
      float halo = smoothstep(0.2 + edgeNoise, 0.6 + edgeNoise, lum);
      vec3 glowColor = mix(vec3(0.0), vec3(0.4, 0.9, 1.0), halo);
      finalColor = mix(glowColor, vec3(1.0), core);

    } else if (uEffect < 2.5) {
      // 3. THERMAL VISION
      float lum = dot(baseSample.rgb, vec3(0.299, 0.587, 0.114));
      float t = clamp((lum - 0.1) * 1.2, 0.0, 1.0);
      finalColor = thermalPalette(t);

    } else if (uEffect < 3.5) {
      // 4. PIXELATED
      vec2 localUv = fract(uv * vec2(gridX, gridY));
      float dist = distance(localUv, vec2(0.5));
      if (dist < 0.35) {
        float cellLum = dot(pixelSample.rgb, vec3(0.299, 0.587, 0.114));
        finalColor = vec3(0.0, cellLum > 0.25 ? 1.0 : 0.0, 0.0);
      } else {
        finalColor = vec3(0.0, 0.1, 0.0);
      }

    } else if (uEffect < 4.5) {
      // 5. GLITCH
      vec3 glitchColor = vec3(rGlitch, gGlitch, bGlitch);
      glitchColor -= sin(uv.y * 800.0 + uTime * 10.0) * 0.05;
      finalColor = clamp(glitchColor, 0.0, 1.0);

    } else {
      // 6. NEON EDGES (Sobel Filter)
      float l00 = dot(s00.rgb, vec3(0.299, 0.587, 0.114));
      float l01 = dot(s01.rgb, vec3(0.299, 0.587, 0.114));
      float l02 = dot(s02.rgb, vec3(0.299, 0.587, 0.114));
      float l10 = dot(s10.rgb, vec3(0.299, 0.587, 0.114));
      float l12 = dot(s12.rgb, vec3(0.299, 0.587, 0.114));
      float l20 = dot(s20.rgb, vec3(0.299, 0.587, 0.114));
      float l21 = dot(s21.rgb, vec3(0.299, 0.587, 0.114));
      float l22 = dot(s22.rgb, vec3(0.299, 0.587, 0.114));

      float sobH = -l00 - 2.0 * l01 - l02 + l20 + 2.0 * l21 + l22;
      float sobV = -l00 + l02 - 2.0 * l10 + 2.0 * l12 - l20 + l22;
      float edge = sqrt(sobH * sobH + sobV * sobV);

      vec3 edgeColor = vec3(0.1, 1.0, 0.8) * edge * 2.5;
      finalColor = edgeColor + 0.3 * baseSample.rgb;
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
