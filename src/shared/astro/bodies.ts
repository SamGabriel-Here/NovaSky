/**
 * Physical and orientation data for the Solar System, so a planet can be drawn as a
 * lit sphere instead of a coloured dot.
 *
 * Everything here except the radii is computed per moment by astronomy-engine. The
 * radii are constants from the NASA planetary fact sheets and are the only figures in
 * this file that are looked up rather than derived.
 */
import * as Astronomy from 'astronomy-engine'
import { DEG, RAD, eqjUnitVector, type Vec3 } from './coords'

/** Equatorial radii in kilometres (NASA planetary fact sheets). */
export const EQUATORIAL_RADIUS_KM: Record<string, number> = {
  sun: 695700,
  mercury: 2439.7,
  venus: 6051.8,
  moon: 1737.4,
  mars: 3396.2,
  jupiter: 71492,
  saturn: 60268,
  uranus: 25559,
  neptune: 24764,
  pluto: 1188.3
}

/**
 * Saturn's ring system, in kilometres from the planet's centre. The inner edge is the
 * inner edge of the C ring and the outer edge is the outer edge of the A ring, which is
 * the span the ring texture covers.
 */
export const SATURN_RING_KM = { inner: 74658, outer: 136775 }

const AU_KM = 149597870.7

export interface BodyAppearance {
  /** Apparent angular diameter in degrees. */
  angularDiameter: number
  /** Sun-body-Earth angle in degrees. 0 is full, 180 is new. */
  phaseAngle: number
  /** Illuminated fraction of the disc, 0 to 1. */
  illumination: number
  /** Unit vector from Earth toward the body, J2000. */
  direction: Vec3
  /** Unit vector from the body toward the Sun, J2000. This is what lights the sphere. */
  toSun: Vec3
  /** Unit vector along the body's north pole, J2000. */
  northPole: Vec3
  /** Rotation angle of the prime meridian in degrees, wrapped to 0 to 360. */
  spin: number
  /** Unit vector through longitude 0 on the equator, J2000. */
  primeMeridian: Vec3
  /** Unit vector through longitude 90 east on the equator, J2000. */
  eastward: Vec3
  /** Opening angle of Saturn's rings in degrees, or null for everything else. */
  ringTilt: number | null
}

const bodyOf = (name: string): Astronomy.Body =>
  (Astronomy.Body as unknown as Record<string, Astronomy.Body>)[name]

const normalise = (v: { x: number; y: number; z: number }): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/**
 * Everything needed to draw one body at one instant.
 *
 * `objectId` is NovaSky's own id ("jupiter"); `bodyName` is the astronomy-engine body.
 * Returns null for anything without a known radius, which is the signal to fall back to
 * the plain marker.
 */
export function getBodyAppearance(
  objectId: string,
  bodyName: string,
  date: Date
): BodyAppearance | null {
  const radiusKm = EQUATORIAL_RADIUS_KM[objectId]
  if (!radiusKm) return null

  const time = Astronomy.MakeTime(date)
  const body = bodyOf(bodyName)
  if (!body) return null

  // Geocentric J2000 vectors, in AU. Aberration off: this is geometry, not astrometry,
  // and the position the object is *drawn* at comes from the ephemeris separately.
  const geo = objectId === 'moon' ? Astronomy.GeoMoon(time) : Astronomy.GeoVector(body, time, false)
  const distanceAu = Math.hypot(geo.x, geo.y, geo.z)
  const distanceKm = distanceAu * AU_KM
  if (!(distanceKm > 0)) return null

  const angularDiameter = 2 * Math.atan(radiusKm / distanceKm) * RAD

  const sun = Astronomy.GeoVector(Astronomy.Body.Sun, time, false)
  // From the body to the Sun, which is what decides the phase.
  const toSun = normalise({ x: sun.x - geo.x, y: sun.y - geo.y, z: sun.z - geo.z })

  const axis = Astronomy.RotationAxis(body, time)
  const northPole = eqjUnitVector(axis.ra, axis.dec)

  /*
   * Body-fixed axes, following the IAU definition rather than trying to interpret the
   * spin angle inside a shader.
   *
   * The node is where the body's equator crosses the ICRF equator, at right ascension
   * alpha + 90 degrees. The prime meridian sits `spin` degrees around from there, in the
   * direction of rotation, and east follows from the pole. Longitude of any direction is
   * then just atan2 against these two axes, which is what the renderer uses to sample
   * the surface map.
   */
  const alpha = axis.ra * 15 * DEG
  const node: Vec3 = { x: -Math.sin(alpha), y: Math.cos(alpha), z: 0 }
  const spinRad = axis.spin * DEG
  const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  })
  const poleCrossNode = cross(northPole, node)
  const primeMeridian = normalise({
    x: node.x * Math.cos(spinRad) + poleCrossNode.x * Math.sin(spinRad),
    y: node.y * Math.cos(spinRad) + poleCrossNode.y * Math.sin(spinRad),
    z: node.z * Math.cos(spinRad) + poleCrossNode.z * Math.sin(spinRad)
  })
  const eastward = normalise(cross(northPole, primeMeridian))

  let phaseAngle = 0
  let illumination = 1
  let ringTilt: number | null = null
  if (objectId !== 'sun') {
    try {
      const illum = Astronomy.Illumination(body, time)
      phaseAngle = illum.phase_angle
      illumination = illum.phase_fraction
      if (objectId === 'saturn' && illum.ring_tilt !== undefined) ringTilt = illum.ring_tilt
    } catch {
      // A body astronomy-engine will not illuminate is drawn fully lit.
    }
  }

  return {
    angularDiameter,
    phaseAngle,
    illumination,
    direction: normalise(geo),
    toSun,
    northPole,
    spin: ((axis.spin % 360) + 360) % 360,
    primeMeridian,
    eastward,
    ringTilt
  }
}

/**
 * An orthonormal frame for drawing the body's disc.
 *
 * `z` points from the body back toward the observer, so it is the outward normal at the
 * centre of the visible hemisphere. `y` is the body's north pole projected into the
 * plane of the sky, which puts the texture's poles where they belong. `x` completes a
 * right-handed set.
 */
export function bodyFrame(appearance: BodyAppearance): { x: Vec3; y: Vec3; z: Vec3 } {
  const d = appearance.direction
  const z = { x: -d.x, y: -d.y, z: -d.z }

  const pole = appearance.northPole
  const along = pole.x * z.x + pole.y * z.y + pole.z * z.z
  let y = normalise({
    x: pole.x - z.x * along,
    y: pole.y - z.y * along,
    z: pole.z - z.z * along
  })
  // Degenerate only if the pole points straight at us, which no real body does.
  if (!Number.isFinite(y.x)) y = { x: 0, y: 0, z: 1 }

  const x = normalise({
    x: y.y * z.z - y.z * z.y,
    y: y.z * z.x - y.x * z.z,
    z: y.x * z.y - y.y * z.x
  })
  return { x, y, z }
}

/** Projects an J2000 vector onto a body frame. */
export function inFrame(frame: { x: Vec3; y: Vec3; z: Vec3 }, v: Vec3): Vec3 {
  return {
    x: v.x * frame.x.x + v.y * frame.x.y + v.z * frame.x.z,
    y: v.x * frame.y.x + v.y * frame.y.y + v.z * frame.y.z,
    z: v.x * frame.z.x + v.y * frame.z.y + v.z * frame.z.z
  }
}

export { DEG }
