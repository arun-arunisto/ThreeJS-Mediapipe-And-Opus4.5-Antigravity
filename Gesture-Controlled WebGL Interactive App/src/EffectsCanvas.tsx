import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders/effectsShader';

interface ShaderPlaneProps {
  video: HTMLVideoElement;
  boxRef: React.MutableRefObject<[number, number, number, number]>;
  effectIndex: number;
}

const ShaderPlane: React.FC<ShaderPlaneProps> = ({ video, boxRef, effectIndex }) => {
  const { size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Setup video texture
  const videoTexture = useMemo(() => {
    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [video]);

  // Handle texture cleanup on unmount
  useEffect(() => {
    return () => {
      videoTexture.dispose();
    };
  }, [videoTexture]);

  // Define uniforms
  const uniforms = useMemo(() => ({
    uTexture: { value: videoTexture },
    uTime: { value: 0 },
    uBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uEffect: { value: effectIndex },
    uResolution: { value: new THREE.Vector2(size.width, size.height) }
  }), [videoTexture]);

  // Frame loop updates uniforms
  useFrame((state) => {
    if (materialRef.current) {
      // Update time
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      
      // Update resolution if it changes
      materialRef.current.uniforms.uResolution.value.set(size.width, size.height);
      
      // Update uBox [xMin, yMin, xMax, yMax]
      const box = boxRef.current;
      materialRef.current.uniforms.uBox.value.set(box[0], box[1], box[2], box[3]);
      
      // Update active effect index
      materialRef.current.uniforms.uEffect.value = effectIndex;
    }
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
};

interface EffectsCanvasProps {
  video: HTMLVideoElement;
  boxRef: React.MutableRefObject<[number, number, number, number]>;
  effectIndex: number;
}

export const EffectsCanvas: React.FC<EffectsCanvasProps> = ({ video, boxRef, effectIndex }) => {
  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
      <Canvas
        gl={{ antialias: false, powerPreference: "high-performance" }}
        orthographic
        camera={{ left: -1, right: 1, top: 1, bottom: -1, near: -10, far: 10 }}
      >
        <ShaderPlane video={video} boxRef={boxRef} effectIndex={effectIndex} />
      </Canvas>
    </div>
  );
};

export default EffectsCanvas;
