import { World } from '../world/World'
import { Body } from '../objects/Body'
import { Box } from '../shapes/Box'
import { Vec3 } from '../math/Vec3'
import { NaiveBroadphase } from '../collision/NaiveBroadphase'
import { SAPBroadphase } from '../collision/SAPBroadphase'
import { AABB } from '../collision/AABB'
import { Ray } from '../collision/Ray'
import { RaycastResult } from '../collision/RaycastResult'

/**
 * Helper: collect collision pairs as a Set of canonical "id1,id2" keys.
 */
function collectPairKeys(p1: Body[], p2: Body[]): Set<string> {
  const keys = new Set<string>()
  for (let i = 0; i < p1.length; i++) {
    const a = p1[i]
    const b = p2[i]
    const key = a.id < b.id ? `${a.id},${b.id}` : `${b.id},${a.id}`
    keys.add(key)
  }
  return keys
}

describe('Broadphase: Naive ↔ SAP consistency', () => {
  const BOX_COUNT = 48

  /**
   * Creates a world with `count` dynamic boxes placed in a grid
   * with some initial velocity so they move and produce collisions.
   */
  function createWorldWithBoxes(count: number, broadphase?: 'naive' | 'sap'): World {
    const bp = broadphase === 'sap' ? new SAPBroadphase(null as any) : new NaiveBroadphase()
    const world = new World({ broadphase: bp })
    // Override setWorld if SAP (constructor already called setWorld with null world)
    if (broadphase === 'sap') {
      bp.setWorld(world)
    }

    const boxShape = new Box(new Vec3(0.5, 0.5, 0.5))

    // Place boxes in a 4×4×3 grid, slightly offset to create overlaps
    let idx = 0
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 3; z++) {
          const body = new Body({
            mass: 1,
            shape: boxShape,
            position: new Vec3(x * 2.0 - 3.0, y * 2.0 - 3.0, z * 2.0 - 2.0),
          })
          // Give each box a different velocity so they move around
          body.velocity.set(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
          )
          world.addBody(body)
          idx++
          if (idx >= count) break
        }
        if (idx >= count) break
      }
      if (idx >= count) break
    }

    return world
  }

  test('Naive and SAP return identical collision pairs for the same world snapshot', () => {
    const world = createWorldWithBoxes(BOX_COUNT, 'naive')

    // Create a SAP broadphase and initialize it with the same world
    const sapBP = new SAPBroadphase(null as any)
    sapBP.setWorld(world)
    sapBP.useBoundingBoxes = world.broadphase.useBoundingBoxes

    const p1Naive: Body[] = []
    const p2Naive: Body[] = []
    const p1SAP: Body[] = []
    const p2SAP: Body[] = []

    // Run collision detection with both broadphases on the same world state
    world.broadphase.collisionPairs(world, p1Naive, p2Naive)
    sapBP.collisionPairs(world, p1SAP, p2SAP)

    const naiveKeys = collectPairKeys(p1Naive, p2Naive)
    const sapKeys = collectPairKeys(p1SAP, p2SAP)

    // Every pair in Naive must be in SAP
    for (const key of naiveKeys) {
      expect(sapKeys.has(key)).toBe(true)
    }

    // Every pair in SAP must be in Naive
    for (const key of sapKeys) {
      expect(naiveKeys.has(key)).toBe(true)
    }

    // Clean up SAP event listeners
    sapBP.setWorld(null)
  })

  test('aabbQuery returns identical results for Naive and SAP on the same snapshot', () => {
    const world = createWorldWithBoxes(BOX_COUNT, 'naive')

    const sapBP = new SAPBroadphase(null as any)
    sapBP.setWorld(world)

    // Create an AABB that covers a region of the world
    const aabb = new AABB({
      lowerBound: new Vec3(-5, -5, -5),
      upperBound: new Vec3(5, 5, 5),
    })

    const naiveResults: Body[] = []
    const sapResults: Body[] = []

    world.broadphase.aabbQuery(world, aabb, naiveResults)
    sapBP.aabbQuery(world, aabb, sapResults)

    const naiveIds = new Set(naiveResults.map((b) => b.id))
    const sapIds = new Set(sapResults.map((b) => b.id))

    expect(naiveIds.size).toBe(sapIds.size)
    for (const id of naiveIds) {
      expect(sapIds.has(id)).toBe(true)
    }

    sapBP.setWorld(null)
  })

  test('raycast returns identical results for Naive and SAP on the same snapshot', () => {
    const world = createWorldWithBoxes(BOX_COUNT, 'naive')

    const sapBP = new SAPBroadphase(null as any)
    sapBP.setWorld(world)

    const from = new Vec3(-10, 0, 0)
    const to = new Vec3(10, 0, 0)

    // Collect hits with Naive broadphase
    const naiveHitIds = new Set<number>()
    const originalBP = world.broadphase
    world.broadphase = originalBP // it's already Naive
    world.raycastAll(from, to, {}, (result) => {
      if (result.body) naiveHitIds.add(result.body.id)
    })

    // Collect hits with SAP broadphase
    const sapHitIds = new Set<number>()
    world.broadphase = sapBP
    world.raycastAll(from, to, {}, (result) => {
      if (result.body) sapHitIds.add(result.body.id)
    })

    // Restore
    world.broadphase = originalBP

    expect(sapHitIds.size).toBe(naiveHitIds.size)
    for (const id of naiveHitIds) {
      expect(sapHitIds.has(id)).toBe(true)
    }

    sapBP.setWorld(null)
  })

  test('mid-simulation switch from Naive to SAP preserves collision consistency', () => {
    // Create world with Naive broadphase
    const world = createWorldWithBoxes(BOX_COUNT, 'naive')

    // Step a few times with Naive
    for (let s = 0; s < 3; s++) {
      world.step(1 / 60)
    }

    // Capture collision pairs before switch (using Naive)
    const p1Before: Body[] = []
    const p2Before: Body[] = []
    world.broadphase.collisionPairs(world, p1Before, p2Before)
    const beforeKeys = collectPairKeys(p1Before, p2Before)

    // Now create SAP and switch
    const sapBP = new SAPBroadphase(null as any)
    world.setBroadphase(sapBP)

    // Capture collision pairs after switch (using SAP) on the SAME world state
    const p1After: Body[] = []
    const p2After: Body[] = []
    world.broadphase.collisionPairs(world, p1After, p2After)
    const afterKeys = collectPairKeys(p1After, p2After)

    // They should be identical — same snapshot, same candidate set
    expect(afterKeys.size).toBe(beforeKeys.size)
    for (const key of beforeKeys) {
      expect(afterKeys.has(key)).toBe(true)
    }

    // Step a few more times with SAP to ensure stability
    for (let s = 0; s < 3; s++) {
      world.step(1 / 60)
    }

    // After stepping with SAP, verify no stale bodies in axisList
    expect(sapBP.axisList.length).toBe(world.bodies.length)
    for (const body of world.bodies) {
      expect(sapBP.axisList.includes(body)).toBe(true)
    }
  })

  test('deleted bodies do not persist in SAP after switch', () => {
    const world = createWorldWithBoxes(BOX_COUNT, 'naive')

    // Run a few steps
    for (let s = 0; s < 3; s++) {
      world.step(1 / 60)
    }

    // Remove some bodies
    const removedIds = new Set<number>()
    const bodiesToRemove = world.bodies.slice(0, 5)
    for (const b of bodiesToRemove) {
      removedIds.add(b.id)
      world.removeBody(b)
    }

    // Now switch to SAP
    const sapBP = new SAPBroadphase(null as any)
    world.setBroadphase(sapBP)

    // SAP's axisList should NOT contain removed bodies
    const sapBodyIds = new Set(sapBP.axisList.map((b) => b.id))
    for (const id of removedIds) {
      expect(sapBodyIds.has(id)).toBe(false)
    }

    // SAP's axisList should match world.bodies exactly
    expect(sapBP.axisList.length).toBe(world.bodies.length)
  })

  test('repeated switch between Naive and SAP stays consistent', () => {
    const world = createWorldWithBoxes(BOX_COUNT, 'naive')

    for (let cycle = 0; cycle < 3; cycle++) {
      // Step with current broadphase
      world.step(1 / 60)

      // Capture pairs
      const p1: Body[] = []
      const p2: Body[] = []
      world.broadphase.collisionPairs(world, p1, p2)
      const currentKeys = collectPairKeys(p1, p2)

      // Compare with Naive
      const naiveBP = new NaiveBroadphase()
      naiveBP.setWorld(world)
      const p1n: Body[] = []
      const p2n: Body[] = []
      naiveBP.collisionPairs(world, p1n, p2n)
      const naiveKeys = collectPairKeys(p1n, p2n)

      expect(currentKeys.size).toBe(naiveKeys.size)
      for (const key of naiveKeys) {
        expect(currentKeys.has(key)).toBe(true)
      }

      // Switch to the other broadphase
      const newBP = cycle % 2 === 0 ? new SAPBroadphase(null as any) : new NaiveBroadphase()
      world.setBroadphase(newBP)
    }
  })
})
