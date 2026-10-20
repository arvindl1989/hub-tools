import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Edges, Html, OrbitControls, OrthographicCamera, Text } from '@react-three/drei'
import koneFont from '../assets/fonts/KONE-Information.ttf'
import {
  INTER, ISO, KONE, KONE_INFO, LOW_SAMPLE, RIBBON, TOWER, ZONE, ZONES,
} from '../kone/worldConfig'

// ── The hub, drawn the way KONE draws a city ─────────────────────────────────
// White ground, black line, one blue ribbon carrying the flow, glass in light
// blue. Every structure is an unlit flat face with an outline on it — no
// emissive, no bloom, no specular, no fog — because the brand's illustration
// language is line art, and because a glow is a value nobody can read.
//
// The projection is orthographic isometric, and that is not a style choice:
// with no perspective, a block of a given size reads the same wherever it
// stands, so two areas with equal volume look equal whether they are near or
// far. The first build used a perspective camera and quietly flattered
// whatever happened to be closest to the viewer.
//
// The division of labour is strict. The scene shows shape, relative size and
// flow. Every exact number is on a flat DOM surface — the zone labels, the
// ribbon badges, the side panel. Nothing in the geometry encodes headcount,
// logged time or capacity, because the export contains none of those.

const LINE = KONE.black
const GLASS = KONE.lightBlue

// A flat, unlit face with a drawn edge: the whole visual language in one place.
function Solid({ args, position, rotation, color = KONE.white, opacity = 1,
                 lineWidth = 1.5, children, ...rest }) {
  return (
    <mesh position={position} rotation={rotation} {...rest}>
      <boxGeometry args={args} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity}
                         toneMapped={false} />
      <Edges threshold={15} color={LINE} lineWidth={lineWidth} />
      {children}
    </mesh>
  )
}

// ── People ───────────────────────────────────────────────────────────────────
// Two per storey, every storey, deliberately. They are the brand illustration's
// figures and they are decorative: the same count everywhere, so that nobody
// can read them as headcount — which this export does not contain.
function Person({ position }) {
  return (
    <group position={position}>
      <Solid args={[0.17, 0.42, 0.17]} position={[0, 0.21, 0]} lineWidth={1.2} />
      <mesh position={[0, 0.54, 0]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color={KONE.white} toneMapped={false} />
        <Edges threshold={30} color={LINE} lineWidth={1.2} />
      </mesh>
    </group>
  )
}

// ── The tower: one storey per area ───────────────────────────────────────────
function Storey({ index, floor, widest, selected, hovered, onPick, onHover }) {
  const y = index * TOWER.storey
  const share = widest ? floor.requests / widest : 0
  const blockW = Math.max(TOWER.minBlock, share * (TOWER.width - 1.4))
  const lit = selected || hovered

  return (
    <group position={[TOWER.x, y, TOWER.z]}>
      <Solid
        args={[TOWER.width, TOWER.slab, TOWER.depth]}
        position={[0, TOWER.slab / 2, 0]}
        color={lit ? GLASS : KONE.white}
        onClick={(e) => { e.stopPropagation(); onPick(floor) }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(floor.key) }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
      />

      {/* The volume block: width is this area's requests against the busiest. */}
      <Solid
        args={[blockW, 1.05, 1.9]}
        position={[-(TOWER.width - blockW) / 2 + 0.7, TOWER.slab + 0.525, -0.7]}
        color={KONE.blue}
      />

      {/* A glass curtain at the back, so a storey reads as a floor of a
          building rather than a shelf. */}
      <Solid args={[TOWER.width, TOWER.storey - TOWER.slab, 0.08]}
             position={[0, TOWER.slab + (TOWER.storey - TOWER.slab) / 2, -TOWER.depth / 2]}
             color={GLASS} opacity={0.6} lineWidth={1} />

      {[[-TOWER.width / 2 + 0.22, -TOWER.depth / 2 + 0.22],
        [TOWER.width / 2 - 0.22, -TOWER.depth / 2 + 0.22],
        [-TOWER.width / 2 + 0.22, TOWER.depth / 2 - 0.22],
        [TOWER.width / 2 - 0.22, TOWER.depth / 2 - 0.22]].map(([cx, cz]) => (
          <Solid key={`${cx},${cz}`} args={[0.14, TOWER.storey - TOWER.slab, 0.14]}
                 position={[cx, TOWER.slab + (TOWER.storey - TOWER.slab) / 2, cz]}
                 lineWidth={1.2} />
        ))}

      <Person position={[TOWER.width / 2 - 1.5, TOWER.slab, TOWER.depth / 2 - 1.0]} />
      <Person position={[TOWER.width / 2 - 2.3, TOWER.slab, TOWER.depth / 2 - 1.6]} />

      <Text
        font={koneFont}
        position={[-TOWER.width / 2 + 0.4, TOWER.slab + 0.34, TOWER.depth / 2 + 0.02]}
        fontSize={0.42}
        color={LINE}
        anchorX="left"
        anchorY="middle"
      >
        {String(floor.name).toUpperCase()}
      </Text>

      {lit && (
        <Html position={[0, TOWER.slab + 1.7, TOWER.depth / 2]} center distanceFactor={13}>
          <div style={{
            background: KONE.white, color: LINE, border: `1px solid ${KONE.hairline}`,
            borderRadius: 8, padding: '7px 11px', fontFamily: INTER, fontSize: 12,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            <b style={{ fontFamily: KONE_INFO }}>{floor.requests}</b> requests ·{' '}
            {floor.users} requesters
          </div>
        </Html>
      )}
    </group>
  )
}

// ── The hero ribbon: everything that came in, and everything that went out ───
// One blue ribbon in the shape of the reference's "7" — a diagonal up from the
// ground and a flat run across the top. Two lanes of steps ride it: raised
// climbing in KONE Blue, closed descending in sand. The motion is the hook;
// the badges beside it are the reading.
function Ribbon({ flow, top, reducedMotion }) {
  const up = useRef([])
  const down = useRef([])
  const phase = useRef(0)

  const rise = top
  const run = RIBBON.footZ - RIBBON.headZ
  const length = Math.hypot(rise, run)
  const angle = Math.atan2(rise, run)
  const laneX = [-RIBBON.width / 4, RIBBON.width / 4]

  useFrame((state, delta) => {
    if (reducedMotion) return
    phase.current = (phase.current + delta) % 1000
    const place = (arr, speed, descending) => {
      arr.forEach((m, i) => {
        if (!m) return
        const raw = ((i / RIBBON.steps) + phase.current * speed) % 1
        const f = descending ? 1 - raw : raw
        m.position.y = f * rise + 0.18
        m.position.z = RIBBON.footZ - f * run
        m.visible = f > 0.04 && f < 0.96
      })
    }
    place(up.current, flow.inSpeed ?? 0.3, false)
    place(down.current, flow.outSpeed ?? 0.3, true)
  })

  const steps = (ref, color, lane, descending) => (
    Array.from({ length: RIBBON.steps }).map((_, i) => {
      // With motion reduced the steps are placed once, evenly, and left alone.
      const f = descending ? 1 - (i + 0.5) / RIBBON.steps : (i + 0.5) / RIBBON.steps
      return (
        <mesh
          key={i}
          ref={el => { ref.current[i] = el }}
          position={[lane, f * rise + 0.18, RIBBON.footZ - f * run]}
        >
          <boxGeometry args={[RIBBON.width / 2 - 0.14, 0.12, 0.34]} />
          <meshBasicMaterial color={color} toneMapped={false} />
          <Edges threshold={20} color={LINE} lineWidth={1} />
        </mesh>
      )
    })
  )

  return (
    <group position={[RIBBON.x, 0, 0]}>
      {/* The ribbon: blue outer face with a pale blue inner, the way the brand
          illustration draws a folded band. */}
      <Solid args={[RIBBON.width, 0.14, length]}
             position={[0, rise / 2, (RIBBON.footZ + RIBBON.headZ) / 2]}
             rotation={[angle, 0, 0]} color={KONE.blue} />
      <Solid args={[RIBBON.width - 0.26, 0.05, length - 0.3]}
             position={[0, rise / 2 + 0.1, (RIBBON.footZ + RIBBON.headZ) / 2]}
             rotation={[angle, 0, 0]} color={KONE.blue20} lineWidth={1} />
      {/* The top run of the "7". */}
      <Solid args={[RIBBON.topRun, 0.14, RIBBON.width]}
             position={[RIBBON.topRun / 2 - RIBBON.width / 2 + 0.2, rise + 0.07,
                        RIBBON.headZ]}
             color={KONE.blue} />

      {steps(up, KONE.blue, laneX[0], false)}
      {steps(down, KONE.sand, laneX[1], true)}

      <Text font={koneFont} position={[0, 0.02, RIBBON.footZ + 1.2]}
            rotation={[-Math.PI / 2, 0, 0]} fontSize={0.36} color={LINE}
            anchorX="center" anchorY="middle">
        REQUESTS IN AND OUT
      </Text>
    </group>
  )
}

// ── A zone: one KPI, standing on its own ─────────────────────────────────────
// Each KPI has its own small building, its own shaft, its own scale and its own
// target. They are deliberately apart. Three shafts in a row at a shared height
// invited a comparison between a percentage, a different percentage and a score
// out of five — which is not a comparison anybody can make, and was the most
// misleading thing about the first build.
function Zone({ at, kpi, selected, hovered, onPick, onHover, reducedMotion }) {
  const car = useRef()
  const [x, z] = at
  const max = kpi.max || 100
  const frac = kpi.value == null ? 0 : Math.min(1, Math.max(0, kpi.value / max))
  const travel = ZONE.shaftH - ZONE.carH - 0.3
  const rideTo = 0.9 + frac * travel + 0.5

  useFrame((state, delta) => {
    if (!car.current) return
    if (reducedMotion) { car.current.position.y = rideTo; return }
    const y = car.current.position.y
    // Quiet motion: eased in, no bounce, settled well inside a second.
    car.current.position.y = y + (rideTo - y) * Math.min(1, delta * 4)
  })

  const lit = selected || hovered
  const low = kpi.value != null && kpi.sample != null && kpi.sample < LOW_SAMPLE
  const targetFrac = kpi.target == null ? null : Math.min(1, kpi.target / max)

  return (
    <group position={[x, 0, z]}>
      {/* The little building the shaft belongs to */}
      <Solid args={[ZONE.footprint, 0.9, ZONE.footprint]} position={[0, 0.45, 0]}
             color={lit ? GLASS : KONE.white}
             onClick={(e) => { e.stopPropagation(); onPick(kpi) }}
             onPointerOver={(e) => { e.stopPropagation(); onHover(kpi.key) }}
             onPointerOut={(e) => { e.stopPropagation(); onHover(null) }} />
      <Person position={[ZONE.footprint / 2 + 0.5, 0, ZONE.footprint / 2 - 0.2]} />

      {/* The shaft, in glass, carrying this KPI's own scale */}
      <Solid args={[ZONE.shaftW, ZONE.shaftH, ZONE.shaftW]}
             position={[0, 0.9 + ZONE.shaftH / 2, 0]} color={GLASS} opacity={0.6} />

      {/* The target, in KONE Blue, on that same scale */}
      {targetFrac != null && (
        <group position={[0, 0.9 + targetFrac * travel + 0.5, 0]}>
          <Solid args={[ZONE.shaftW + 0.3, 0.05, ZONE.shaftW + 0.3]}
                 color={KONE.blue} lineWidth={1} />
          <Text font={koneFont} position={[ZONE.shaftW / 2 + 0.3, 0.1, 0]}
                fontSize={0.26} color={KONE.blue} anchorX="left" anchorY="middle">
            {`TARGET ${kpi.targetLabel}`}
          </Text>
        </group>
      )}

      {/* The car. Hollow when the sample behind it is too small to be a
          reading — an outline rather than a solid is the shape of "not yet". */}
      <group ref={car} position={[0, 0.9, 0]}>
        <mesh>
          <boxGeometry args={[ZONE.shaftW - 0.16, ZONE.carH, ZONE.shaftW - 0.16]} />
          <meshBasicMaterial color={low ? KONE.white : KONE.blue} toneMapped={false} />
          <Edges threshold={15} color={LINE} lineWidth={low ? 2.5 : 1.5} />
        </mesh>
      </group>

      <Text font={koneFont} position={[0, 0.02, ZONE.footprint / 2 + 0.8]}
            rotation={[-Math.PI / 2, 0, 0]} fontSize={0.34} color={LINE}
            anchorX="center" anchorY="middle">
        {kpi.short}
      </Text>
    </group>
  )
}

function Scene({ world, selected, onPick, reducedMotion }) {
  const [hover, setHover] = useState(null)
  const floors = world.floors ?? []
  const widest = Math.max(1, ...floors.map(f => f.requests))
  const top = Math.max(3, floors.length) * TOWER.storey

  return (
    <>
      {/* White ground with a hairline grid — the reference's paper, not a
          lit floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color={KONE.white} toneMapped={false} />
      </mesh>
      <gridHelper args={[64, 32, KONE.hairline, KONE.hairline]} position={[0, -0.01, 0]} />

      {floors.map((f, i) => (
        <Storey
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

      <Ribbon flow={world.flow ?? {}} top={top} reducedMotion={reducedMotion} />

      {ZONES.map(z => {
        const kpi = (world.kpis ?? []).find(k => k.key === z.key)
        if (!kpi) return null
        return (
          <Zone
            key={z.key}
            at={z.at}
            kpi={kpi}
            selected={selected?.kind === 'kpi' && selected.key === kpi.key}
            hovered={hover === kpi.key}
            onPick={(k) => onPick({ kind: 'kpi', ...k })}
            onHover={setHover}
            reducedMotion={reducedMotion}
          />
        )
      })}
    </>
  )
}

export default function KoneWorld({ world, selected, onPick, tour = false }) {
  const supported = useMemo(() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch { return false }
  }, [])

  const reducedMotion = useMemo(() => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    } catch { return false }
  }, [])

  if (!supported) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: KONE.black60, fontFamily: INTER, fontSize: 14, textAlign: 'center',
        padding: 40, background: KONE.white,
      }}>
        This view needs WebGL, which this browser has turned off or cannot run.<br />
        Every figure in it is also on the Dashboard, User Activity and Feedback tabs.
      </div>
    )
  }

  return (
    <Canvas
      dpr={[1, 2]}
      flat
      gl={{ antialias: true }}
      style={{ background: KONE.white }}
      onPointerMissed={() => onPick(null)}
    >
      <color attach="background" args={[KONE.white]} />
      <OrthographicCamera makeDefault position={ISO.position} zoom={ISO.zoom}
                          near={-300} far={600} />
      <Scene world={world} selected={selected} onPick={onPick}
             reducedMotion={reducedMotion} />
      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0.5, 3.4, 3.2]}
        // A gentle swing either side of the isometric station point: the view
        // is a drawing, and a drawing has one angle it is drawn at.
        minAzimuthAngle={Math.PI / 4 - ISO.azimuthSwing}
        maxAzimuthAngle={Math.PI / 4 + ISO.azimuthSwing}
        minPolarAngle={Math.PI / 4.4}
        maxPolarAngle={Math.PI / 2.6}
        autoRotate={tour && !reducedMotion}
        autoRotateSpeed={0.3}
        enableDamping
        dampingFactor={0.1}
        zoomSpeed={0.6}
      />
    </Canvas>
  )
}
