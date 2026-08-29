import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import * as Astronomy from 'astronomy-engine'
import { buildCutoutGeometry, equatorialToGalacticMatrix } from '@renderer/sky/SkyRenderer'
import { eqjUnitVector, normalizeDegrees, vectorToEquatorial } from '@shared/astro/coords'

describe('equatorialToGalacticMatrix', () => {
  it('sends Sagittarius A* to the galactic centre', () => {
    // Sgr A* is, by construction, within a few arcminutes of l = 0, b = 0.
    const v = eqjUnitVector(266.41684 / 15, -29.00781)
    const g = new THREE.Vector3(v.x, v.y, v.z).applyMatrix3(equatorialToGalacticMatrix())

    const latitude = (Math.asin(g.z) * 180) / Math.PI
    const longitude = normalizeDegrees((Math.atan2(g.y, g.x) * 180) / Math.PI)
    expect(Math.abs(latitude)).toBeLessThan(0.2)
    expect(Math.min(longitude, 360 - longitude)).toBeLessThan(0.2)
  })

  it('sends the north galactic pole to +90 degrees latitude', () => {
    // The north galactic pole sits in Coma Berenices at 12h51.4m, +27.13 (J2000).
    const v = eqjUnitVector(12.8567, 27.1283)
    const g = new THREE.Vector3(v.x, v.y, v.z).applyMatrix3(equatorialToGalacticMatrix())
    expect((Math.asin(g.z) * 180) / Math.PI).toBeGreaterThan(89.9)
  })

  it('is a rotation, so it preserves lengths and angles', () => {
    const matrix = equatorialToGalacticMatrix()
    for (const [ra, dec] of [
      [0, 0],
      [6, 45],
      [13.2, -60],
      [21.7, 12]
    ]) {
      const v = eqjUnitVector(ra, dec)
      expect(new THREE.Vector3(v.x, v.y, v.z).applyMatrix3(matrix).length()).toBeCloseTo(1, 10)
    }
    const a = eqjUnitVector(0, 0)
    const b = eqjUnitVector(6, 0)
    const ra = new THREE.Vector3(a.x, a.y, a.z).applyMatrix3(matrix)
    const rb = new THREE.Vector3(b.x, b.y, b.z).applyMatrix3(matrix)
    expect(ra.dot(rb)).toBeCloseTo(a.x * b.x + a.y * b.y + a.z * b.z, 10)
  })

  it('agrees with astronomy-engine used directly', () => {
    const matrix = equatorialToGalacticMatrix()
    const rotation = Astronomy.Rotation_EQJ_GAL()
    const time = Astronomy.MakeTime(new Date('2027-01-01T00:00:00Z'))
    for (const [ra, dec] of [
      [5.5, -5.4],
      [18.6, 38.8],
      [2.5, 89.3]
    ]) {
      const v = eqjUnitVector(ra, dec)
      const expected = Astronomy.RotateVector(rotation, new Astronomy.Vector(v.x, v.y, v.z, time))
      const actual = new THREE.Vector3(v.x, v.y, v.z).applyMatrix3(matrix)
      expect(actual.x).toBeCloseTo(expected.x, 12)
      expect(actual.y).toBeCloseTo(expected.y, 12)
      expect(actual.z).toBeCloseTo(expected.z, 12)
    }
  })
})

describe('buildCutoutGeometry', () => {
  const RA = 5.58791 // Orion Nebula
  const DEC = -5.38967
  const FOV = 1.5

  const geometry = buildCutoutGeometry(RA, DEC, FOV, 8)
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')

  const vertexAt = (index: number): THREE.Vector3 =>
    new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index))

  /** Finds the vertex whose UV matches, within a small tolerance. */
  const findVertex = (u: number, v: number): THREE.Vector3 => {
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - v) < 1e-6) return vertexAt(i)
    }
    throw new Error(`no vertex at uv (${u}, ${v})`)
  }

  it('produces a complete, indexed mesh', () => {
    expect(position.count).toBe(9 * 9)
    expect(geometry.getIndex()?.count).toBe(8 * 8 * 6)
  })

  it('centres the image on the object', () => {
    const centre = findVertex(0.5, 0.5)
    const { ra, dec } = vectorToEquatorial(centre)
    expect(ra).toBeCloseTo(RA, 5)
    expect(dec).toBeCloseTo(DEC, 5)
  })

  it('spans the requested field of view', () => {
    // uv.y is flipped when the geometry is built, so v = 1 is the top of the image.
    const top = findVertex(0.5, 1)
    const bottom = findVertex(0.5, 0)
    expect((top.angleTo(bottom) * 180) / Math.PI).toBeCloseTo(FOV, 2)
  })

  it('puts north at the top of the image', () => {
    expect(vectorToEquatorial(findVertex(0.5, 1)).dec).toBeGreaterThan(
      vectorToEquatorial(findVertex(0.5, 0)).dec
    )
  })

  it('puts east on the left, as sky surveys deliver it', () => {
    // East is increasing right ascension, and it belongs on the left-hand edge.
    const leftRa = vectorToEquatorial(findVertex(0, 0.5)).ra
    const rightRa = vectorToEquatorial(findVertex(1, 0.5)).ra
    // Signed difference, so a wrap through 0h does not break the comparison.
    const delta = ((leftRa - rightRa + 36) % 24) - 12
    expect(delta).toBeGreaterThan(0)
  })

  it('keeps every vertex on the celestial sphere', () => {
    const radii = new Set<number>()
    for (let i = 0; i < position.count; i++) radii.add(Number(vertexAt(i).length().toFixed(4)))
    expect(radii.size).toBe(1)
  })
})
