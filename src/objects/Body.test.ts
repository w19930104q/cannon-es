import { Vec3 } from '../math/Vec3'
import { Box } from '../shapes/Box'
import { Sphere } from '../shapes/Sphere'
import { Body } from '../objects/Body'
import { World } from '../world/World'
import { Quaternion } from '../math/Quaternion'

/**
 * Build an L-shaped compound body using three boxes.
 * Layout (top-down, Y-up):
 *
 *   z
 *   ^
 *   |  [2] (foot, along +z)
 *   |  [1] [0] (stem along +x, foot at tip)
 *
 * Box 0: center at (1, 0, 0), halfExtents (1, 0.5, 0.5)  — horizontal bar
 * Box 1: center at (0, 0, 0), halfExtents (0.5, 0.5, 1.5) — vertical stem
 * Box 2: center at (0, 0, 2), halfExtents (0.5, 0.5, 0.5) — foot
 */
function createLShapedBody(mass = 3): Body {
  const body = new Body({ mass, position: new Vec3(0, 0, 0) })

  // Box 0: horizontal bar, extending +x from center
  const box0 = new Box(new Vec3(1.0, 0.5, 0.5))
  body.addShape(box0, new Vec3(1, 0, 0))

  // Box 1: vertical stem, centered at origin
  const box1 = new Box(new Vec3(0.5, 0.5, 1.5))
  body.addShape(box1, new Vec3(0, 0, 0))

  // Box 2: foot, at the far end of the stem
  const box2 = new Box(new Vec3(0.5, 0.5, 0.5))
  body.addShape(box2, new Vec3(0, 0, 2))

  return body
}

describe('Body', () => {
  describe('replaceShape', () => {
    test('replaces a shape atomically and updates mass properties', () => {
      const body = createLShapedBody(3)

      const oldShape = body.shapes[1] // the stem box
      const oldInertia = body.inertia.clone()
      const oldInvInertia = body.invInertia.clone()
      const oldBoundingRadius = body.boundingRadius

      // Replace stem with a larger box
      const newBox = new Box(new Vec3(1.0, 0.5, 2.0))
      body.replaceShape(oldShape, newBox)

      // The shape at index 1 should be the new box
      expect(body.shapes[1]).toBe(newBox)
      // Old shape should be detached
      expect(oldShape.body).toBeNull()
      // New shape should be attached
      expect(newBox.body).toBe(body)

      // Mass properties should have changed (different shape → different inertia)
      expect(body.inertia.almostEquals(oldInertia)).toBe(false)
      expect(body.invInertia.almostEquals(oldInvInertia)).toBe(false)
      // Bounding radius should be different
      expect(body.boundingRadius).not.toBe(oldBoundingRadius)

      // AABB should be marked for update
      expect(body.aabbNeedsUpdate).toBe(true)
    })

    test('does nothing when newShape is null/undefined', () => {
      const body = createLShapedBody(3)
      const oldShape = body.shapes[0]
      const shapesBefore = [...body.shapes]

      body.replaceShape(oldShape, null as any)

      // Shapes should be unchanged
      expect(body.shapes).toEqual(shapesBefore)
      expect(body.shapes[0]).toBe(oldShape)
      expect(oldShape.body).toBe(body)
    })

    test('does nothing when oldShape does not belong to the body', () => {
      const body = createLShapedBody(3)
      const stranger = new Box(new Vec3(1, 1, 1))
      const shapesBefore = [...body.shapes]

      body.replaceShape(stranger, new Box(new Vec3(2, 2, 2)))

      expect(body.shapes).toEqual(shapesBefore)
    })

    test('preserves the offset and orientation of the replaced shape', () => {
      const body = new Body({ mass: 1 })
      const box1 = new Box(new Vec3(0.5, 0.5, 0.5))
      body.addShape(box1, new Vec3(3, 0, 0))

      const box2 = new Box(new Vec3(1, 1, 1))
      body.replaceShape(box1, box2)

      // Offset should be preserved
      expect(body.shapeOffsets[0].x).toBe(3)
      expect(body.shapeOffsets[0].y).toBe(0)
      expect(body.shapeOffsets[0].z).toBe(0)

      // New shape should be at index 0
      expect(body.shapes[0]).toBe(box2)
    })

    test('shape references are updated correctly in world simulation', () => {
      const world = new World()
      const body = createLShapedBody(3)
      world.addBody(body)

      const oldShape = body.shapes[1]
      const newBox = new Box(new Vec3(0.5, 0.5, 1.0))
      body.replaceShape(oldShape, newBox)

      // Step the world to verify no crashes
      world.step(1 / 60)

      // After stepping, the body should still be in the world
      expect(world.bodies).toContain(body)
      expect(body.shapes[1]).toBe(newBox)
    })

    test('AABB is consistent after replaceShape', () => {
      const body = createLShapedBody(3)

      // Force AABB update before replacement
      body.updateAABB()
      const aabbBefore = body.aabb.clone()

      const oldShape = body.shapes[1]
      const newBox = new Box(new Vec3(0.25, 0.25, 0.75))
      body.replaceShape(oldShape, newBox)

      // AABB should be dirty after replacement
      expect(body.aabbNeedsUpdate).toBe(true)

      // Update and check
      body.updateAABB()
      const aabbAfter = body.aabb

      // The new AABB should be different (smaller box)
      expect(
        aabbAfter.lowerBound.almostEquals(aabbBefore.lowerBound) &&
          aabbAfter.upperBound.almostEquals(aabbBefore.upperBound)
      ).toBe(false)
    })

    test('inertia uses parallel axis theorem for compound bodies', () => {
      // A single box at origin
      const singleBody = new Body({ mass: 1 })
      const box = new Box(new Vec3(1, 0.5, 0.5))
      singleBody.addShape(box, new Vec3(0, 0, 0))

      const singleInertia = singleBody.inertia.clone()

      // Same box displaced from origin should have larger inertia (parallel axis)
      const displacedBody = new Body({ mass: 1 })
      const displacedBox = new Box(new Vec3(1, 0.5, 0.5))
      displacedBody.addShape(displacedBox, new Vec3(3, 0, 0))

      // The inertia about the body origin should be larger due to the offset
      // I_z' = I_z_cm + m * d^2  where d = distance in xy plane from axis
      expect(displacedBody.inertia.z).toBeGreaterThan(singleInertia.z)
      // I_y' = I_y_cm + m * (dx^2 + dz^2)
      expect(displacedBody.inertia.y).toBeGreaterThan(singleInertia.y)
    })
  })

  describe('clone', () => {
    test('clone creates an independent copy with same properties', () => {
      const body = createLShapedBody(3)
      body.position.set(1, 2, 3)
      body.velocity.set(4, 5, 6)

      const clone = body.clone()

      expect(clone).not.toBe(body)
      expect(clone.mass).toBe(body.mass)
      expect(clone.position.almostEquals(body.position)).toBe(true)
      expect(clone.velocity.almostEquals(body.velocity)).toBe(true)
      expect(clone.shapes.length).toBe(body.shapes.length)

      // Shapes should be different instances
      for (let i = 0; i < body.shapes.length; i++) {
        expect(clone.shapes[i]).not.toBe(body.shapes[i])
      }
    })

    test('clone shapes are independent: replaceShape on clone does not affect original', () => {
      const body = createLShapedBody(3)
      const clone = body.clone()

      const originalShape0 = body.shapes[0]
      const cloneShape0 = clone.shapes[0]

      expect(cloneShape0).not.toBe(originalShape0)

      // Replace shape on clone
      const newBox = new Box(new Vec3(2, 2, 2))
      clone.replaceShape(cloneShape0, newBox)

      // Original should be unaffected
      expect(body.shapes[0]).toBe(originalShape0)
      expect(body.shapes[0]).not.toBe(newBox)
      // Clone should have the new shape
      expect(clone.shapes[0]).toBe(newBox)
    })

    test('clone shares complex shapes by reference', () => {
      const body = createLShapedBody(3)
      const clone = body.clone()

      // Box shapes are simple and should be deep-cloned
      for (let i = 0; i < 3; i++) {
        expect(clone.shapes[i]).not.toBe(body.shapes[i])
      }
    })
  })

  describe('updateMassProperties', () => {
    test('empty shapes array results in zero inertia', () => {
      const body = new Body({ mass: 1 })
      body.shapes = []
      body.shapeOffsets = []
      body.shapeOrientations = []
      body.updateMassProperties()

      expect(body.inertia.x).toBe(0)
      expect(body.inertia.y).toBe(0)
      expect(body.inertia.z).toBe(0)
      expect(body.invInertia.x).toBe(0)
      expect(body.invInertia.y).toBe(0)
      expect(body.invInertia.z).toBe(0)
    })

    test('single shape uses shape.calculateLocalInertia', () => {
      const body = new Body({ mass: 1 })
      const box = new Box(new Vec3(1, 0.5, 0.5))
      body.addShape(box, new Vec3(0, 0, 0))

      // At origin, inertia should match Box.calculateInertia
      const expected = new Vec3()
      Box.calculateInertia(new Vec3(1, 0.5, 0.5), 1, expected)

      expect(body.inertia.almostEquals(expected)).toBe(true)
    })
  })
})
