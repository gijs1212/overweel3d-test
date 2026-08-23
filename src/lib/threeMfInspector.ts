import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { strFromU8, unzipSync } from "three/examples/jsm/libs/fflate.module.js";

export interface ThreeMfPlate {
  number: number;
  name: string;
  fileName: string;
  previewUrl?: string;
}

export interface ThreeMfInspection {
  fileName: string;
  fileSize: number;
  signature: string;
  meshCount: number;
  triangleCount: number;
  dimensions: { width: number; depth: number; height: number };
  colors: Array<{ name: string; hex: string }>;
  plates: ThreeMfPlate[];
  archiveFiles: string[];
}

const bambuFilamentColors = (archive: Record<string, Uint8Array>, paths: string[]) => {
  const result = new Map<string, { name: string; hex: string }>();
  for (const path of paths.filter((value) => /(?:slice_info|project_settings)\.config$/i.test(value))) {
    const content = strFromU8(archive[path]);
    for (const match of content.matchAll(/<filament\b([^>]*)>/gi)) {
      const attributes = match[1];
      const hex = attributes.match(/\bcolor=["'](#[0-9a-f]{6,8})["']/i)?.[1]?.slice(0, 7).toUpperCase();
      if (!hex) continue;
      const name = attributes.match(/\b(?:name|type)=["']([^"']+)["']/i)?.[1] || `Filament ${result.size + 1}`;
      result.set(hex, { name, hex });
    }
    try {
      const json = JSON.parse(content) as { filament_colour?: string[]; filament_type?: string[] };
      (json.filament_colour || []).forEach((value, index) => {
        const hex = value.slice(0, 7).toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(hex)) result.set(hex, { name: json.filament_type?.[index] || `Filament ${index + 1}`, hex });
      });
    } catch { /* XML configuration */ }
  }
  return [...result.values()];
};

export function disposeThreeMfInspection(inspection: ThreeMfInspection | null) {
  inspection?.plates.forEach((plate) => { if (plate.previewUrl) URL.revokeObjectURL(plate.previewUrl); });
}

const normalizePrintName = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/^.*[\\/]/, "")
  .replace(/\.(gcode\.3mf|3mf|gcode)$/i, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

export function printFileMatch(expected: string, observed: string) {
  const left = normalizePrintName(expected);
  const right = normalizePrintName(observed);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

export function plateCandidatesFromArchiveFiles(files: readonly string[]): ThreeMfPlate[] {
  const candidates = new Map<number, ThreeMfPlate>();
  for (const path of files) {
    const match = path.match(/(?:^|\/)plate[_-]?(\d+)(?:[^\d]|$)/i);
    if (!match) continue;
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1) continue;
    const baseName = path.split(/[\\/]/).pop() || `Plaat ${number}`;
    const current = candidates.get(number);
    const isPrintable = /\.(gcode|gcode\.3mf)$/i.test(baseName);
    if (!current || isPrintable) candidates.set(number, { number, name: `Plaat ${number}`, fileName: baseName });
  }
  return [...candidates.values()].sort((a, b) => a.number - b.number);
}

const colorHex = (material: THREE.Material) => {
  const value = (material as THREE.MeshStandardMaterial).color;
  return value?.isColor ? `#${value.getHexString().toUpperCase()}` : null;
};

export async function inspectThreeMf(file: File): Promise<ThreeMfInspection> {
  const buffer = await file.arrayBuffer();
  const group = new ThreeMFLoader().parse(buffer);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const colors = new Map<string, { name: string; hex: string }>();
  let meshCount = 0;
  let triangleCount = 0;

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshCount += 1;
    const geometry = object.geometry as THREE.BufferGeometry;
    triangleCount += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute("position")?.count || 0) / 3;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material, index) => {
      const hex = colorHex(material);
      if (!hex) return;
      colors.set(hex, { name: material.name || `Kleur ${colors.size + index + 1}`, hex });
    });
  });

  const archive = unzipSync(new Uint8Array(buffer));
  const archiveFiles = Object.keys(archive).sort();
  bambuFilamentColors(archive, archiveFiles).forEach((color) => colors.set(color.hex, color));
  let plates = plateCandidatesFromArchiveFiles(archiveFiles);
  if (!plates.length) {
    const sliceConfigPath = archiveFiles.find((path) => /slice_info\.config$/i.test(path));
    const config = sliceConfigPath ? strFromU8(archive[sliceConfigPath]) : "";
    const indices = [...config.matchAll(/(?:plate|index)[^>]*(?:value=["'](\d+)["']|>(\d+)<)/gi)]
      .map((match) => Number(match[1] || match[2]))
      .filter((value) => Number.isInteger(value) && value > 0);
    plates = [...new Set(indices)].sort((a, b) => a - b).map((number) => ({ number, name: `Plaat ${number}`, fileName: file.name }));
  }
  if (!plates.length) plates = [{ number: 1, name: "Plaat 1", fileName: file.name }];
  plates = plates.map((plate) => {
    const previewPath = archiveFiles.find((path) => new RegExp(`(?:^|/)plate_${plate.number}\\.png$`, "i").test(path))
      || archiveFiles.find((path) => new RegExp(`(?:^|/)plate_no_light_${plate.number}\\.png$`, "i").test(path));
    const printableName = /\.(?:gcode|gcode\.3mf)$/i.test(plate.fileName) ? plate.fileName : file.name;
    return previewPath
      ? { ...plate, fileName: printableName, previewUrl: URL.createObjectURL(new Blob([archive[previewPath]], { type: "image/png" })) }
      : { ...plate, fileName: printableName };
  });

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const signature = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return {
    fileName: file.name,
    fileSize: file.size,
    signature,
    meshCount,
    triangleCount: Math.round(triangleCount),
    dimensions: { width: size.x, depth: size.y, height: size.z },
    colors: [...colors.values()],
    plates,
    archiveFiles,
  };
}
