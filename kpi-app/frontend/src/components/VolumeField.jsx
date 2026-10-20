import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Edges, OrbitControls, Text } from '@react-three/drei'
import koneFont from '../assets/fonts/KONE-Information.ttf'
import { INTER, ISO, KONE, KONE_INFO } from '../kone/worldConfig'

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

// The same tint ramp as the rest of the page, palest to full, with the same
// black line drawn over it. The field is the city's drawing of a year.
const BLUE = [KONE.blue20, KONE.blue40, KONE.blue60, KONE.blue80, KONE.blue]
const LINE = KONE.black
const INK = KONE.black
// Faces sit a hair back in the depth buffer so the line drawn on them always
// wins. Coplanar fill and outline is what makes line art shimmer.
const FILL = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }

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
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover({ value, label, x: e.clientX, y: e.clientY })
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        onHover({ value, label, x: e.clientX, y: e.clientY })
      }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
    >
      <boxGeometry args={[BAR, h, BAR]} />
      <meshBasicMaterial color={hovered ? KONE.lightBlue : color} toneMapped={false}
                         {...FILL} />
      <Edges threshold={15} color={LINE} lineWidth={hovered ? 2 : 1.2} />
    </mesh>
  )
}

function Field({ data, paused, onHover, hoverLabel }) {
  const group = useRef()
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
    if (group.current && !paused && !hoverLabel) group.current.rotation.y += delta * 0.055
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <planeGeometry args={[width + STEP * 2, depth + STEP * 2]} />
        <meshBasicMaterial color={KONE.white} toneMapped={false} {...FILL} />
      </mesh>
      <gridHelper
        args={[width + STEP * 2, months.length + 1, KONE.hairline, KONE.hairline]}
        position={[0, -0.04, 0]}
        scale={[1, 1, (depth + STEP * 2) / (width + STEP * 2)]}
      />

      {bars.map(b => (
        <Bar key={b.key} {...b} onHover={onHover} hovered={hoverLabel === b.label} />
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
          color={m.label === 'Jan' ? LINE : KONE.black60}
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
          color={KONE.black60}
          anchorX="center"
          anchorY="middle"
        >
          {a}
        </Text>
      ))}

    </group>
  )
}

export default function VolumeField({ data, paused = false }) {
  const [hover, setHover] = useState(null)
  const wrap = useRef()

  // The hover card is plain DOM over the canvas, placed from the pointer.
  // drei's <Html> scales itself from camera.zoom, which under an orthographic
  // projection meant the card grew with the zoom until it filled the view.
  const onHover = useCallback((info) => {
    if (!info) return setHover(null)
    const box = wrap.current?.getBoundingClientRect()
    setHover({ ...info, left: info.x - (box?.left ?? 0), top: info.y - (box?.top ?? 0) })
  }, [])

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
        color: KONE.black60, fontFamily: INTER, fontSize: 14, textAlign: 'center',
        padding: 40, background: KONE.white,
      }}>
        This screen needs WebGL, which this browser has turned off or cannot run.<br />
        Every figure here is also on the Dashboard tab.
      </div>
    )
  }

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', height: '100%' }}>
    <Canvas
      dpr={[1, 2]}
      flat
      orthographic
      camera={{ position: ISO.position, zoom: 30, near: -100, far: 400 }}
      gl={{ antialias: true }}
      style={{ background: KONE.white }}
    >
      <color attach="background" args={[KONE.white]} />
      <Field data={data} paused={paused} onHover={onHover} hoverLabel={hover?.label} />
      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 1.4, 0]}
        minAzimuthAngle={Math.PI / 4 - ISO.azimuthSwing}
        maxAzimuthAngle={Math.PI / 4 + ISO.azimuthSwing}
        minPolarAngle={Math.PI / 4.4}
        maxPolarAngle={Math.PI / 2.6}
        enableDamping
        dampingFactor={0.12}
        zoomSpeed={0.5}
        minZoom={16}
        maxZoom={64}
      />
    </Canvas>

    {hover && (
      <div style={{
        position: 'absolute', left: hover.left + 14, top: hover.top + 14,
        background: KONE.white, border: `1px solid ${KONE.hairline}`, borderRadius: 8,
        padding: '7px 11px', fontFamily: INTER, fontSize: 12, color: KONE.black,
        whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
      }}>
        <b style={{ fontFamily: KONE_INFO, marginRight: 7 }}>{hover.value}</b>
        {hover.label}
      </div>
    )}
    </div>
  )
}
