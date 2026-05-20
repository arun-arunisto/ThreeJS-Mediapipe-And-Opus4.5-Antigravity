import { useState, useEffect, useRef } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { EffectsCanvas } from './EffectsCanvas';

// Standard MediaPipe hand joint connections
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Knuckles
  [5, 9], [9, 13], [13, 17]
];

export default function App() {
  const [videoReady, setVideoReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [effectIndex, setEffectIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // References to HTML elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvas2DRef = useRef<HTMLCanvasElement | null>(null);

  // Trackers and cooldowns
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const lastClapTimeRef = useRef<number>(0);
  
  // Mutable box ref: [xMin, yMin, xMax, yMax] in normalized mirrored UV space
  const boxRef = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  // Load MediaPipe HandLandmarker and initiate webcam stream
  useEffect(() => {
    let isMounted = true;
    let landmarkerInstance: HandLandmarker | null = null;
    let mediaStream: MediaStream | null = null;

    async function initializeApp() {
      try {
        // 1. Initialize MediaPipe FilesetResolver & HandLandmarker
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        if (!isMounted) return;

        landmarkerInstance = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });

        if (!isMounted) {
          landmarkerInstance.close();
          return;
        }

        landmarkerRef.current = landmarkerInstance;
        setModelsReady(true);

        // 2. Request Webcam access
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
          },
          audio: false
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach(t => t.stop());
          return;
        }

        if (videoRef.current) {
          const video = videoRef.current;
          
          const handleLoadedMetadata = () => {
            video.play()
              .then(() => {
                if (isMounted) setVideoReady(true);
              })
              .catch((err) => {
                console.error("Webcam video play failed: ", err);
                if (isMounted) {
                  setErrorMsg("Webcam autoplay blocked. Please click anywhere to activate camera stream.");
                }
              });
          };

          video.onloadedmetadata = handleLoadedMetadata;
          video.srcObject = mediaStream;

          // Double check if metadata already loaded
          if (video.readyState >= 1) {
            handleLoadedMetadata();
          }
        }
      } catch (err: any) {
        console.error("Failed to initialize app: ", err);
        if (isMounted) {
          setErrorMsg(err.message || "Could not access camera or load tracking modules. Please verify permissions.");
        }
      }
    }

    initializeApp();

    return () => {
      isMounted = false;
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
      }
      if (landmarkerInstance) {
        landmarkerInstance.close();
      }
    };
  }, []);

  // Frame processing and tracking loop
  useEffect(() => {
    if (!videoReady || !modelsReady || !videoRef.current || !landmarkerRef.current || !canvas2DRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvas2DRef.current;
    const ctx = canvas.getContext('2d');
    const landmarker = landmarkerRef.current;

    if (!ctx) return;

    let animationId: number;
    let lastVideoTime = -1;

    // Rescale overlay canvas to match screen size
    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const trackingLoop = () => {
      if (video.readyState >= 2) {
        const now = performance.now();

        // Enforce canvas size matches viewport
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          resizeCanvas();
        }

        if (video.currentTime !== lastVideoTime) {
          const results = landmarker.detectForVideo(video, now);
          lastVideoTime = video.currentTime;

          // Clear previous skeleton overlay
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // If exactly 2 hands are detected, calculate bounding box
          if (results.landmarks && results.landmarks.length === 2) {
            const hand1 = results.landmarks[0];
            const hand2 = results.landmarks[1];

            // Use middle finger MCP (landmark 9) of both hands
            const h1 = hand1[9];
            const h2 = hand2[9];

            if (h1 && h2) {
              // Mirror X coordinate for user-facing experience
              const h1_x_mirrored = 1.0 - h1.x;
              const h2_x_mirrored = 1.0 - h2.x;

              // Center coordinates
              const cx = (h1_x_mirrored + h2_x_mirrored) / 2.0;
              const cy = (h1.y + h2.y) / 2.0;

              // Distances between hands
              const dx = h1_x_mirrored - h2_x_mirrored;
              const dy = h1.y - h2.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // Clap gesture check: distance < 0.1
              if (distance < 0.1) {
                const nowMs = performance.now();
                if (nowMs - lastClapTimeRef.current > 1000) {
                  setEffectIndex((prev) => (prev + 1) % 6);
                  lastClapTimeRef.current = nowMs;
                }
                // Hide box while clapping
                boxRef.current = [0, 0, 0, 0];
              } else {
                // Calculate dynamic box parameters
                const boxWidth = distance * 1.2;
                const boxHeight = boxWidth * 0.8;

                const xMin = cx - boxWidth / 2.0;
                const xMax = cx + boxWidth / 2.0;

                // Map MediaPipe Y (0 at top, 1 at bottom) to UV Y (0 at bottom, 1 at top)
                const uv_cy = 1.0 - cy;
                const yMin = uv_cy - boxHeight / 2.0;
                const yMax = uv_cy + boxHeight / 2.0;

                boxRef.current = [xMin, yMin, xMax, yMax];
              }
            }
          } else {
            // Hide box if hand count is not exactly 2
            boxRef.current = [0, 0, 0, 0];
          }

          // Draw skeletons
          if (results.landmarks && results.landmarks.length > 0) {
            // 1. Draw connections
            ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
            ctx.lineWidth = 2;
            
            for (const hand of results.landmarks) {
              ctx.beginPath();
              for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
                const start = hand[startIdx];
                const end = hand[endIdx];
                if (start && end) {
                  const x1 = (1.0 - start.x) * canvas.width;
                  const y1 = start.y * canvas.height;
                  const x2 = (1.0 - end.x) * canvas.width;
                  const y2 = end.y * canvas.height;
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                }
              }
              ctx.stroke();
            }

            // 2. Draw nodes
            ctx.fillStyle = "#ffffff";
            for (const hand of results.landmarks) {
              for (const lm of hand) {
                const x = (1.0 - lm.x) * canvas.width;
                const y = lm.y * canvas.height;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();
              }
            }
          }
        }
      }

      animationId = requestAnimationFrame(trackingLoop);
    };

    trackingLoop();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [videoReady, modelsReady]);

  // Click handler to bypass potential browser autoplay blocks
  const handleOverlayClick = () => {
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play()
        .then(() => setVideoReady(true))
        .catch(err => console.error("Manual playback activation failed:", err));
    }
  };

  const isLoaded = modelsReady && videoReady;

  return (
    <main 
      className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col justify-center items-center font-sans select-none"
      onClick={handleOverlayClick}
      id="main-app-container"
    >
      {/* Hidden HTML5 video element for webcam streaming */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute pointer-events-none"
        style={{ left: '-9999px', top: '-9999px', width: '640px', height: '360px', opacity: 0 }}
        id="hidden-webcam-feed"
      />

      {/* ERROR STATE */}
      {errorMsg && (
        <div className="z-20 max-w-md p-8 bg-zinc-900/80 backdrop-blur-xl border border-red-500/20 rounded-2xl flex flex-col items-center text-center shadow-2xl animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4 border border-red-500/20">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Tracking Interrupted</h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-red-600/20 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            id="btn-reload"
          >
            Reload Page
          </button>
        </div>
      )}

      {/* LOADING STATE */}
      {!isLoaded && !errorMsg && (
        <div className="z-20 flex flex-col items-center justify-center animate-pulse-slow">
          {/* Neon Circular Spinner */}
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
            <div className="absolute inset-0 rounded-full border-4 border-t-white border-r-white/40 border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full border border-dashed border-zinc-700/60 animate-spin-reverse" style={{ animationDuration: '4s' }} />
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500 font-mono">System Startup</p>
            <h2 className="text-lg font-semibold text-zinc-200 font-mono tracking-wide" id="loading-text">
              {!modelsReady ? "Loading AI Models..." : "Waiting for Camera..."}
            </h2>
          </div>
        </div>
      )}

      {/* ACTIVE RUNNING STATE */}
      {isLoaded && !errorMsg && videoRef.current && (
        <>
          {/* R3F WebGL effects renderer */}
          <EffectsCanvas
            video={videoRef.current}
            boxRef={boxRef}
            effectIndex={effectIndex}
          />

          {/* 2D overlay canvas for silver hand skeleton tracking */}
          <canvas
            ref={canvas2DRef}
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            id="skeleton-overlay-canvas"
          />
        </>
      )}
    </main>
  );
}
