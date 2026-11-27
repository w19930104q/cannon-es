import { World } from '../src/world/World'
import { Body } from '../src/objects/Body'
import { Material } from '../src/material/Material'
import { ContactMaterial } from '../src/material/ContactMaterial'
import { Sphere } from '../src/shapes/Sphere'
import { Plane } from '../src/shapes/Plane'
import { Vec3 } from '../src/math/Vec3'

describe('Transactional Material/ContactMaterial changes', () => {
  let world: World
  let materials: Material[]
  let bodies: Body[]
  let contactMaterials: ContactMaterial[]

  beforeEach(() => {
    world = new World()
    world.gravity.set(0, -9.82, 0)

    // Create 5 materials with distinct initial values
    materials = [
      new Material({ friction: 0.5, restitution: 0.1 }),  // mat0
      new Material({ friction: 0.6, restitution: 0.2 }),  // mat1
      new Material({ friction: 0.7, restitution: 0.3 }),  // mat2
      new Material({ friction: 0.8, restitution: 0.4 }),  // mat3
      new Material({ friction: 0.9, restitution: 0.5 }),  // mat4
    ]

    // Create bodies using the materials
    bodies = materials.map((mat, i) => {
      const body = new Body({ mass: 1, material: mat })
      body.addShape(new Sphere(1))
      body.position.set(i * 3, 10, 0)
      return body
    })

    // Also add a static ground plane
    const groundMat = new Material({ friction: 1.0, restitution: 0.0 })
    const ground = new Body({ mass: 0, material: groundMat })
    ground.addShape(new Plane())
    ground.position.set(0, 0, 0)

    bodies.forEach((b) => world.addBody(b))
    world.addBody(ground)

    // Create 3 contact material pairs
    contactMaterials = [
      new ContactMaterial(materials[0], materials[1], { friction: 0.3, restitution: 0.1 }),
      new ContactMaterial(materials[1], materials[2], { friction: 0.4, restitution: 0.2 }),
      new ContactMaterial(materials[2], materials[3], { friction: 0.5, restitution: 0.3 }),
    ]

    // Add them to world
    contactMaterials.forEach((cm) => world.addContactMaterial(cm))
  })

  it('material property changes are deferred until next internalStep', () => {
    // Step once to commit initial state
    world.step(1 / 60)

    const mat = materials[0]
    const oldFriction = mat.friction

    // Change friction - should NOT be visible in getter yet
    mat.friction = 0.99

    // Getter still returns old value (pending, not committed)
    expect(mat.friction).toBe(oldFriction)

    // Step - now changes should be committed
    world.step(1 / 60)

    expect(mat.friction).toBe(0.99)
  })

  it('contactMaterial property changes are deferred until next internalStep', () => {
    world.step(1 / 60)

    const cm = contactMaterials[0]
    const oldFriction = cm.friction

    cm.friction = 0.88

    // Getter returns old value before step
    expect(cm.friction).toBe(oldFriction)

    world.step(1 / 60)

    expect(cm.friction).toBe(0.88)
  })

  it('addContactMaterial is deferred until next internalStep', () => {
    world.step(1 / 60)

    const newCm = new ContactMaterial(materials[3], materials[4], { friction: 0.6, restitution: 0.4 })

    // Add - should be buffered, not immediately visible in query
    world.addContactMaterial(newCm)

    // getContactMaterial returns null because addition is pending
    const queried = world.getContactMaterial(materials[3], materials[4])
    expect(queried).toBeUndefined()

    world.step(1 / 60)

    // Now it should be visible
    const queried2 = world.getContactMaterial(materials[3], materials[4])
    expect(queried2).toBe(newCm)
  })

  it('removeContactMaterial is deferred until next internalStep', () => {
    world.step(1 / 60)

    const cm = contactMaterials[0]

    // Remove - should be buffered, still visible in query
    world.removeContactMaterial(cm)

    // getContactMaterial still returns the cm because removal is pending
    const queried = world.getContactMaterial(materials[0], materials[1])
    expect(queried).toBe(cm)

    world.step(1 / 60)

    // Now it should be gone
    const queried2 = world.getContactMaterial(materials[0], materials[1])
    expect(queried2).toBeUndefined()
  })

  it('all changes in one step batch are committed atomically', () => {
    world.step(1 / 60)

    // Simultaneously change multiple materials and contact materials between steps
    materials[0].friction = 1.0
    materials[1].restitution = 0.9
    contactMaterials[0].friction = 0.77
    contactMaterials[1].restitution = 0.88

    const newCm = new ContactMaterial(materials[3], materials[4], { friction: 0.55, restitution: 0.44 })
    world.addContactMaterial(newCm)
    world.removeContactMaterial(contactMaterials[2])

    // Before step: all queries return OLD values
    expect(materials[0].friction).toBe(0.5)
    expect(materials[1].restitution).toBe(0.2)
    expect(contactMaterials[0].friction).toBe(0.3)
    expect(contactMaterials[1].restitution).toBe(0.2)
    expect(world.getContactMaterial(materials[3], materials[4])).toBeUndefined()
    expect(world.getContactMaterial(materials[2], materials[3])).toBe(contactMaterials[2])

    // Step - all changes committed atomically
    world.step(1 / 60)

    // After step: all values updated
    expect(materials[0].friction).toBe(1.0)
    expect(materials[1].restitution).toBe(0.9)
    expect(contactMaterials[0].friction).toBe(0.77)
    expect(contactMaterials[1].restitution).toBe(0.88)
    expect(world.getContactMaterial(materials[3], materials[4])).toBe(newCm)
    expect(world.getContactMaterial(materials[2], materials[3])).toBeUndefined()
  })

  it('invalid material friction rolls back ALL pending changes', () => {
    world.step(1 / 60)

    const oldFriction0 = materials[0].friction
    const oldRestitution1 = materials[1].restitution
    const oldCmFriction = contactMaterials[0].friction

    // Make some valid changes and one invalid change
    materials[0].friction = 0.99         // valid
    materials[1].restitution = 0.5       // valid
    contactMaterials[0].friction = 0.6   // valid
    materials[2].friction = NaN          // INVALID - should cause rollback of ALL

    world.step(1 / 60)

    // All changes should be rolled back
    expect(materials[0].friction).toBe(oldFriction0)
    expect(materials[1].restitution).toBe(oldRestitution1)
    expect(contactMaterials[0].friction).toBe(oldCmFriction)
    expect(materials[2].friction).toBe(0.7) // original value
  })

  it('invalid contact material stiffness rolls back ALL pending changes', () => {
    world.step(1 / 60)

    const oldFriction0 = materials[0].friction
    const oldCmStiffness = contactMaterials[0].contactEquationStiffness

    materials[0].friction = 0.88                        // valid
    contactMaterials[0].contactEquationStiffness = -100 // INVALID (must be > 0)

    world.step(1 / 60)

    // All rolled back
    expect(materials[0].friction).toBe(oldFriction0)
    expect(contactMaterials[0].contactEquationStiffness).toBe(oldCmStiffness)
  })

  it('material not yet in world applies changes immediately', () => {
    // Material not added to any world
    const detachedMat = new Material({ friction: 0.5, restitution: 0.5 })

    expect(detachedMat.friction).toBe(0.5)

    // Setting property on detached material takes effect immediately
    detachedMat.friction = 0.9
    expect(detachedMat.friction).toBe(0.9)
  })

  it('contact material not yet in world applies changes immediately', () => {
    const cm = new ContactMaterial(materials[0], materials[1], { friction: 0.5 })
    expect(cm.friction).toBe(0.5)

    cm.friction = 0.8
    expect(cm.friction).toBe(0.8)
  })

  it('query interface reads committed version within same step', () => {
    world.step(1 / 60)

    materials[0].friction = 0.42
    // Query still sees old committed value (0.5 from initial step commit)
    expect(materials[0].friction).toBe(0.5)

    world.step(1 / 60)
    expect(materials[0].friction).toBe(0.42)

  })

  it('commitPendingChanges returns false on validation failure', () => {
    world.step(1 / 60)

    materials[0].friction = -1 // invalid (must be >= 0)

    const result = world._commitPendingChanges()
    expect(result).toBe(false)

    // Material should still have old value
    expect(materials[0].friction).toBe(0.5)
  })
})
