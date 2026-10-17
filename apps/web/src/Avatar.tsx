import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { characters, useWorld } from "./store";
import { useReducedMotion } from "./preferences";
import { speechMotion } from "./speech";
const rad = THREE.MathUtils.degToRad;
const damp = (current: number, target: number, dt: number) =>
  THREE.MathUtils.damp(current, target, 9, dt);
export default function Avatar() {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftElbow = useRef<THREE.Group>(null);
  const rightElbow = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const s = useWorld();
  const reduced = useReducedMotion();
  const pupils = useRef<THREE.Group>(null);
  const hairLeft = useRef<THREE.Group>(null);
  const hairRight = useRef<THREE.Group>(null);
  const blinkState = useRef({ next: 2.8, start: -10 });
  const pointerAttention = useRef({ x: 0, y: 0, changed: 0 });
  const color = characters[s.character].color;
  const smile = useMemo(() => {
    const happiness =
      s.expression === "happy" ? 0.13 : s.expression === "sad" ? -0.07 : 0.025;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.075, 0, 0),
      new THREE.Vector3(0, -happiness * s.expressionIntensity, 0),
      new THREE.Vector3(0.075, 0, 0),
    );
    return new THREE.TubeGeometry(curve, 20, 0.012, 6, false);
  }, [s.expression, s.expressionIntensity]);
  useEffect(() => () => smile.dispose(), [smile]);
  useFrame(({ clock, pointer }, dt) => {
    if (!root.current || !body.current || !head.current || !eyes.current)
      return;
    dt = Math.min(dt, 0.08);
    const t = clock.elapsedTime;
    const natural = s.naturalMotion && !reduced;
    const breath = natural
      ? (Math.sin(t * 1.75) + Math.sin(t * 0.39) * 0.18) * s.breath
      : 0;
    const attention = pointerAttention.current;
    if (
      Math.abs(pointer.x - attention.x) + Math.abs(pointer.y - attention.y) >
      0.012
    ) {
      attention.x = pointer.x;
      attention.y = pointer.y;
      attention.changed = t;
    }
    const interested = t - attention.changed < 6;
    const lookX = s.gazeTracking
      ? interested
        ? pointer.x * 0.16
        : Math.sin(t * 0.31) * 0.045
      : 0;
    const lookY = s.gazeTracking
      ? interested
        ? -pointer.y * 0.07
        : Math.sin(t * 0.47) * 0.02
      : 0;
    if (pupils.current) {
      pupils.current.position.x = damp(
        pupils.current.position.x,
        lookX * 0.07,
        dt * 1.8,
      );
      pupils.current.position.y = damp(
        pupils.current.position.y,
        -lookY * 0.06,
        dt * 1.8,
      );
    }
    if (hairLeft.current)
      hairLeft.current.rotation.z = damp(
        hairLeft.current.rotation.z,
        0.1 +
          (natural
            ? Math.sin(t * 1.35) * 0.035 + head.current.rotation.z * 0.17
            : 0),
        dt * 0.55,
      );
    if (hairRight.current)
      hairRight.current.rotation.z = damp(
        hairRight.current.rotation.z,
        -0.1 +
          (natural
            ? Math.sin(t * 1.35 + 0.6) * 0.035 + head.current.rotation.z * 0.17
            : 0),
        dt * 0.55,
      );
    body.current.position.x = damp(
      body.current.position.x,
      natural ? Math.sin(t * 0.52) * 0.018 : 0,
      dt * 0.4,
    );
    root.current.position.y =
      0.06 + (s.action === "jump" ? Math.abs(Math.sin(t * 4)) * 1.1 : 0);
    root.current.rotation.y = damp(
      root.current.rotation.y,
      rad(s.rotation) + (s.action === "dance" ? Math.sin(t * 2) * 0.45 : 0),
      dt,
    );
    body.current.scale.y = 1 + breath * 0.008;
    body.current.rotation.z = damp(
      body.current.rotation.z,
      rad(s.pose.bodyLean) + (natural ? Math.sin(t * 0.8) * 0.012 : 0),
      dt,
    );
    head.current.rotation.y = damp(
      head.current.rotation.y,
      rad(s.pose.headYaw) + lookX,
      dt,
    );
    head.current.rotation.x = damp(
      head.current.rotation.x,
      rad(s.pose.headPitch) +
        lookY +
        (natural && s.speaking ? Math.sin(t * 3.6) * 0.018 : 0),
      dt,
    );
    head.current.rotation.z = damp(
      head.current.rotation.z,
      (s.expression === "curious" ? 0.13 : 0) * s.expressionIntensity +
        (natural ? Math.sin(t * 0.7) * 0.015 : 0),
      dt,
    );
    const blinkData = blinkState.current;
    if (natural && t >= blinkData.next) {
      blinkData.start = t;
      blinkData.next = t + 2.8 + (Math.sin(t * 7.13) * 0.5 + 0.5) * 3.7;
    }
    const blinkAge = t - blinkData.start;
    const blink =
      natural && blinkAge < 0.19
        ? Math.max(0.035, 1 - Math.sin((blinkAge / 0.19) * Math.PI))
        : 1;
    eyes.current.scale.y = damp(
      eyes.current.scale.y,
      blink *
        (s.expression === "happy"
          ? 1 - s.expressionIntensity * 0.4
          : s.expression === "relaxed"
            ? 0.4
            : 1),
      dt * 2,
    );
    eyes.current.position.x = damp(eyes.current.position.x, lookX * 0.04, dt);
    if (mouth.current) {
      mouth.current.scale.y = damp(
        mouth.current.scale.y,
        (s.expression === "surprised" ? 1.7 : 0.25) +
          (s.speaking
            ? (speechMotion.measured
                ? speechMotion.energy
                : Math.abs(Math.sin(t * 13.3) * Math.sin(t * 4.7))) * 1.2
            : 0),
        dt,
      );
      mouth.current.visible = s.expression === "surprised" || s.speaking;
    }
    const dance = s.action === "dance";
    const wave = s.action === "wave";
    for (const [ref, sign, key] of [
      [leftArm, -1, "leftArm"],
      [rightArm, 1, "rightArm"],
    ] as const) {
      if (ref.current)
        ref.current.rotation.z = damp(
          ref.current.rotation.z,
          sign * rad(s.pose[key]) +
            (dance
              ? sign * (0.5 + Math.sin(t * 4 + sign) * 0.6)
              : wave && sign === 1
                ? 2.1 + Math.sin(t * 6) * 0.22
                : natural
                  ? sign * (0.025 + Math.sin(t * 0.9 + sign) * 0.017)
                  : 0),
          dt,
        );
    }
    if (leftElbow.current)
      leftElbow.current.rotation.x = damp(
        leftElbow.current.rotation.x,
        -rad(s.pose.leftElbow),
        dt,
      );
    if (rightElbow.current)
      rightElbow.current.rotation.x = damp(
        rightElbow.current.rotation.x,
        -rad(s.pose.rightElbow),
        dt,
      );
    if (leftLeg.current)
      leftLeg.current.rotation.x = damp(
        leftLeg.current.rotation.x,
        rad(s.pose.leftLeg) + (dance ? Math.sin(t * 4) * 0.12 : 0),
        dt,
      );
    if (rightLeg.current)
      rightLeg.current.rotation.x = damp(
        rightLeg.current.rotation.x,
        rad(s.pose.rightLeg) + (dance ? -Math.sin(t * 4) * 0.12 : 0),
        dt,
      );
  });
  return (
    <group ref={root}>
      <group ref={body}>
        <group ref={head} position={[0, 2.34, 0]}>
          <mesh position={[0, 0.14, 0]}>
            <sphereGeometry args={[0.39, 40, 32]} />
            <meshPhysicalMaterial
              color="#f2dcd5"
              roughness={0.67}
              clearcoat={0.08}
              clearcoatRoughness={0.7}
            />
          </mesh>
          <mesh position={[0, 0.27, -0.09]} scale={[1, 1.06, 1]}>
            <sphereGeometry
              args={[0.405, 40, 32, 0, Math.PI * 2, 0, Math.PI * 0.66]}
            />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {[-1, 1].map((sign) => (
            <group key={sign}>
              <group
                ref={sign === -1 ? hairLeft : hairRight}
                position={[sign * 0.34, 0.24, -0.13]}
              >
                <mesh position={[0, -0.18, 0]}>
                  <capsuleGeometry args={[0.105, 0.73, 10, 20]} />
                  <meshStandardMaterial color={color} roughness={0.65} />
                </mesh>
                <mesh
                  position={[sign * 0.026, -0.26, 0.027]}
                  scale={[0.35, 1, 0.6]}
                >
                  <capsuleGeometry args={[0.07, 0.62, 8, 16]} />
                  <meshStandardMaterial
                    color="#d7c8f2"
                    transparent
                    opacity={0.23}
                  />
                </mesh>
              </group>
              <mesh
                position={[sign * 0.4, 0.31, -0.02]}
                rotation={[0, 0, sign * 0.35]}
              >
                <octahedronGeometry args={[0.1]} />
                <meshStandardMaterial
                  color="#e7d9ff"
                  metalness={0.6}
                  roughness={0.3}
                />
              </mesh>
              <mesh
                position={[sign * 0.23, 0.045, 0.31]}
                scale={[1, 0.4, 0.15]}
              >
                <sphereGeometry args={[0.075, 16, 12]} />
                <meshStandardMaterial
                  color="#f0a2ae"
                  transparent
                  opacity={
                    s.expression === "happy"
                      ? 0.25 + s.expressionIntensity * 0.45
                      : 0.18
                  }
                />
              </mesh>
              <mesh
                position={[sign * 0.135, 0.245, 0.344]}
                rotation={[
                  0,
                  0,
                  Math.PI / 2 +
                    (s.expression === "sad"
                      ? -sign * 0.35
                      : s.expression === "curious" && sign === 1
                        ? 0.2
                        : s.expression === "surprised"
                          ? sign * 0.2
                          : 0),
                ]}
              >
                <capsuleGeometry args={[0.012, 0.08, 4, 8]} />
                <meshStandardMaterial color="#88729e" />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.055, 0.376]} scale={[0.6, 1.15, 0.8]}>
            <sphereGeometry args={[0.028, 16, 12]} />
            <meshStandardMaterial color="#efd2c8" roughness={0.7} />
          </mesh>
          {[-1, 1].map((sign) => (
            <mesh
              key={sign}
              position={[sign * 0.365, 0.115, 0.015]}
              scale={[0.55, 1, 0.65]}
            >
              <sphereGeometry args={[0.064, 16, 12]} />
              <meshStandardMaterial color="#efcec7" roughness={0.72} />
            </mesh>
          ))}
          <group ref={eyes} position={[0, 0.15, 0]}>
            {[-1, 1].map((sign) => (
              <group key={sign}>
                <mesh
                  position={[sign * 0.13, 0, 0.348]}
                  scale={[1.25, 0.87, 0.45]}
                >
                  <sphereGeometry args={[0.061, 24, 18]} />
                  <meshStandardMaterial color="#f7f4f5" roughness={0.3} />
                </mesh>
                <mesh
                  position={[sign * 0.13, 0.047, 0.358]}
                  rotation={[0, 0, Math.PI / 2]}
                >
                  <capsuleGeometry args={[0.008, 0.075, 4, 10]} />
                  <meshStandardMaterial color="#5e4a69" />
                </mesh>
              </group>
            ))}
            <group ref={pupils}>
              {[-1, 1].map((sign) => (
                <group key={sign}>
                  <mesh
                    position={[sign * 0.13, -0.001, 0.375]}
                    scale={[1, 1.1, 0.3]}
                  >
                    <sphereGeometry args={[0.039, 24, 18]} />
                    <meshPhysicalMaterial
                      color="#766091"
                      roughness={0.19}
                      clearcoat={0.8}
                    />
                  </mesh>
                  <mesh
                    position={[sign * 0.13, -0.001, 0.388]}
                    scale={[0.7, 1, 0.25]}
                  >
                    <sphereGeometry args={[0.021, 16, 12]} />
                    <meshStandardMaterial color="#30253f" roughness={0.18} />
                  </mesh>
                  <mesh position={[sign * 0.14, 0.016, 0.397]}>
                    <sphereGeometry args={[0.01, 12, 10]} />
                    <meshBasicMaterial color="#fff" />
                  </mesh>
                  <mesh position={[sign * 0.12, -0.015, 0.393]}>
                    <sphereGeometry args={[0.004, 8, 8]} />
                    <meshBasicMaterial color="#e9dbff" />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
          <mesh
            position={[0, -0.028, 0.37]}
            geometry={smile}
            visible={s.expression !== "surprised" && !s.speaking}
          >
            <meshStandardMaterial color="#ba7189" />
          </mesh>
          <mesh ref={mouth} position={[0, -0.04, 0.365]} scale={[1, 0.25, 0.4]}>
            <sphereGeometry args={[0.055, 20, 16]} />
            <meshStandardMaterial color="#a56781" />
          </mesh>
        </group>
        <mesh position={[0, 2.235, 0]}>
          <cylinderGeometry args={[0.085, 0.1, 0.22, 20]} />
          <meshStandardMaterial color="#efd6ce" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.94, 0]}>
          <cylinderGeometry args={[0.19, 0.27, 0.66, 32]} />
          <meshStandardMaterial
            color="#ece8ff"
            metalness={0.15}
            roughness={0.55}
          />
        </mesh>
        <mesh position={[0, 1.43, 0]}>
          <cylinderGeometry args={[0.25, 0.58, 0.56, 48]} />
          <meshStandardMaterial
            color="#66528a"
            metalness={0.15}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.56, 0.02, 8, 48]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 2.02, 0.205]}>
          <octahedronGeometry args={[0.1]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
          />
        </mesh>
        {[-1, 1].map((sign) => (
          <group key={sign}>
            <group
              ref={sign === -1 ? leftArm : rightArm}
              position={[sign * 0.28, 2.15, 0]}
            >
              <mesh position={[sign * 0.025, -0.16, 0]}>
                <capsuleGeometry args={[0.065, 0.23, 8, 16]} />
                <meshStandardMaterial color="#f6dfdb" />
              </mesh>
              <mesh position={[sign * 0.025, -0.34, 0]}>
                <sphereGeometry args={[0.067, 16, 12]} />
                <meshStandardMaterial color="#f6dfdb" />
              </mesh>
              <group
                ref={sign === -1 ? leftElbow : rightElbow}
                position={[sign * 0.025, -0.34, 0]}
              >
                <mesh position={[0, -0.14, 0]}>
                  <capsuleGeometry args={[0.058, 0.2, 8, 16]} />
                  <meshStandardMaterial color="#f6dfdb" />
                </mesh>
                <mesh
                  position={[sign * -0.05, -0.285, 0.025]}
                  rotation={[0.2, 0, sign * 0.5]}
                >
                  <capsuleGeometry args={[0.024, 0.055, 5, 10]} />
                  <meshStandardMaterial color="#f1d8d0" />
                </mesh>
                {[0, 1, 2, 3].map((finger) => (
                  <mesh
                    key={finger}
                    position={[(finger - 1.5) * 0.023, -0.352, 0.006]}
                  >
                    <capsuleGeometry
                      args={[
                        0.014,
                        0.055 - Math.abs(finger - 1.5) * 0.009,
                        4,
                        8,
                      ]}
                    />
                    <meshStandardMaterial color="#f1d8d0" />
                  </mesh>
                ))}
                <mesh position={[0, -0.3, 0]} scale={[0.85, 1.15, 0.65]}>
                  <sphereGeometry args={[0.077, 16, 12]} />
                  <meshStandardMaterial color="#f6dfdb" />
                </mesh>
              </group>
            </group>
            <group
              ref={sign === -1 ? leftLeg : rightLeg}
              position={[sign * 0.18, 1.13, 0]}
            >
              <mesh position={[0, -0.37, 0]}>
                <capsuleGeometry args={[0.09, 0.7, 8, 16]} />
                <meshStandardMaterial color="#f6dfdb" />
              </mesh>
              <mesh position={[0, -0.82, 0.02]}>
                <capsuleGeometry args={[0.11, 0.42, 8, 16]} />
                <meshStandardMaterial color="#e9e2f9" roughness={0.5} />
              </mesh>
              <mesh position={[0, -1.045, 0.09]} scale={[1, 0.6, 1.6]}>
                <sphereGeometry args={[0.13, 16, 16]} />
                <meshStandardMaterial color="#d2c3ee" />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
