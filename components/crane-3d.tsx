"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Crane3DProps = {
  color: string;
  pattern: string;
  interactive: boolean;
  reducedMotion: boolean;
  onReady: () => void;
  onError: () => void;
};

type Point = readonly [number, number, number];
type Facet = { points: readonly Point[]; shade: number };

// Coordinates describe individual folded paper surfaces rather than a solid
// bird. Their shallow depth gives every crease an edge and catches soft light.
const facets: Facet[] = [
  { points: [[326,72,-.65],[349,323,-.12],[402,269,-.37]], shade: 1.04 },
  { points: [[326,72,-.65],[402,269,-.37],[423,316,-.19]], shade: .93 },
  { points: [[349,323,-.12],[402,269,-.37],[423,316,-.19]], shade: .78 },
  { points: [[414,307,-.08],[635,377,-.18],[446,332,.1]], shade: 1.02 },
  { points: [[414,307,-.08],[635,377,-.18],[455,305,-.08]], shade: .89 },
  { points: [[319,321,.05],[222,255,.12],[185,215,.12],[196,262,.08],[333,352,.12]], shade: .94 },
  { points: [[319,321,.05],[185,215,.12],[209,260,.26],[352,338,.23]], shade: 1.06 },
  { points: [[185,215,.12],[169,244,.06],[113,281,.12],[196,262,.08]], shade: .82 },
  { points: [[185,215,.12],[113,281,.12],[169,244,.26]], shade: 1.02 },
  { points: [[319,321,.05],[381,296,.22],[446,332,.1],[388,386,.06]], shade: .94 },
  { points: [[319,321,.05],[388,386,.06],[354,337,.38]], shade: .81 },
  { points: [[381,296,.22],[388,386,.06],[446,332,.1]], shade: 1.04 },
  { points: [[625,114,.29],[389,274,.2],[405,341,.3]], shade: 1.13 },
  { points: [[625,114,.29],[453,212,.76],[405,341,.3]], shade: .98 },
  { points: [[625,114,.29],[405,341,.3],[473,322,.13]], shade: .83 },
];

function paperTexture(color: string, pattern: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 512);
  let seed = 2026;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let index = 0; index < 9000; index++) {
    ctx.fillStyle = index % 2 ? "rgba(255,250,241,0.055)" : "rgba(67,41,35,0.035)";
    const x = random() * 512;
    const y = random() * 512;
    ctx.fillRect(x, y, .4 + random() * 1.2, .5 + random());
  }
  if (pattern === "seigaiha") {
    ctx.strokeStyle = "rgba(255,253,244,0.4)";
    ctx.lineWidth = 1;
    for (let row = -1; row < 15; row++) for (let col = -1; col < 12; col++) {
      const x = col * 48 + (row % 2 ? 24 : 0);
      const y = row * 32;
      for (const radius of [23, 17, 11]) {
        ctx.beginPath(); ctx.arc(x, y, radius, Math.PI, 0); ctx.stroke();
      }
    }
  } else if (pattern !== "plain") {
    for (let index = 0; index < 250; index++) {
      ctx.fillStyle = index % 4 ? "rgba(255,249,226,0.6)" : "rgba(83,53,44,0.18)";
      ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, random() * 1.5 + .4, random() * 1.2 + .4, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function world(point: Point): [number, number, number] {
  return [(point[0] - 380) / 130, (248.5 - point[1]) / 130, point[2]];
}

function makeFacet(facet: Facet) {
  const vertices: number[] = [];
  const uv: number[] = [];
  for (let index = 1; index < facet.points.length - 1; index++) {
    for (const point of [facet.points[0], facet.points[index], facet.points[index + 1]]) {
      vertices.push(...world(point));
      uv.push((point[0] - 80) / 600, 1 - (point[1] - 36) / 425);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function FoldedPaper({ color, pattern, interactive, reducedMotion, onReady }: Omit<Crane3DProps, "onError">) {
  const group = useRef<THREE.Group>(null);
  const firstFrame = useRef(true);
  const { camera, size, pointer, invalidate } = useThree();
  const geometries = useMemo(() => facets.map(makeFacet), []);
  const texture = useMemo(() => paperTexture(color, pattern), [color, pattern]);
  const creaseGeometry = useMemo(() => {
    const segments: [Point, Point][] = [
      [[326,72,-.643],[402,269,-.363]],
      [[625,114,.3],[405,341,.31]],
      [[453,212,.77],[405,341,.31]],
      [[185,215,.13],[319,321,.06]],
      [[319,321,.06],[388,386,.07]],
      [[414,307,-.07],[635,377,-.17]],
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments.flatMap((segment) => segment.flatMap(world)), 3));
    return geometry;
  }, []);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.zoom = Math.min(size.width / 4.62, size.height / 3.27);
    ortho.updateProjectionMatrix();
    invalidate();
  }, [camera, size, color, pattern, invalidate]);

  useEffect(() => () => {
    geometries.forEach((geometry) => geometry.dispose());
    creaseGeometry.dispose();
  }, [geometries, creaseGeometry]);
  useEffect(() => () => texture?.dispose(), [texture]);

  useFrame(({ clock }, delta) => {
    if (firstFrame.current) { firstFrame.current = false; onReady(); }
    if (!group.current) return;
    const elapsed = clock.elapsedTime;
    const ease = 1 - Math.exp(-delta * 4);
    const targetX = interactive && !reducedMotion ? -pointer.y * .09 : 0;
    const targetY = interactive && !reducedMotion ? pointer.x * .16 : 0;
    group.current.rotation.x = reducedMotion ? 0 : THREE.MathUtils.lerp(group.current.rotation.x, targetX, ease);
    group.current.rotation.y = reducedMotion ? 0 : THREE.MathUtils.lerp(group.current.rotation.y, targetY, ease);
    group.current.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * .34) * .012;
    group.current.position.y = reducedMotion ? 0 : Math.sin(elapsed * .7) * .045;
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {facets.map((facet, index) => (
        <mesh key={index} geometry={geometries[index]}>
          <meshStandardMaterial map={texture} color={new THREE.Color().setRGB(facet.shade, facet.shade, facet.shade)} roughness={1} metalness={0} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <lineSegments geometry={creaseGeometry}><lineBasicMaterial color="#fff5e9" transparent opacity={.21} depthWrite={false} /></lineSegments>
    </group>
  );
}

export function Crane3D({ onError, ...props }: Crane3DProps) {
  const cleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cleanup.current?.(), []);
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 8], zoom: 100, near: .1, far: 30 }}
      dpr={[1, 1.5]}
      frameloop={props.reducedMotion ? "demand" : "always"}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      style={{ width: "100%", height: "100%", display: "block", background: "transparent", touchAction: "pan-y" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        const lost = (event: Event) => { event.preventDefault(); onError(); };
        gl.domElement.addEventListener("webglcontextlost", lost);
        cleanup.current = () => gl.domElement.removeEventListener("webglcontextlost", lost);
      }}
    >
      <ambientLight intensity={1.25} color="#fff8ed" />
      <directionalLight position={[-3, 5, 7]} intensity={1.4} color="#fff9f1" />
      <directionalLight position={[4, -2, 3]} intensity={.2} color="#eedcdb" />
      <FoldedPaper {...props} />
    </Canvas>
  );
}

export default Crane3D;


