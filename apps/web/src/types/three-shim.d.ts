declare namespace THREE {
  interface Color {}
  const Color: {
    new (color?: string | number): Color;
  };

  interface Vector2 {
    x: number;
    y: number;
    set(x: number, y: number): this;
  }
  const Vector2: {
    new (x?: number, y?: number): Vector2;
  };

  interface Vector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }
  const Vector3: {
    new (x?: number, y?: number, z?: number): Vector3;
  };

  interface Group {
    name: string;
    position: Vector3;
    add(...objects: unknown[]): this;
  }
  const Group: {
    new (): Group;
  };

  interface OrthographicCamera {
    position: Vector3;
    left: number;
    right: number;
    top: number;
    bottom: number;
    zoom: number;
  }

  interface Scene {
    add(...objects: unknown[]): unknown;
    remove(...objects: unknown[]): unknown;
    getObjectByName(name: string): unknown | undefined | null;
  }

  interface WebGLRenderer {}
}

declare module "three" {
  export = THREE;
}
