export type MaterialOptions = ConstructorParameters<typeof Material>[0]

/**
 * Defines a physics material.
 */
export class Material {
  /**
   * Material name.
   * If options is a string, name will be set to that string.
   * @todo Deprecate this
   */
  name: string
  /** Material id. */
  id: number

  /** @internal Registry mapping Material instances to their World (avoids circular refs). */
  static _worldRegistry: Map<Material, import('../world/World').World> = new Map()

  /**
   * Friction for this material.
   * If non-negative, it will be used instead of the friction given by ContactMaterials. If there's no matching ContactMaterial, the value from `defaultContactMaterial` in the World will be used.
   */
  private _friction: number = -1
  private _pendingFriction: number | null = null

  /**
   * Restitution for this material.
   * If non-negative, it will be used instead of the restitution given by ContactMaterials. If there's no matching ContactMaterial, the value from `defaultContactMaterial` in the World will be used.
   */
  private _restitution: number = -1
  private _pendingRestitution: number | null = null

  get friction(): number {
    return this._friction
  }

  set friction(v: number) {
    const world = Material._worldRegistry.get(this)
    if (world) {
      this._pendingFriction = v
      world._registerPendingMaterial(this)
    } else {
      this._friction = v
    }
  }

  get restitution(): number {
    return this._restitution
  }

  set restitution(v: number) {
    const world = Material._worldRegistry.get(this)
    if (world) {
      this._pendingRestitution = v
      world._registerPendingMaterial(this)
    } else {
      this._restitution = v
    }
  }

  /** @internal Apply pending changes atomically. Returns false if validation fails. */
  _commit(): boolean {
    if (this._pendingFriction !== null) {
      this._friction = this._pendingFriction
      this._pendingFriction = null
    }
    if (this._pendingRestitution !== null) {
      this._restitution = this._pendingRestitution
      this._pendingRestitution = null
    }
    return true
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
    return true
  }

  /** @internal Discard pending changes. */
  _rollback(): void {
    this._pendingFriction = null
    this._pendingRestitution = null
  }

  /** @internal */
  _hasPendingChanges(): boolean {
    return this._pendingFriction !== null || this._pendingRestitution !== null
  }

  static idCounter = 0

  constructor(
    options:
      | {
          /**
           * Friction for this material.
           * If non-negative, it will be used instead of the friction given by ContactMaterials. If there's no matching ContactMaterial, the value from `defaultContactMaterial` in the World will be used.
           */
          friction?: number
          /**
           * Restitution for this material.
           * If non-negative, it will be used instead of the restitution given by ContactMaterials. If there's no matching ContactMaterial, the value from `defaultContactMaterial` in the World will be used.
           */
          restitution?: number
        }
      | string = {}
  ) {
    let name = ''

    // Backwards compatibility fix
    if (typeof options === 'string') {
      //console.warn(`Passing a string to MaterialOptions is deprecated, and has no effect`)
      name = options
      options = {}
    }

    this.name = name
    this.id = Material.idCounter++
    this._friction = typeof options.friction !== 'undefined' ? options.friction : -1
    this._restitution = typeof options.restitution !== 'undefined' ? options.restitution : -1
  }
}
