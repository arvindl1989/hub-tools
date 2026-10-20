import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Text } from '@react-three/drei'
import koneFont from '../assets/fonts/KONE-Information.ttf'
import { INTER, KONE_FONT } from './KoneUI'

// ── The field ────────────────────────────────────────────────────────────────
// Months run left to right, areas run back to front, and the height of a bar
// is the requests that area raised that month. One scale, one question: where
// the work came from and when.
//
// What was closed each month is NOT in here. It was, as a sand row behind the
// areas, and it was wrong twice over: a whole month's closures stood against
// one area's raises, so the sand dwarfed everything and invited a comparison
// that is not a comparison. Inflow against outflow is its own question and it
// is answered on its own strip, flat, under the canvas.
//
// Perspective is honest about shape and dishonest about value — a near bar
// looks taller than an equal one at the back — so every number the room is
// meant to read is on a flat panel, and the field is here to show the shape of
// the year.

const STEP = 1.45          // spacing between bars, both axes
const BAR = 0.85           // bar footprint
const MAX_H = 5.0          // the tallest bar in the field

const BLUE = ['#d0dcfd', '#a1b9fb', '#7296f9', '#4373f7', '#1450f5']
const INK = '#141414'

// A bar's colour comes from its own height, so the eye reads the landscape
// without checking a legend: the KONE blue scale, palest to full.
function blueFor(ratio) {
  if (!ratio) return BLUE[0]
  const i = Math.min(BLUE.length - 1, Math.floor(ratio * BLUE.length))
  return BLUE[i]
}

function Bar({ x, z, height, color, value, label, onHover, hovered }) {
  const mesh = useRef()
  // A bar that is zero still needs a footprint, or the grid develops holes
  // the eye reads as missing months rather than quiet ones.
  const h = Math.max(height, 0.04)
  return (
    <mesh
      ref={mesh}
      position={[x, h / 2, z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover({ value, label, x, z, h }) }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[BAR, h, BAR]} />
      <meshStandardMaterial
        color={color}
        emissive={hovered ? color : '#000000'}
        emissiveIntensity={hovered ? 0.55 : 0}
        roughness={0.35}
        metalness={0.12}
      />
    </mesh>
  )
}

function Field({ data, paused }) {
  const group = useRef()
  const [hover, setHover] = useState(null)
  const months = data.months ?? []
  const areas = data.areas ?? []
  const rows = areas.length
  const width = (months.length - 1) * STEP
  const depth = Math.max(rows - 1, 1) * STEP
  const x0 = -width / 2
  const z0 = -depth / 2

  const peak = Math.max(data.max ?? 0, 1)
  const zOf = (row) => z0 + row * STEP

  // Hovering holds the rotation still: chasing a bar that is turning away is
  // the fastest way to make a room motion-sick.
  useFrame((state, delta) => {
    if (group.current && !paused && !hover) group.current.rotation.y += delta * 0.055
  })

  const bars = useMemo(() => {
    const out = []
    for (const cell of data.grid ?? []) {
      const ratio = cell.n / peak
      out.push({
        key: `g${cell.m}-${cell.a}`,
        x: x0 + cell.m * STEP,
        z: zOf(cell.a),
        height: ratio * MAX_H,
        color: blueFor(ratio),
        value: cell.n,
        label: `${areas[cell.a]} · ${months[cell.m]?.label} ${months[cell.m]?.year}`,
      })
    }
    return out
  }, [data, peak])

  return (
    <group ref={group}>
      {/* The floor the field stands on, and the grid that keeps the eye
          aligned with the months once the scene has turned. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[width + STEP * 2, depth + STEP * 2]} />
        <meshStandardMaterial color="#1b1b1b" roughness={0.9} metalness={0} />
      </mesh>
      <gridHelper
        args={[width + STEP * 2, months.length + 1, '#2e2e2e', '#232323']}
        position={[0, 0, 0]}
        scale={[1, 1, (depth + STEP * 2) / (width + STEP * 2)]}
      />

      {bars.map(b => (
        <Bar key={b.key} {...b} onHover={setHover} hovered={hover?.label === b.label} />
      ))}

      {/* Month labels along the front edge, lying on the floor so they stay
          with the field as it turns. */}
      {months.map((m, i) => (
        <Text
          key={m.key}
          font={koneFont}
          position={[x0 + i * STEP, 0.02, zOf(rows - 1) + STEP * 1.25]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.5}
          color={m.label === 'Jan' ? '#ffffff' : '#9c9c9c'}
          anchorX="center"
          anchorY="middle"
        >
          {m.label}
        </Text>
      ))}

      {/* Area labels down the left edge. */}
      {areas.map((a, i) => (
        <Text
          key={a}
          font={koneFont}
          position={[x0 - STEP * 1.5, 0.02, zOf(i)]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.46}
          color="#9c9c9c"
          anchorX="center"
          anchorY="middle"
        >
          {a}
        </Text>
      ))}

      {hover && (
        <Html position={[hover.x, hover.h + 0.6, hover.z]} center distanceFactor={14}>
          <div style={{
            background: '#ffffff', color: INK, borderRadius: 8, padding: '8px 12px',
            fontFamily: INTER, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)', pointerEvents: 'none',
          }}>
            <span style={{ fontFamily: KONE_FONT, fontSize: 18, fontWeight: 700, marginRight: 8 }}>
              {hover.value}
            </span>
            {hover.label}
          </div>
        </Html>
      )}
    </group>
  )
}

export default function VolumeField({ data, paused = false }) {
  // A meeting-room machine without WebGL should say so rather than show a
  // blank rectangle in front of an audience.
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
        This screen needs WebGL, which this browser has turned off or cannot run.<br />
        Every figure here is also on the Dashboard tab.
      </div>
    )
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [13, 10.5, 17], fov: 40 }}
      gl={{ antialias: true }}
      style={{ background: 'transparent' }}
    >
      <color attach="background" args={['#101010']} />
      <fog attach="fog" args={['#101010', 24, 52]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[9, 16, 8]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* A cool rim light from behind, so the back row keeps an edge against
          the background instead of dissolving into it. */}
      <directionalLight position={[-10, 8, -12]} intensity={0.7} color="#4373f7" />
      <Field data={data} paused={paused} />
      <OrbitControls
        enablePan={false}
        // The mass of the field sits above the floor, so the camera looks at
        // the middle of the bars rather than at the plane they stand on —
        // aiming at the floor leaves the whole thing riding high in frame.
        target={[0, 0.4, 0]}
        minDistance={9}
        maxDistance={30}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.35}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  )
}
