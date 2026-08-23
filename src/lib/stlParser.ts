/**
 * Client-side 3D file parser for volume calculation.
 * Supports binary & ASCII STL, OBJ, and basic 3MF files.
 * Uses the signed tetrahedron volume method for mesh volume calculation.
 */

interface Triangle {
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
}

export interface ParseResult {
  volumeCm3: number;
  triangleCount: number;
  boundingBox: {
    width: number;  // mm
    height: number; // mm
    depth: number;  // mm
  };
}

/**
 * Calculate volume of a mesh using the signed tetrahedron method.
 * Each triangle with the origin forms a signed tetrahedron.
 * Sum of signed volumes = total enclosed volume.
 */
function calculateVolumeFromTriangles(triangles: Triangle[]): ParseResult {
  let volume = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const tri of triangles) {
    const [x1, y1, z1] = tri.v1;
    const [x2, y2, z2] = tri.v2;
    const [x3, y3, z3] = tri.v3;

    // Signed volume of tetrahedron formed by triangle and origin
    volume += (
      x1 * (y2 * z3 - y3 * z2) +
      x2 * (y3 * z1 - y1 * z3) +
      x3 * (y1 * z2 - y2 * z1)
    ) / 6.0;

    // Bounding box
    for (const [x, y, z] of [tri.v1, tri.v2, tri.v3]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }

  const absVolumeMm3 = Math.abs(volume);
  const volumeCm3 = absVolumeMm3 / 1000; // mm³ to cm³

  return {
    volumeCm3,
    triangleCount: triangles.length,
    boundingBox: {
      width: maxX - minX,
      height: maxY - minY,
      depth: maxZ - minZ,
    },
  };
}

/**
 * Parse binary STL file
 */
function parseBinarySTL(buffer: ArrayBuffer): Triangle[] {
  const view = new DataView(buffer);
  const triangles: Triangle[] = [];

  // Binary STL: 80 byte header, 4 byte triangle count, then 50 bytes per triangle
  const numTriangles = view.getUint32(80, true);

  for (let i = 0; i < numTriangles; i++) {
    const offset = 84 + i * 50;
    // Skip normal (12 bytes), read 3 vertices (each 3 floats = 12 bytes)
    const v1: [number, number, number] = [
      view.getFloat32(offset + 12, true),
      view.getFloat32(offset + 16, true),
      view.getFloat32(offset + 20, true),
    ];
    const v2: [number, number, number] = [
      view.getFloat32(offset + 24, true),
      view.getFloat32(offset + 28, true),
      view.getFloat32(offset + 32, true),
    ];
    const v3: [number, number, number] = [
      view.getFloat32(offset + 36, true),
      view.getFloat32(offset + 40, true),
      view.getFloat32(offset + 44, true),
    ];
    triangles.push({ v1, v2, v3 });
  }

  return triangles;
}

/**
 * Parse ASCII STL file
 */
function parseASCIISTL(text: string): Triangle[] {
  const triangles: Triangle[] = [];
  const vertexRegex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/gi;
  const vertices: [number, number, number][] = [];

  let match;
  while ((match = vertexRegex.exec(text)) !== null) {
    vertices.push([
      parseFloat(match[1]),
      parseFloat(match[2]),
      parseFloat(match[3]),
    ]);
  }

  for (let i = 0; i + 2 < vertices.length; i += 3) {
    triangles.push({
      v1: vertices[i],
      v2: vertices[i + 1],
      v3: vertices[i + 2],
    });
  }

  return triangles;
}

/**
 * Parse OBJ file
 */
function parseOBJ(text: string): Triangle[] {
  const vertices: [number, number, number][] = [];
  const triangles: Triangle[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("v ")) {
      const parts = trimmed.split(/\s+/);
      vertices.push([
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      ]);
    } else if (trimmed.startsWith("f ")) {
      const parts = trimmed.split(/\s+/).slice(1);
      // Parse face indices (1-based, may include texture/normal refs like 1/2/3)
      const indices = parts.map((p) => parseInt(p.split("/")[0]) - 1);
      // Triangulate fan
      for (let i = 1; i + 1 < indices.length; i++) {
        if (vertices[indices[0]] && vertices[indices[i]] && vertices[indices[i + 1]]) {
          triangles.push({
            v1: vertices[indices[0]],
            v2: vertices[indices[i]],
            v3: vertices[indices[i + 1]],
          });
        }
      }
    }
  }

  return triangles;
}

/**
 * Check if an ArrayBuffer is a binary STL
 */
function isBinarySTL(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const numTriangles = view.getUint32(80, true);
  const expectedSize = 84 + numTriangles * 50;
  // Allow small variance (some files have extra bytes)
  return Math.abs(buffer.byteLength - expectedSize) < 100;
}

/**
 * Main entry: parse a 3D file and return volume info
 */
export async function parse3DFile(file: File): Promise<ParseResult | null> {
  try {
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
    const buffer = await file.arrayBuffer();

    let triangles: Triangle[] = [];

    if (ext === ".stl") {
      if (isBinarySTL(buffer)) {
        triangles = parseBinarySTL(buffer);
      } else {
        const text = new TextDecoder().decode(buffer);
        triangles = parseASCIISTL(text);
      }
    } else if (ext === ".obj") {
      const text = new TextDecoder().decode(buffer);
      triangles = parseOBJ(text);
    } else if (ext === ".3mf") {
      const [{ ThreeMFLoader }, THREE] = await Promise.all([
        import("three/examples/jsm/loaders/3MFLoader.js"),
        import("three"),
      ]);
      const group = new ThreeMFLoader().parse(buffer);
      group.updateMatrixWorld(true);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry as InstanceType<typeof THREE.BufferGeometry>;
        const positions = geometry.getAttribute("position");
        if (!positions) return;
        const index = geometry.index;
        const vertex = (vertexIndex: number): [number, number, number] => {
          const point = new THREE.Vector3().fromBufferAttribute(positions, vertexIndex).applyMatrix4(object.matrixWorld);
          return [point.x, point.y, point.z];
        };
        const count = index ? index.count : positions.count;
        for (let offset = 0; offset + 2 < count; offset += 3) {
          const a = index ? index.getX(offset) : offset;
          const b = index ? index.getX(offset + 1) : offset + 1;
          const c = index ? index.getX(offset + 2) : offset + 2;
          triangles.push({ v1: vertex(a), v2: vertex(b), v3: vertex(c) });
        }
      });
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    } else if (ext === ".step" || ext === ".stp") {
      return null;
    }

    if (triangles.length === 0) return null;

    return calculateVolumeFromTriangles(triangles);
  } catch (e) {
    console.error("Error parsing 3D file:", e);
    return null;
  }
}

/**
 * Estimate print weight in grams from volume.
 * Uses infill percentage and wall thickness to estimate actual material used.
 */
export function estimatePrintWeight(volumeCm3: number, infillPercent = 20): number {
  // PLA density ~1.24 g/cm³, PETG ~1.27, TPU ~1.21
  // Average density for estimation
  const density = 1.24; // g/cm³

  // A typical print has:
  // - Shell/walls: ~2mm thick outer shell (solid)
  // - Infill: internal structure at given percentage
  // Shell ratio varies by model, but ~30% shell + infill% of remaining 70% is reasonable
  const shellFraction = 0.30;
  const infillFraction = (infillPercent / 100) * (1 - shellFraction);
  const materialFraction = shellFraction + infillFraction;

  return volumeCm3 * density * materialFraction;
}
