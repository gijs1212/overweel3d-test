import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { inflateSync, strFromU8 } from "three/examples/jsm/libs/fflate.module.js";

export interface ThreeMfPlate {
  number: number;
  name: string;
  fileName: string;
  previewUrl?: string;
  nozzleDiameter?: number;
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
  modelDetailsAvailable: boolean;
}

export interface InspectThreeMfOptions {
  lightweight?: boolean;
}

interface ZipDirectoryEntry {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const listZipDirectory = (bytes: Uint8Array): ZipDirectoryEntry[] => {
  let endOffset = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Dit 3MF-bestand heeft geen geldige ZIP-map.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalEntries = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipDirectoryEntry[] = [];
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({
      path,
      compressionMethod: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!entries.length) throw new Error("Dit 3MF-bestand bevat geen leesbare bestanden.");
  return entries;
};

const extractZipEntry = (bytes: Uint8Array, entry: ZipDirectoryEntry): Uint8Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error(`Beschadigd 3MF-onderdeel: ${entry.path}`);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error(`Onvolledig 3MF-onderdeel: ${entry.path}`);
  const compressed = bytes.subarray(start, end);
  if (entry.compressionMethod === 0) return compressed.slice();
  if (entry.compressionMethod === 8) return inflateSync(compressed);
  throw new Error(`Niet-ondersteunde ZIP-compressie in ${entry.path}.`);
};

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

const bambuNozzleDiameter = (archive: Record<string, Uint8Array>, paths: string[]) => {
  for (const path of paths.filter((value) => /(?:slice_info|project_settings|model_settings)\.config$/i.test(value))) {
    const content = strFromU8(archive[path]);
    try {
      const settings = JSON.parse(content) as Record<string, unknown>;
      for (const key of ["nozzle_diameter", "nozzle_diameters", "machine_nozzle_size", "printer_nozzle_diameter"]) {
        const raw = Array.isArray(settings[key]) ? settings[key][0] : settings[key];
        const match = String(raw ?? "").replace(",", ".").match(/(?:^|\D)(0\.\d+|1(?:\.0)?)(?:\D|$)/);
        if (match) return Number(match[1]);
      }
    } catch { /* XML configuration */ }
    const xmlMatch = content.match(/(?:nozzle_diameters?|machine_nozzle_size|printer_nozzle_diameter)[^\d]*(0[.,]\d+|1(?:[.,]0)?)/i);
    if (xmlMatch) return Number(xmlMatch[1].replace(",", "."));
  }
  return undefined;
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

export async function inspectThreeMf(file: File, options: InspectThreeMfOptions = {}): Promise<ThreeMfInspection> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const entries = listZipDirectory(bytes);
  const archiveFiles = entries.map((entry) => entry.path).sort();
  const relevantEntries = entries.filter((entry) => /(?:slice_info|project_settings|model_settings)\.config$/i.test(entry.path));
  const archive: Record<string, Uint8Array> = {};
  relevantEntries.forEach((entry) => { archive[entry.path] = extractZipEntry(bytes, entry); });
  const colors = new Map<string, { name: string; hex: string }>();
  let meshCount = 0;
  let triangleCount = 0;
  const size = new THREE.Vector3();
  let modelDetailsAvailable = false;

  if (!options.lightweight) {
    const group = new ThreeMFLoader().parse(buffer);
    new THREE.Box3().setFromObject(group).getSize(size);
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
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    });
    modelDetailsAvailable = true;
  }

  bambuFilamentColors(archive, archiveFiles).forEach((color) => colors.set(color.hex, color));
  const nozzleDiameter = bambuNozzleDiameter(archive, archiveFiles);
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
    const previewEntry = entries.find((entry) => new RegExp(`(?:^|/)plate_${plate.number}\\.png$`, "i").test(entry.path))
      || entries.find((entry) => new RegExp(`(?:^|/)plate_no_light_${plate.number}\\.png$`, "i").test(entry.path));
    const printableName = /\.(?:gcode|gcode\.3mf)$/i.test(plate.fileName) ? plate.fileName : file.name;
    return previewEntry
      ? { ...plate, fileName: printableName, nozzleDiameter, previewUrl: URL.createObjectURL(new Blob([extractZipEntry(bytes, previewEntry)], { type: "image/png" })) }
      : { ...plate, fileName: printableName, nozzleDiameter };
  });

  const signature = options.lightweight
    ? ""
    : [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

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
    modelDetailsAvailable,
  };
}
