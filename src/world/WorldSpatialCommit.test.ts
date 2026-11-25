import { Vec3 } from '../math/Vec3'
import { Quaternion } from '../math/Quaternion'
import { Box } from '../shapes/Box'
import { Body } from '../objects/Body'
import { World } from '../world/World'
import { AABB } from '../collision/AABB'
import { NaiveBroadphase } from '../collision/NaiveBroadphase'
import { SAPBroadphase } from '../collision/SAPBroadphase'
import { RaycastResult } from '../collision/RaycastResult'
import type { Broadphase } from '../collision/Broadphase'

type BroadphaseFactory = () => Broadphase

/**
 * Builds the reference scenario: 16 static boxes laid out in a 4x4 grid
 * on the z=0 plane, plus one movable box that gets teleported across the
 * whole scene from z=+10 to z=-10.
 */
function buildWorld(makeBroadphase: BroadphaseFactory): World {
  const world = new World({ broadphase: makeBroadphase() })
  world.broadphase.useBoundingBoxes = true

  // 16 static boxes in a 4x4 grid
  for (let ix = 0; ix < 4; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      const staticBox = new Body({
        type: Body.STATIC,
        shape: new Box(new Vec3(0.5, 0.5, 0.5)),
        position: new Vec3((ix - 1.5) * 4, (iy - 1.5) * 4, 0),
      })
      world.addBody(staticBox)
    }
  }

  // The body that will be teleported
  const body = new Body({
    mass: 1,
    shape: new Box(new Vec3(1, 1, 1)),
    position: new Vec3(0, 0, 10),
  })
  world.addBody(body)

  // Prime the spatial index so every broadphase starts from a committed state
  world.internalStep(1 / 60)

  return world
}

const OLD_POS = new Vec3(0, 0, 10)
const NEW_POS = new Vec3(0, 0, -10)

function rayHits(world: World, zA: number, zB: number): boolean {
  const result = new RaycastResult()
  world.raycastClosest(new Vec3(0, 0, zA), new Vec3(0, 0, zB), {}, result)
  return result.hasHit
}

function bodiesInRegion(world: World, center: Vec3): Body[] {
  const half = 1.5
  const aabb = new AABB({
    lowerBound: new Vec3(center.x - half, center.y - half, center.z - half),
    upperBound: new Vec3(center.x + half, center.y + half, center.z + half),
  })
  return world.broadphase.aabbQuery(world, aabb, [])
}

const broadphases: ReadonlyArray<readonly [string, BroadphaseFactory]> = [
  ['NaiveBroadphase', () => new NaiveBroadphase()],
  // SAPBroadphase takes an optional world at runtime; World re-binds it via broadphase.setWorld()
  ['SAPBroadphase', () => new SAPBroadphase(undefined as unknown as World)],
] as const

describe.each(broadphases)('teleport spatial commit with %s', (_name, makeBroadphase) => {
  test('queries see the old snapshot until commit, and the new position afterwards', () => {
    const world = buildWorld(makeBroadphase)
    const body = world.bodies[world.bodies.length - 1]
    expect(body.position.almostEquals(OLD_POS)).toBe(true)

    // Baseline: ray / overlap queries resolve against the committed (old) position
    expect(rayHits(world, 12, 8)).toBe(true)
    expect(rayHits(world, -8, -12)).toBe(false)
    expect(bodiesInRegion(world, OLD_POS)).toContain(body)
    expect(bodiesInRegion(world, NEW_POS)).not.toContain(body)

    // Stage a teleport across the whole scene
    body.stagePosition(NEW_POS)

    // Before commit, nothing observable changed: position and every spatial
    // query still see the old snapshot
    expect(body.position.almostEquals(OLD_POS)).toBe(true)
    expect(rayHits(world, 12, 8)).toBe(true)
    expect(rayHits(world, -8, -12)).toBe(false)
    expect(bodiesInRegion(world, OLD_POS)).toContain(body)
    expect(bodiesInRegion(world, NEW_POS)).not.toContain(body)

    // Commit: position and spatial index update together, atomically
    world.commit()

    expect(body.position.almostEquals(NEW_POS)).toBe(true)
    expect(body.aabbNeedsUpdate).toBe(true)
    expect(rayHits(world, 12, 8)).toBe(false)
    expect(rayHits(world, -8, -12)).toBe(true)
    expect(bodiesInRegion(world, OLD_POS)).not.toContain(body)
    expect(bodiesInRegion(world, NEW_POS)).toContain(body)
  })

  test('staging several times keeps the last staged transform', () => {
    const world = buildWorld(makeBroadphase)
    const body = world.bodies[world.bodies.length - 1]

    body.stagePosition(new Vec3(5, 5, 5))
    body.stagePosition(NEW_POS)
    expect(body.position.almostEquals(OLD_POS)).toBe(true)

    world.commit()

    expect(body.position.almostEquals(NEW_POS)).toBe(true)
  })

  test('commit without staged changes is a no-op', () => {
    const world = buildWorld(makeBroadphase)
    const body = world.bodies[world.bodies.length - 1]

    world.commit()

    expect(body.position.almostEquals(OLD_POS)).toBe(true)
    expect(rayHits(world, 12, 8)).toBe(true)
  })

  test('commit resets interpolation frames so no sweep is rendered', () => {
    const world = buildWorld(makeBroadphase)
    const body = world.bodies[world.bodies.length - 1]

    // Simulate one interpolation cycle having run
    body.previousPosition.set(0, 0, 9)
    body.interpolatedPosition.set(0, 0, 9.5)

    body.stagePosition(NEW_POS)
    world.commit()

    expect(body.previousPosition.almostEquals(NEW_POS)).toBe(true)
    expect(body.interpolatedPosition.almostEquals(NEW_POS)).toBe(true)
  })

  test('staged quaternion is applied together with the position at commit', () => {
    const world = buildWorld(makeBroadphase)
    const body = world.bodies[world.bodies.length - 1]
    const targetQuat = new Quaternion()
    targetQuat.setFromEuler(0, Math.PI / 2, 0)

    body.stagePosition(NEW_POS)
    body.stageQuaternion(targetQuat)
    expect(body.quaternion.toArray()).toEqual(new Quaternion().toArray())

    world.commit()

    const actual = body.quaternion.toArray()
    const expected = targetQuat.toArray()
    for (let i = 0; i < 4; i++) {
      expect(actual[i]).toBeCloseTo(expected[i], 10)
    }
    expect(body.previousQuaternion.toArray()[3]).toBeCloseTo(expected[3], 10)
    expect(body.aabbNeedsUpdate).toBe(true)
  })

  test('physics stepping still works after a committed teleport', () => {
    const world = buildWorld(makeBroadphase)
    const body = world.bodies[world.bodies.length - 1]

    // Static box resting exactly at the teleport destination
    const target = new Body({
      type: Body.STATIC,
      shape: new Box(new Vec3(1, 1, 1)),
      position: new Vec3(0, 0, -10),
    })
    world.addBody(target)

    body.stagePosition(NEW_POS)
    world.commit()
    world.internalStep(1 / 60)

    // The narrowphase must have generated a contact at the new position
    expect(world.contacts.length).toBeGreaterThan(0)
    const contactBodies = world.contacts.map((c) => [c.bi, c.bj]).flat()
    expect(contactBodies).toContain(body)
    expect(contactBodies).toContain(target)
  })
})
