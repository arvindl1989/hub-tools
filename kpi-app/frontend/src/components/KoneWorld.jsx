import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Text } from '@react-three/drei'
import koneFont from '../assets/fonts/KONE-Information.ttf'
import { INTER, KONE_FONT } from './KoneUI'

// ── A building made of the figures ───────────────────────────────────────────
// KONE moves people through buildings, so the hub's own numbers are put in one:
// every area is a floor, the three headline rates ride the lift bank at the
// side, and the escalators at the front carry what came in and what went out.
//
// The metaphor is load-bearing, not decoration. A lift car stops at the height
// of its percentage against a scale marked on the shaft, so three unrelated
// rates can be compared at a glance without three axes. An escalator's steps
// move at the rate work actually arrives, so a month where more is raised than
// closed is a building where the up escalator outruns the down one.
//
// What the shape cannot say exactly, the panel beside it says in figures:
// nothing here asks anyone to read a value off a perspective drawing.

const BLUE = '#1450f5'
const BLUE_MID = '#4373f7'
const BLUE_PALE = '#a1b9fb'
const SAND = '#F3EEE6'
const GLASS = '#2a3f7a'

const STOREY = 2.45        // floor to floor
const FLOOR_W = 9.0
const FLOOR_D = 6.4
const SLAB = 0.26
const TOWER_X = -2.2

const SHAFT_X = [3.5, 5.3, 7.1]
const SHAFT_W = 1.35

// ── Floors ───────────────────────────────────────────────────────────────────
// One per area, stacked in the order the data gives, busiest at the bottom:
// a building carries its weight low down and so does this one.
function Floor({ index, floor, widest, selected, hovered, onPick, onHover }) {
  const y = index * STOREY
  // The slab is full width; the blue block on it is the area's volume, so the
  // tower reads as a stack of unequal loads rather than a uniform block.
  const share = widest ? floor.requests / widest : 0
  const blockW = Math.max(0.6, share * (FLOOR_W - 1.6))
  const lit = selected || hovered

  return (
    <group position={[TOWER_X, y, 0]}>
      {/* Slab */}
      <mesh
        position={[0, SLAB / 2, 0]}
        onClick={(e) => { e.stopPropagation(); onPick(floor) }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(floor.key) }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[FLOOR_W, SLAB, FLOOR_D]} />
        <meshStandardMaterial
          color={lit ? '#30303a' : '#1e1e24'}
          emissive={lit ? BLUE : '#000000'}
          emissiveIntensity={lit ? 0.3 : 0}
          roughness={0.6}
          metalness={0.25}
        />
      </mesh>

      {/* The volume block standing on it */}
      <mesh position={[-(FLOOR_W - blockW) / 2 + 0.8, SLAB + 0.62, -0.6]} castShadow>
        <boxGeometry args={[blockW, 1.15, 2.2]} />
        <meshStandardMaterial
          color={lit ? BLUE : BLUE_MID}
          emissive={BLUE}
          emissiveIntensity={lit ? 0.5 : 0.18}
          roughness={0.3}
          metalness={0.3}
        />
      </mesh>

      {/* Corner columns up to the next slab */}
      {[[-FLOOR_W / 2 + 0.3, -FLOOR_D / 2 + 0.3], [FLOOR_W / 2 - 0.3, -FLOOR_D / 2 + 0.3],
        [-FLOOR_W / 2 + 0.3, FLOOR_D / 2 - 0.3], [FLOOR_W / 2 - 0.3, FLOOR_D / 2 - 0.3]]
        .map(([cx, cz]) => (
          <mesh key={`${cx},${cz}`} position={[cx, SLAB + (STOREY - SLAB) / 2, cz]}>
            <boxGeometry args={[0.18, STOREY - SLAB, 0.18]} />
            <meshStandardMaterial color="#343440" roughness={0.5} metalness={0.5} />
          </mesh>
        ))}

      {/* The area's name, cut into the front edge of its own slab */}
      <Text
        font={koneFont}
        position={[-FLOOR_W / 2 + 0.55, SLAB + 0.35, FLOOR_D / 2 + 0.02]}
        fontSize={0.52}
        color={lit ? '#ffffff' : '#8d8d99'}
        anchorX="left"
        anchorY="middle"
      >
        {floor.name}
      </Text>

      {lit && (
        <Html position={[0, SLAB + 2.0, FLOOR_D / 2]} center distanceFactor={16}>
          <div style={{
            background: '#ffffff', color: '#141414', borderRadius: 8, padding: '8px 12px',
            fontFamily: INTER, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}>
            <b style={{ fontFamily: KONE_FONT, fontSize: 16 }}>{floor.requests}</b> requests
            {' · '}{floor.users} users
            {floor.score != null && <> · {floor.score.toFixed(1)}★</>}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── The lift bank ────────────────────────────────────────────────────────────
// Three shafts, three rates, one scale. A car rides to its own percentage of
// the building's height, so "on time", "engaged" and "satisfied" can be read
// against each other without three different axes to reconcile.
function Lift({ x, kpi, height, selected, hovered, onPick, onHover }) {
  const car = useRef()
  const top = height - 1.4
  const target = ((kpi.value ?? 0) / 100) * top + 0.85

  // The car rides up on arrival rather than appearing at its floor: the
  // movement is what tells a room that the height means something.
  useFrame((state, delta) => {
    if (!car.current) return
    const y = car.current.position.y
    car.current.position.y = y + (target - y) * Math.min(1, delta * 2.2)
  })

  const lit = selected || hovered
  const rail = lit ? '#6f8ff9' : '#3a4a74'
  return (
    <group position={[x, 0, 0]}>
      {/* Four rails and a head beam. Glass alone disappeared against a black
          background — a shaft has to have edges to read as a shaft. */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx},${sz}`}
              position={[sx * SHAFT_W / 2, height / 2, sz * SHAFT_W / 2]}>
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color={rail} emissive={rail}
                                emissiveIntensity={lit ? 0.5 : 0.2}
                                roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.08, 0]}>
        <boxGeometry args={[SHAFT_W + 0.16, 0.16, SHAFT_W + 0.16]} />
        <meshStandardMaterial color={rail} roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[SHAFT_W, height, SHAFT_W]} />
        <meshStandardMaterial color={GLASS} transparent opacity={lit ? 0.3 : 0.18}
                              roughness={0.1} metalness={0.6} />
      </mesh>

      {/* The scale the car is read against: a mark every 25%, the top one in
          sand so full height is unmistakable. */}
      {[0, 25, 50, 75, 100].map(p => (
        <mesh key={p} position={[SHAFT_W / 2 + 0.07, (p / 100) * top + 0.85, 0]}>
          <boxGeometry args={[0.12, 0.035, SHAFT_W * 0.85]} />
          <meshStandardMaterial color={p === 100 ? SAND : '#55556a'} />
        </mesh>
      ))}

      {/* Car and reading, riding together */}
      <group ref={car} position={[0, 0.85, 0]}>
        <mesh
          onClick={(e) => { e.stopPropagation(); onPick(kpi) }}
          onPointerOver={(e) => { e.stopPropagation(); onHover(kpi.key) }}
          onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
          castShadow
        >
          <boxGeometry args={[SHAFT_W - 0.2, 1.2, SHAFT_W - 0.2]} />
          <meshStandardMaterial
            color={kpi.tone}
            emissive={kpi.tone}
            emissiveIntensity={lit ? 0.8 : 0.4}
            roughness={0.25}
            metalness={0.4}
          />
        </mesh>
        <Text
          font={koneFont}
          position={[0, 0, SHAFT_W / 2 + 0.06]}
          fontSize={0.46}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {kpi.value == null ? '—' : `${Math.round(kpi.value)}%`}
        </Text>
      </group>

      {/* The name at the foot, where it stays in frame however tall the
          building gets — above the shaft it was cropped off the top. */}
      <Text
        font={koneFont}
        position={[0, 0.02, SHAFT_W / 2 + 1.0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color={lit ? '#ffffff' : '#8d8d99'}
        anchorX="center"
        anchorY="middle"
      >
        {kpi.short}
      </Text>
    </group>
  )
}

// ── The escalators ───────────────────────────────────────────────────────────
// One carries work in, the other carries it out, and the steps move at the
// rate each actually ran over the window. When the up escalator is visibly
// quicker than the down one, the backlog is growing — which is the one thing
// about flow a still picture cannot tell you.
function Escalator({ x, rise, run, speed, color, label, down = false }) {
  const steps = useRef([])
  const phase = useRef(0)
  const COUNT = 16

  // Both escalators have the same geometry — they lean the same way against
  // the same building. Only the steps differ: one set climbs, the other
  // descends. Mirroring the truss as well left one of them lying flat on the
  // ground, which is not a thing an escalator does.
  useFrame((state, delta) => {
    phase.current = (phase.current + delta * speed) % 1
    steps.current.forEach((m, i) => {
      if (!m) return
      const raw = (i / COUNT + phase.current) % 1
      const f = down ? 1 - raw : raw
      // The far end is the top, at the building; the near end is the ground.
      m.position.set(0, f * rise + 0.14, (0.5 - f) * run)
      m.visible = f > 0.03 && f < 0.97
    })
  })

  const angle = Math.atan2(rise, run)
  const length = Math.hypot(rise, run)
  return (
    <group position={[x, 0, 0]}>
      {/* Truss */}
      <mesh position={[0, rise / 2, 0]} rotation={[angle, 0, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.22, length]} />
        <meshStandardMaterial color="#2a2a33" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Balustrades */}
      {[-0.78, 0.78].map(side => (
        <mesh key={side} position={[side, rise / 2 + 0.6, 0]} rotation={[angle, 0, 0]}>
          <boxGeometry args={[0.07, 0.95, length]} />
          <meshStandardMaterial color={GLASS} transparent opacity={0.35}
                                roughness={0.1} metalness={0.6} />
        </mesh>
      ))}
      {/* Steps */}
      {Array.from({ length: COUNT }).map((_, i) => (
        <mesh key={i} ref={el => { steps.current[i] = el }} castShadow>
          <boxGeometry args={[1.3, 0.14, 0.4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45}
                                roughness={0.3} metalness={0.3} />
        </mesh>
      ))}
      {/* A chevron of the same colour at the foot, pointing the way the steps
          actually travel. */}
      <Text
        font={koneFont}
        position={[0, 0.03, run / 2 + 1.0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color={color === SAND ? SAND : '#8d8d99'}
        anchorX="center"
        anchorY="middle"
      >
        {down ? `${label} \u2193` : `\u2191 ${label}`}
      </Text>
    </group>
  )
}

function Scene({ world, selected, onPick, paused }) {
  const [hover, setHover] = useState(null)
  const floors = world.floors ?? []
  const kpis = world.kpis ?? []
  const widest = Math.max(1, ...floors.map(f => f.requests))
  const height = Math.max(3, floors.length) * STOREY

  return (
    <>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#121216" roughness={0.95} />
      </mesh>
      <gridHelper args={[70, 35, '#23232c', '#1a1a21']} position={[0, 0, 0]} />

      {floors.map((f, i) => (
        <Floor
          key={f.key}
          index={i}
          floor={f}
          widest={widest}
          selected={selected?.kind === 'floor' && selected.key === f.key}
          hovered={hover === f.key}
          onPick={(fl) => onPick({ kind: 'floor', ...fl })}
          onHover={setHover}
        />
      ))}

      {kpis.map((k, i) => (
        <Lift
          key={k.key}
          x={SHAFT_X[i] ?? (SHAFT_X[0] + i * 1.9)}
          kpi={k}
          height={height}
          selected={selected?.kind === 'kpi' && selected.key === k.key}
          hovered={hover === k.key}
          onPick={(kk) => onPick({ kind: 'kpi', ...kk })}
          onHover={setHover}
        />
      ))}

      {/* In at the front, out beside it */}
      <group position={[TOWER_X, 0, FLOOR_D / 2 + 3.4]}>
        <Escalator x={-2.2} rise={STOREY} run={4.4} color={BLUE}
                   speed={world.flow?.inSpeed ?? 0.25} label="RAISED" />
        <Escalator x={2.2} rise={STOREY} run={4.4} color={SAND}
                   speed={world.flow?.outSpeed ?? 0.25} label="CLOSED" down />
      </group>
    </>
  )
}

export default function KoneWorld({ world, selected, onPick, paused = false }) {
  const supported = useMemo(() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch { return false }
  }, [])

  if (!supported) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9c9c9c', fontFamily: INTER, fontSize: 14, textAlign: 'center', padding: 40,
      }}>
        This building needs WebGL, which this browser has turned off or cannot run.<br />
        Every figure in it is also on the Dashboard, User Activity and Feedback tabs.
      </div>
    )
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [17, 12, 20], fov: 38 }}
      gl={{ antialias: true }}
      onPointerMissed={() => onPick(null)}
    >
      <color attach="background" args={['#0b0b0e']} />
      <fog attach="fog" args={['#0b0b0e', 30, 70]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[12, 20, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-14, 10, -10]} intensity={0.8} color={BLUE_PALE} />
      <pointLight position={[0, 3, 12]} intensity={28} distance={30} color={BLUE} />
      <Scene world={world} selected={selected} onPick={onPick} paused={paused} />
      <OrbitControls
        enablePan={false}
        target={[1, 4.5, 0]}
        minDistance={14}
        maxDistance={46}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={!paused}
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  )
}
