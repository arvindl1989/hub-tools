import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Edges, OrbitControls, Text } from '@react-three/drei'
import koneFont from '../assets/fonts/KONE-Information.ttf'
import {
  INTER, ISO, KONE, KONE_INFO, LOW_SAMPLE, RIBBON, TOWER, ZONE, ZONES,
} from '../kone/worldConfig'

// ── The hub, drawn the way KONE draws a city ─────────────────────────────────
// White ground, black line, one blue ribbon carrying the flow, glass in light
// blue. Every structure is an unlit flat face with an outline drawn on it.
//
// Four things made the first illustrated build flicker and jump, and all four
// are fixed here rather than papered over:
//
//   1. The camera was a <OrthographicCamera makeDefault> component. React
//      re-applied its position and zoom on EVERY render — so every hover and
//      every selection yanked the camera back to its starting station while
//      OrbitControls was still damping towards where you had dragged it. That
//      is the jumping. The camera is now configured once, on the Canvas.
//   2. Hover cards were drei <Html distanceFactor>. Under an orthographic
//      camera that factor is computed from camera.zoom, so the card scaled
//      with the zoom and could fill the screen. That is the "massively zooms
//      in". Tooltips are now ordinary DOM, positioned from the pointer, drawn
//      outside the canvas.
//   3. The ground plane and the grid sat 0.01 apart, and every Edges line sat
//      exactly on the face it outlined. Coplanar surfaces fight for the depth
//      buffer and strobe. Fills now carry a polygon offset so the lines sit
//      clear of them, and the grid is a single plane with the ground.
//   4. Transparent glass wrote to the depth buffer, so whatever was drawn
//      first hid what came after depending on the angle. The glass no longer
//      writes depth and is drawn last.
//
// The division of labour is unchanged: the drawing shows shape, relative size
// and flow; every exact number is on a flat surface beside it.

const LINE = KONE.black
const GLASS = KONE.lightBlue

// Faces are pushed a hair back in the depth buffer so the outline drawn on
// them always wins. This is what stops the line art shimmering.
const FILL = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }

function Solid({ args, position, rotation, color = KONE.white, opacity = 1,
                 lineWidth = 1.5, renderOrder, children, ...rest }) {
  const clear = opacity < 1
  return (
    <mesh position={position} rotation={rotation} renderOrder={renderOrder} {...rest}>
      <boxGeometry args={args} />
      <meshBasicMaterial
        color={color}
        transparent={clear}
        opacity={opacity}
        // Glass must not write depth, or it hides the things behind it
        // according to draw order rather than distance.
        depthWrite={!clear}
        toneMapped={false}
        {...FILL}
      />
      <Edges threshold={15} color={LINE} lineWidth={lineWidth} />
      {children}
    </mesh>
  )
}

// Two per storey, every storey, deliberately: the brand illustration's figures,
// decorative, and the same count everywhere so nobody reads them as headcount.
function Person({ position }) {
  return (
    <group position={position}>
      <Solid args={[0.17, 0.42, 0.17]} position={[0, 0.21, 0]} lineWidth={1.2} />
      <mesh position={[0, 0.54, 0]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color={KONE.white} toneMapped={false} {...FILL} />
        <Edges threshold={30} color={LINE} lineWidth={1.2} />
      </mesh>
    </group>
  )
}

function Storey({ index, floor, widest, selected, hovered, onPick, onHover }) {
  const y = index * TOWER.storey
  const share = widest ? floor.requests / widest : 0
  const blockW = Math.max(TOWER.minBlock, share * (TOWER.width - 1.4))
  const lit = selected || hovered

  const enter = (e) => {
    e.stopPropagation()
    onHover({ key: floor.key, label: `${floor.name} · ${floor.requests} requests · `
              + `${floor.users} requesters`, x: e.clientX, y: e.clientY })
  }

  return (
    <group position={[TOWER.x, y, TOWER.z]}>
      <Solid
        args={[TOWER.width, TOWER.slab, TOWER.depth]}
        position={[0, TOWER.slab / 2, 0]}
        color={lit ? GLASS : KONE.white}
        onClick={(e) => { e.stopPropagation(); onPick(floor) }}
        onPointerOver={enter}
        onPointerMove={enter}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
      />

      <Solid
        args={[blockW, 1.05, 1.9]}
        position={[-(TOWER.width - blockW) / 2 + 0.7, TOWER.slab + 0.525, -0.7]}
        color={KONE.blue}
      />

      <Solid args={[TOWER.width, TOWER.storey - TOWER.slab, 0.06]}
             position={[0, TOWER.slab + (TOWER.storey - TOWER.slab) / 2,
                        -TOWER.depth / 2 + 0.04]}
             color={GLASS} opacity={0.55} lineWidth={1} renderOrder={10} />

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
        position={[-TOWER.width / 2 + 0.4, TOWER.slab + 0.34, TOWER.depth / 2 + 0.06]}
        fontSize={0.42}
        color={LINE}
        anchorX="left"
        anchorY="middle"
      >
        {String(floor.name).toUpperCase()}
      </Text>
    </group>
  )
}

// ── The hero ribbon ──────────────────────────────────────────────────────────
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
    phase.current += delta
    const place = (arr, speed, descending) => {
      arr.forEach((m, i) => {
        if (!m) return
        const raw = ((i / RIBBON.steps) + phase.current * speed) % 1
        const f = descending ? 1 - raw : raw
        m.position.y = f * rise + 0.2
        m.position.z = RIBBON.footZ - f * run
        m.visible = f > 0.05 && f < 0.95
      })
    }
    place(up.current, flow.inSpeed ?? 0.3, false)
    place(down.current, flow.outSpeed ?? 0.3, true)
  })

  const steps = (ref, color, lane, descending) => (
    Array.from({ length: RIBBON.steps }).map((_, i) => {
      const f = descending ? 1 - (i + 0.5) / RIBBON.steps : (i + 0.5) / RIBBON.steps
      return (
        <mesh key={i} ref={el => { ref.current[i] = el }}
              position={[lane, f * rise + 0.2, RIBBON.footZ - f * run]}>
          <boxGeometry args={[RIBBON.width / 2 - 0.14, 0.12, 0.34]} />
          <meshBasicMaterial color={color} toneMapped={false} {...FILL} />
          <Edges threshold={20} color={LINE} lineWidth={1} />
        </mesh>
      )
    })
  )

  return (
    <group position={[RIBBON.x, 0, 0]}>
      <Solid args={[RIBBON.width, 0.14, length]}
             position={[0, rise / 2, (RIBBON.footZ + RIBBON.headZ) / 2]}
             rotation={[angle, 0, 0]} color={KONE.blue} />
      <Solid args={[RIBBON.width - 0.26, 0.05, length - 0.3]}
             position={[0, rise / 2 + 0.12, (RIBBON.footZ + RIBBON.headZ) / 2]}
             rotation={[angle, 0, 0]} color={KONE.blue20} lineWidth={1} />
      <Solid args={[RIBBON.topRun, 0.14, RIBBON.width]}
             position={[RIBBON.topRun / 2 - RIBBON.width / 2 + 0.2, rise + 0.07,
                        RIBBON.headZ]}
             color={KONE.blue} />

      {steps(up, KONE.blue, laneX[0], false)}
      {steps(down, KONE.sand, laneX[1], true)}

      <Text font={koneFont} position={[0, 0.03, RIBBON.footZ + 1.2]}
            rotation={[-Math.PI / 2, 0, 0]} fontSize={0.36} color={LINE}
            anchorX="center" anchorY="middle">
        REQUESTS IN AND OUT
      </Text>
    </group>
  )
}

// ── A zone: one KPI, standing on its own ─────────────────────────────────────
// The car runs a real lift cycle — it waits at its floor, returns to the
// ground, and rides back up — because a lift that never moves is a box in a
// tube. The dwell is most of the cycle, so the resting position is the reading
// and the flat card beside it always carries the number.
const DWELL = 4.2, DOWN = 1.3, UP = 1.9
const CYCLE = DWELL + DOWN + UP
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2)

function Zone({ at, kpi, selected, hovered, onPick, onHover, reducedMotion }) {
  const car = useRef()
  const doorL = useRef()
  const doorR = useRef()
  const clock = useRef(Math.random() * CYCLE)   // the bank is not synchronised
  const [x, z] = at
  const max = kpi.max || 100
  const frac = kpi.value == null ? 0 : Math.min(1, Math.max(0, kpi.value / max))
  const travel = ZONE.shaftH - ZONE.carH - 0.3
  const base = 0.9 + 0.5
  const atValue = base + frac * travel

  useFrame((state, delta) => {
    if (!car.current) return
    if (reducedMotion || kpi.value == null) {
      car.current.position.y = atValue
      return
    }
    clock.current = (clock.current + delta) % CYCLE
    const t = clock.current
    let y = atValue
    let open = 0
    if (t < DWELL) {
      y = atValue
      // Doors open for the first part of the wait, then close before it moves.
      open = t < 0.5 ? t / 0.5 : t < DWELL - 0.6 ? 1 : Math.max(0, (DWELL - t) / 0.6)
    } else if (t < DWELL + DOWN) {
      y = atValue - (atValue - base) * easeInOut((t - DWELL) / DOWN)
    } else {
      y = base + (atValue - base) * easeInOut((t - DWELL - DOWN) / UP)
    }
    car.current.position.y = y
    const slide = (ZONE.shaftW - 0.16) / 4
    if (doorL.current) doorL.current.position.x = -slide - open * slide * 0.9
    if (doorR.current) doorR.current.position.x = slide + open * slide * 0.9
  })

  const lit = selected || hovered
  const low = kpi.value != null && kpi.sample != null && kpi.sample < LOW_SAMPLE
  const targetFrac = kpi.target == null ? null : Math.min(1, kpi.target / max)

  const enter = (e) => {
    e.stopPropagation()
    onHover({ key: kpi.key, label: `${kpi.label} · ${kpi.reading}`,
              x: e.clientX, y: e.clientY })
  }

  return (
    <group position={[x, 0, z]}>
      <Solid args={[ZONE.footprint, 0.9, ZONE.footprint]} position={[0, 0.45, 0]}
             color={lit ? GLASS : KONE.white}
             onClick={(e) => { e.stopPropagation(); onPick(kpi) }}
             onPointerOver={enter}
             onPointerMove={enter}
             onPointerOut={(e) => { e.stopPropagation(); onHover(null) }} />
      <Person position={[ZONE.footprint / 2 + 0.5, 0, ZONE.footprint / 2 - 0.2]} />

      {/* The shaft is drawn last and writes no depth, so the car inside it is
          never swallowed by the glass in front. */}
      <Solid args={[ZONE.shaftW, ZONE.shaftH, ZONE.shaftW]}
             position={[0, 0.9 + ZONE.shaftH / 2, 0]} color={GLASS} opacity={0.5}
             renderOrder={20} />

      {targetFrac != null && (
        <group position={[0, base + targetFrac * travel, 0]}>
          <Solid args={[ZONE.shaftW + 0.3, 0.05, ZONE.shaftW + 0.3]}
                 color={KONE.blue} lineWidth={1} />
          <Text font={koneFont} position={[ZONE.shaftW / 2 + 0.3, 0.12, 0]}
                fontSize={0.26} color={KONE.blue} anchorX="left" anchorY="middle">
            {`TARGET ${kpi.targetLabel}`}
          </Text>
        </group>
      )}

      <group ref={car} position={[0, atValue, 0]}>
        <mesh>
          <boxGeometry args={[ZONE.shaftW - 0.16, ZONE.carH, ZONE.shaftW - 0.16]} />
          <meshBasicMaterial color={low ? KONE.white : KONE.blue} toneMapped={false}
                             {...FILL} />
          <Edges threshold={15} color={LINE} lineWidth={low ? 2.5 : 1.5} />
        </mesh>
        {/* Two doors on the face that looks at the viewer. */}
        {[doorL, doorR].map((ref, i) => (
          <mesh key={i} ref={ref}
                position={[(i ? 1 : -1) * (ZONE.shaftW - 0.16) / 4, 0,
                           (ZONE.shaftW - 0.16) / 2 + 0.01]}>
            <boxGeometry args={[(ZONE.shaftW - 0.16) / 2, ZONE.carH - 0.12, 0.03]} />
            <meshBasicMaterial color={KONE.white} toneMapped={false} {...FILL} />
            <Edges threshold={15} color={LINE} lineWidth={1} />
          </mesh>
        ))}
      </group>

      <Text font={koneFont} position={[0, 0.03, ZONE.footprint / 2 + 0.8]}
            rotation={[-Math.PI / 2, 0, 0]} fontSize={0.34} color={LINE}
            anchorX="center" anchorY="middle">
        {kpi.short}
      </Text>
    </group>
  )
}

function Scene({ world, selected, onPick, onHover, hoverKey, reducedMotion }) {
  const floors = world.floors ?? []
  const widest = Math.max(1, ...floors.map(f => f.requests))
  const top = Math.max(3, floors.length) * TOWER.storey

  return (
    <>
      {/* One ground plane, with the grid drawn as its own plane a clear
          distance below the buildings rather than a hair above the floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <planeGeometry args={[90, 90]} />
        <meshBasicMaterial color={KONE.white} toneMapped={false} {...FILL} />
      </mesh>
      <gridHelper args={[64, 32, KONE.hairline, KONE.hairline]} position={[0, -0.04, 0]} />

      {floors.map((f, i) => (
        <Storey
          key={f.key}
          index={i}
          floor={f}
          widest={widest}
          selected={selected?.kind === 'floor' && selected.key === f.key}
          hovered={hoverKey === f.key}
          onPick={(fl) => onPick({ kind: 'floor', ...fl })}
          onHover={onHover}
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
            hovered={hoverKey === kpi.key}
            onPick={(k) => onPick({ kind: 'kpi', ...k })}
            onHover={onHover}
            reducedMotion={reducedMotion}
          />
        )
      })}
    </>
  )
}

export default function KoneWorld({ world, selected, onPick, tour = false }) {
  const [hover, setHover] = useState(null)
  const wrap = useRef()

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

  // The tooltip is plain DOM over the canvas, placed from the pointer. drei's
  // <Html> computes its scale from the camera, which under an orthographic
  // projection meant the card grew with the zoom until it swallowed the view.
  const onHover = useCallback((info) => {
    if (!info) return setHover(null)
    const box = wrap.current?.getBoundingClientRect()
    setHover({ ...info, left: info.x - (box?.left ?? 0), top: info.y - (box?.top ?? 0) })
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
    <div ref={wrap} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        dpr={[1, 2]}
        flat
        orthographic
        // Configured once, here. As a <OrthographicCamera> component inside the
        // canvas, React re-applied these on every render and fought the
        // controls for the camera on every hover.
        camera={{ position: ISO.position, zoom: ISO.zoom, near: -100, far: 400 }}
        gl={{ antialias: true }}
        style={{ background: KONE.white }}
        onPointerMissed={() => onPick(null)}
      >
        <color attach="background" args={[KONE.white]} />
        <Scene world={world} selected={selected} onPick={onPick} onHover={onHover}
               hoverKey={hover?.key} reducedMotion={reducedMotion} />
        <OrbitControls
          makeDefault
          enablePan={false}
          target={[0.5, 3.4, 3.2]}
          minAzimuthAngle={Math.PI / 4 - ISO.azimuthSwing}
          maxAzimuthAngle={Math.PI / 4 + ISO.azimuthSwing}
          minPolarAngle={Math.PI / 4.4}
          maxPolarAngle={Math.PI / 2.6}
          autoRotate={tour && !reducedMotion}
          autoRotateSpeed={0.3}
          enableDamping
          dampingFactor={0.12}
          zoomSpeed={0.5}
          minZoom={14}
          maxZoom={48}
        />
      </Canvas>

      {hover && (
        <div style={{
          position: 'absolute', left: hover.left + 14, top: hover.top + 14,
          background: KONE.white, border: `1px solid ${KONE.hairline}`, borderRadius: 8,
          padding: '7px 11px', fontFamily: INTER, fontSize: 12, color: KONE.black,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
        }}>{hover.label}</div>
      )}
    </div>
  )
}
