import { Utils } from '../utils/Utils'
import type { Material } from '../material/Material'

export type ContactMaterialOptions = ConstructorParameters<typeof ContactMaterial>[2]

/**
 * Defines what happens when two materials meet.
 * @todo Refactor materials to materialA and materialB
 */
export class ContactMaterial {
  /**
   * Identifier of this material.
   */
  id: number
  /**
   * Participating materials.
   */
  materials: [Material, Material]

  /** @internal Registry mapping ContactMaterial instances to their World. Uses Map to avoid circular JSON refs. */
  static _worldRegistry: Map<ContactMaterial, any> = new Map()

  /**
   * Friction coefficient.
   * @default 0.3
   */
  private _friction: number
  private _pendingFriction: number | null = null

  /**
   * Restitution coefficient.
   * @default 0.3
   */
  private _restitution: number
  private _pendingRestitution: number | null = null

  /**
   * Stiffness of the produced contact equations.
   * @default 1e7
   */
  private _contactEquationStiffness: number
  private _pendingContactEquationStiffness: number | null = null

  /**
   * Relaxation time of the produced contact equations.
   * @default 3
   */
  private _contactEquationRelaxation: number
  private _pendingContactEquationRelaxation: number | null = null

  /**
   * Stiffness of the produced friction equations.
   * @default 1e7
   */
  private _frictionEquationStiffness: number
  private _pendingFrictionEquationStiffness: number | null = null

  /**
   * Relaxation time of the produced friction equations
   * @default 3
   */
  private _frictionEquationRelaxation: number
  private _pendingFrictionEquationRelaxation: number | null = null

  get friction(): number {
    return this._friction
  }

  set friction(v: number) {
    const world = ContactMaterial._worldRegistry.get(this)
    if (world) {
      this._pendingFriction = v
      world._registerPendingContactMaterial(this)
    } else {
      this._friction = v
    }
  }

  get restitution(): number {
    return this._restitution
  }

  set restitution(v: number) {
    const world = ContactMaterial._worldRegistry.get(this)
    if (world) {
      this._pendingRestitution = v
      world._registerPendingContactMaterial(this)
    } else {
      this._restitution = v
    }
  }

  get contactEquationStiffness(): number {
    return this._contactEquationStiffness
  }

  set contactEquationStiffness(v: number) {
    const world = ContactMaterial._worldRegistry.get(this)
    if (world) {
      this._pendingContactEquationStiffness = v
      world._registerPendingContactMaterial(this)
    } else {
      this._contactEquationStiffness = v
    }
  }

  get contactEquationRelaxation(): number {
    return this._contactEquationRelaxation
  }

  set contactEquationRelaxation(v: number) {
    const world = ContactMaterial._worldRegistry.get(this)
    if (world) {
      this._pendingContactEquationRelaxation = v
      world._registerPendingContactMaterial(this)
    } else {
      this._contactEquationRelaxation = v
    }
  }

  get frictionEquationStiffness(): number {
    return this._frictionEquationStiffness
  }

  set frictionEquationStiffness(v: number) {
    const world = ContactMaterial._worldRegistry.get(this)
    if (world) {
      this._pendingFrictionEquationStiffness = v
      world._registerPendingContactMaterial(this)
    } else {
      this._frictionEquationStiffness = v
    }
  }

  get frictionEquationRelaxation(): number {
    return this._frictionEquationRelaxation
  }

  set frictionEquationRelaxation(v: number) {
    const world = ContactMaterial._worldRegistry.get(this)
    if (world) {
      this._pendingFrictionEquationRelaxation = v
      world._registerPendingContactMaterial(this)
    } else {
      this._frictionEquationRelaxation = v
    }
  }

  /** @internal Apply pending changes atomically. */
  _commit(): void {
    if (this._pendingFriction !== null) {
      this._friction = this._pendingFriction
      this._pendingFriction = null
    }
    if (this._pendingRestitution !== null) {
      this._restitution = this._pendingRestitution
      this._pendingRestitution = null
    }
    if (this._pendingContactEquationStiffness !== null) {
      this._contactEquationStiffness = this._pendingContactEquationStiffness
      this._pendingContactEquationStiffness = null
    }
    if (this._pendingContactEquationRelaxation !== null) {
      this._contactEquationRelaxation = this._pendingContactEquationRelaxation
      this._pendingContactEquationRelaxation = null
    }
    if (this._pendingFrictionEquationStiffness !== null) {
      this._frictionEquationStiffness = this._pendingFrictionEquationStiffness
      this._pendingFrictionEquationStiffness = null
    }
    if (this._pendingFrictionEquationRelaxation !== null) {
      this._frictionEquationRelaxation = this._pendingFrictionEquationRelaxation
      this._pendingFrictionEquationRelaxation = null
    }
  }

  /** @internal Validate pending changes without applying. Returns false if invalid. */
  _validate(): boolean {
    if (this._pendingFriction !== null) {
      if (!Number.isFinite(this._pendingFriction) || this._pendingFriction < 0) {
        return false
      }
    }
    if (this._pendingRestitution !== null) {
      if (!Number.isFinite(this._pendingRestitution) || this._pendingRestitution < 0) {
        return false
      }
    }
    if (this._pendingContactEquationStiffness !== null) {
      if (!Number.isFinite(this._pendingContactEquationStiffness) || this._pendingContactEquationStiffness <= 0) {
        return false
      }
    }
    if (this._pendingContactEquationRelaxation !== null) {
      if (!Number.isFinite(this._pendingContactEquationRelaxation) || this._pendingContactEquationRelaxation <= 0) {
        return false
      }
    }
    if (this._pendingFrictionEquationStiffness !== null) {
      if (!Number.isFinite(this._pendingFrictionEquationStiffness) || this._pendingFrictionEquationStiffness <= 0) {
        return false
      }
    }
    if (this._pendingFrictionEquationRelaxation !== null) {
      if (!Number.isFinite(this._pendingFrictionEquationRelaxation) || this._pendingFrictionEquationRelaxation <= 0) {
        return false
      }
    }
    return true
  }

  /** @internal Discard pending changes. */
  _rollback(): void {
    this._pendingFriction = null
    this._pendingRestitution = null
    this._pendingContactEquationStiffness = null
    this._pendingContactEquationRelaxation = null
    this._pendingFrictionEquationStiffness = null
    this._pendingFrictionEquationRelaxation = null
  }

  /** @internal */
  _hasPendingChanges(): boolean {
    return (
      this._pendingFriction !== null ||
      this._pendingRestitution !== null ||
      this._pendingContactEquationStiffness !== null ||
      this._pendingContactEquationRelaxation !== null ||
      this._pendingFrictionEquationStiffness !== null ||
      this._pendingFrictionEquationRelaxation !== null
    )
  }

  static idCounter = 0

  constructor(
    m1: Material,
    m2: Material,
    options: {
      friction?: number
      restitution?: number
      contactEquationStiffness?: number
      contactEquationRelaxation?: number
      frictionEquationStiffness?: number
      frictionEquationRelaxation?: number
    }
  ) {
    options = Utils.defaults(options, {
      friction: 0.3,
      restitution: 0.3,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
      frictionEquationStiffness: 1e7,
      frictionEquationRelaxation: 3,
    })

    this.id = ContactMaterial.idCounter++
    this.materials = [m1, m2]
    this._friction = options.friction!
    this._restitution = options.restitution!
    this._contactEquationStiffness = options.contactEquationStiffness!
    this._contactEquationRelaxation = options.contactEquationRelaxation!
    this._frictionEquationStiffness = options.frictionEquationStiffness!
    this._frictionEquationRelaxation = options.frictionEquationRelaxation!
  }
}
