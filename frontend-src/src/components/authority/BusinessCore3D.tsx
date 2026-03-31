import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";

type Props = {
  /** 0..1 */
  progress: number;
  /** Estado visual do núcleo */
  state?: "idle" | "ready" | "running" | "done";
  className?: string;
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Subtle particle system (points) for "premium" feedback.
 * - Running: continuous emission
 * - Filling: short burst when progress increases
 */
function Particles({
  emitRate = 0,
  burstToken = 0,
  intensity = 1,
  size = 0.038,
  color = "#00C8E8",
  max = 900,
  burstCount = 90,
}: {
  emitRate?: number;
  burstToken?: number;
  intensity?: number;
  size?: number;
  color?: string;
  max?: number;
  burstCount?: number;
}) {
  const points = React.useRef<THREE.Points>(null!);

  // More particles to feel "alive" without heavy post-processing.
  const MAX = max;
  const positions = React.useMemo(() => new Float32Array(MAX * 3), []);
  const velocities = React.useMemo(() => new Float32Array(MAX * 3), []);
  const life = React.useMemo(() => new Float32Array(MAX), []);
  const age = React.useMemo(() => new Float32Array(MAX), []);
  const cursor = React.useRef(0);
  const emitCarry = React.useRef(0);

  const geometry = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  const material = React.useMemo(() => {
    const m = new THREE.PointsMaterial({
      size,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    // @ts-ignore
    m.color = new THREE.Color(color);
    return m;
  }, [color, size]);

  const emitOne = React.useCallback(
    (power = 1) => {
      const i = cursor.current % MAX;
      cursor.current++;

      // spawn around sphere surface
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 0.82 + Math.random() * 0.06;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      const ix = i * 3;
      positions[ix + 0] = x;
      positions[ix + 1] = y;
      positions[ix + 2] = z;

      // outward velocity
      const nx = x / r,
        ny = y / r,
        nz = z / r;
      const s = (0.55 + Math.random() * 0.6) * power;

      velocities[ix + 0] = nx * s + (Math.random() - 0.5) * 0.12;
      velocities[ix + 1] = ny * s + (Math.random() - 0.5) * 0.12;
      velocities[ix + 2] = nz * s + (Math.random() - 0.5) * 0.12;

      age[i] = 0;
      life[i] = 0.65 + Math.random() * 0.65;
    },
    [age, life, positions, velocities]
  );

  const emit = React.useCallback(
    (count: number, power = 1) => {
      for (let k = 0; k < count; k++) emitOne(power);
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    },
    [emitOne, geometry]
  );

  React.useEffect(() => {
    if (!burstToken) return;
    // A visible burst that feels "premium" when progress advances.
    emit(Math.max(12, burstCount), 1.35);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstToken]);

  useFrame((_, dt) => {
    if (emitRate > 0) {
      emitCarry.current += emitRate * dt;
      const c = Math.floor(emitCarry.current);
      if (c > 0) {
        emitCarry.current -= c;
        emit(Math.min(c, 28), 1.15);
      }
    }

    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) {
        life[i] = 0;
        continue;
      }
      any = true;

      const ix = i * 3;

      // drag
      velocities[ix + 0] *= 1 - 0.7 * dt;
      velocities[ix + 1] *= 1 - 0.7 * dt;
      velocities[ix + 2] *= 1 - 0.7 * dt;

      positions[ix + 0] += velocities[ix + 0] * dt;
      positions[ix + 1] += velocities[ix + 1] * dt;
      positions[ix + 2] += velocities[ix + 2] * dt;
    }

    // Brighter + subtle sparkle pulse
    const sparkle = 0.88 + 0.12 * Math.sin(performance.now() / 180);
    material.opacity = Math.min(1, 0.98 * Math.max(0.55, intensity) * sparkle);

    if (any) {
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return <points ref={points} geometry={geometry} material={material} />;
}

function CoreSphere({
  progress,
  state = "idle",
}: {
  progress: number;
  state?: Props["state"];
}) {
  const group = React.useRef<THREE.Group>(null!);
  const shellRef = React.useRef<THREE.Mesh>(null!);
  const innerRef = React.useRef<THREE.Mesh>(null!);
  const innerGlowRef = React.useRef<THREE.Mesh>(null!);
  const rimRef = React.useRef<THREE.Mesh>(null!);
  const wireRef = React.useRef<THREE.Mesh>(null!);
  const scanRef = React.useRef<THREE.Mesh>(null!);

  const p = clamp01(progress);

  // Pointer tracking (tilt) + auto rotate when idle
  const lastMoveRef = React.useRef<number>(performance.now());
  const targetRotRef = React.useRef<{ x: number; y: number }>({ x: 0.08, y: -0.45 });
  const currentRotRef = React.useRef<{ x: number; y: number }>({ x: 0.08, y: -0.45 });
  // Separate base rotation so auto-rotation doesn't get damped back to targetRot
  const baseSpinRef = React.useRef<{ y: number; x: number }>({ y: 0, x: 0 });

  // Burst when filling
  const prevP = React.useRef(p);
  const [burstToken, setBurstToken] = React.useState(0);

  // Materials (memo once)
  const shellMat = React.useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transparent: true,
      opacity: 0.38,
      roughness: 0.08,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
      transmission: 0.78,
      thickness: 0.35,
      ior: 1.35,
    });
    // @ts-ignore
    m.color = new THREE.Color("#4DE8FF");
    // @ts-ignore
    m.emissive = new THREE.Color("#0099BB");
    // @ts-ignore
    m.emissiveIntensity = 0.08;
    return m;
  }, []);

  const innerMat = React.useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.92,
      roughness: 0.2,
      metalness: 0.05,
    });
    // @ts-ignore
    m.color = new THREE.Color("#0099BB");
    // @ts-ignore
    m.emissive = new THREE.Color("#0099BB");
    // @ts-ignore
    m.emissiveIntensity = 0.55;
    return m;
  }, []);

  const innerGlowMat = React.useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    // @ts-ignore
    m.color = new THREE.Color("#4DE8FF");
    return m;
  }, []);

  const rimMat = React.useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    // @ts-ignore
    m.color = new THREE.Color("#00C8E8");
    return m;
  }, []);

  // "Scanline" ring that travels from top to bottom (premium tech feel).
  const scanMat = React.useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // @ts-ignore
    m.color = new THREE.Color("#A8F4FF");
    return m;
  }, []);

  const wireMat = React.useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      depthWrite: false,
    });
    // @ts-ignore
    m.color = new THREE.Color("#4DE8FF");
    return m;
  }, []);

  useFrame((state3f, dt) => {
    const now = performance.now();
    const pointer = state3f.pointer;

    const moving = Math.abs(pointer.x) > 0.001 || Math.abs(pointer.y) > 0.001;
    if (moving) {
      lastMoveRef.current = now;
      targetRotRef.current = {
        x: pointer.y * 0.22,
        y: pointer.x * 0.38,
      };
    }

    const idleFor = now - lastMoveRef.current;

    // Auto spin when the user is not moving the mouse.
    // Keep it subtle in idle, stronger in running.
    const autoOn = idleFor > 650;
    // Always keep a subtle motion so it never feels "dead".
    const baseSpeed = state === "running" ? 0.35 : state === "ready" ? 0.18 : 0.12;
    baseSpinRef.current.y += dt * baseSpeed;

    // Stronger auto-spin when the user is idle.
    const spinSpeed = state === "running" ? 0.85 : state === "ready" ? 0.55 : 0.42;
    if (autoOn) {
      baseSpinRef.current.y += dt * spinSpeed;
      baseSpinRef.current.x = Math.sin(now / 950) * 0.08;
    } else {
      // Mild breathing tilt even while the user is moving
      baseSpinRef.current.x = THREE.MathUtils.damp(baseSpinRef.current.x, Math.sin(now / 1200) * 0.035, 4, dt);
    }

    currentRotRef.current.x = THREE.MathUtils.damp(currentRotRef.current.x, targetRotRef.current.x, 6, dt);
    currentRotRef.current.y = THREE.MathUtils.damp(currentRotRef.current.y, targetRotRef.current.y, 6, dt);

    const runBoost = state === "running" ? 1.25 : state === "done" ? 1.1 : 1.0;

    // Compose rotation: base spin + gentle pointer tilt.
    group.current.rotation.x = baseSpinRef.current.x + currentRotRef.current.x;
    group.current.rotation.y = baseSpinRef.current.y * runBoost + currentRotRef.current.y;

    // Scanline animation: a glowing ring sweeping vertically.
    // Keeps running even in idle, with stronger intensity during "running".
    if (scanRef.current) {
      const t = now / 1000;
      const speed = state === "running" ? 1.35 : state === "ready" ? 1.0 : 0.75;
      // Sweep from top to bottom (-0.64..0.64) and loop
      const sweep = ((t * 0.55 * speed) % 1) * 2 - 1;
      const y = THREE.MathUtils.clamp(sweep * 0.64, -0.64, 0.64);
      scanRef.current.position.y = y;
      scanRef.current.rotation.y = t * 0.9;

      // Scale the ring to match the sphere radius at that Y slice
      const R = 0.705;
      const rAtY = Math.max(0.12, Math.sqrt(Math.max(0, R * R - y * y)));
      scanRef.current.scale.set(rAtY, rAtY, 1);

      const base = state === "running" ? 0.52 : state === "ready" ? 0.34 : 0.22;
      const pulse = 0.7 + 0.3 * Math.sin(t * 7.5);
      scanMat.opacity = base * pulse;
    }

    // Progress -> inner core size (always visible)
    // Inside-out fill: starts as a small "energy seed" and grows to the limit.
    const minR = 0.06; // still visible
    const maxR = 0.92;
    const target = THREE.MathUtils.lerp(minR, maxR, p);
    const cur = innerRef.current.scale.x;
    const next = THREE.MathUtils.damp(cur, target, 8, dt);
    innerRef.current.scale.setScalar(next);

    // Inner glow follows the same growth but slightly larger
    const glowNext = Math.min(1, next * 1.05);
    innerGlowRef.current.scale.setScalar(glowNext);

    // State polish
    const shellOpacity =
      state === "running" ? 0.42 : state === "ready" ? 0.4 : state === "done" ? 0.44 : 0.38;
    shellMat.opacity = shellOpacity;

    // Make wireframe stronger when empty, softer when full
    wireMat.opacity = THREE.MathUtils.lerp(0.28, 0.08, p);

    // Rim glow stronger when ready/running
    rimMat.opacity = state === "running" ? 0.32 : state === "ready" ? 0.28 : state === "done" ? 0.24 : 0.22;

    // Burst when progress increases meaningfully
    const dp = p - prevP.current;
    if (dp > 0.015) {
      setBurstToken((t) => t + 1);
      prevP.current = p;
    } else if (dp < -0.02) {
      prevP.current = p;
    }
  });

  const particlesEmit = state === "running" ? 90 : state === "ready" ? 25 : 6;
  const particlesIntensity = state === "running" ? 1.35 : state === "ready" ? 1.05 : 0.85;

  return (
    <group ref={group}>
      {/* Particles (two layers for "deslumbrante" effect) */}
      <Particles
        emitRate={particlesEmit}
        burstToken={burstToken}
        intensity={particlesIntensity}
        size={0.042}
        color="#00C8E8"
        max={650}
        burstCount={70}
      />
      <Particles
        emitRate={Math.max(0, particlesEmit * 0.25)}
        burstToken={burstToken}
        intensity={particlesIntensity}
        size={0.06}
        color="#A8F4FF"
        max={220}
        burstCount={25}
      />

      {/* Rim glow */}
      <mesh ref={rimRef} material={rimMat}>
        <sphereGeometry args={[0.74, 64, 64]} />
      </mesh>

      {/* Outer glass shell */}
      <mesh ref={shellRef} material={shellMat}>
        <sphereGeometry args={[0.7, 64, 64]} />
      </mesh>

      {/* Wireframe overlay */}
      <mesh ref={wireRef} material={wireMat}>
        <sphereGeometry args={[0.705, 40, 40]} />
      </mesh>

      {/* Scanline ring */}
      <mesh ref={scanRef} material={scanMat} rotation={[Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.92, 1.0, 96]} />
      </mesh>

      {/* Inner "energy" core (progress) */}
      <mesh ref={innerRef} material={innerMat}>
        <sphereGeometry args={[0.68, 64, 64]} />
      </mesh>

      {/* Inner glow envelope (adds depth) */}
      <mesh ref={innerGlowRef} material={innerGlowMat}>
        <sphereGeometry args={[0.705, 48, 48]} />
      </mesh>
    </group>
  );
}

export function BusinessCore3D({ progress, state = "idle", className }: Props) {
  const p = clamp01(progress);
  const visualState = state;

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.35, 2.25], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearAlpha(0);
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 3]} intensity={1.35} />
        <pointLight position={[-3, 2, -2]} intensity={0.75} />
        <pointLight position={[0, -2, 2]} intensity={0.35} />

        <React.Suspense fallback={null}>
          <Environment preset="city" />
        </React.Suspense>

        <CoreSphere progress={p} state={visualState} />
      </Canvas>
    </div>
  );
}

export default BusinessCore3D;
