import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnvFiles() {
  const values = {};
  for (const filename of [".env", ".env.local"]) {
    if (!existsSync(filename)) continue;
    for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!match) continue;
      values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return values;
}

const paths = [
  "products/1781722315533-IMG_7533.heic",
  "products/1781722315994-IMG_7534.heic",
  "products/1781722316312-IMG_7532.heic",
  "products/1781722316777-IMG_7531.heic",
];

const env = readEnvFiles();
const supabaseUrl = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) throw new Error("Supabase URL of publishable key ontbreekt.");

const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tempDirectory = resolve(".tmp-heic-migration");
mkdirSync(tempDirectory, { recursive: true });

for (const storagePath of paths) {
  const jpegPath = storagePath.replace(/\.hei[cf]$/i, ".jpg");
  const inputPath = resolve(tempDirectory, basename(storagePath));
  const outputPath = resolve(tempDirectory, basename(jpegPath));

  const { data: source, error: downloadError } = await supabase.storage.from("orders").download(storagePath);
  if (downloadError || !source) throw downloadError || new Error(`Download mislukt: ${storagePath}`);
  writeFileSync(inputPath, Buffer.from(await source.arrayBuffer()));

  const conversion = spawnSync("ffmpeg", ["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "2", outputPath], {
    encoding: "utf8",
  });
  if (conversion.status !== 0) {
    throw new Error(`Conversie mislukt voor ${storagePath}: ${conversion.stderr.slice(-1000)}`);
  }

  const jpeg = readFileSync(outputPath);
  const { error: uploadError } = await supabase.storage.from("orders").upload(jpegPath, jpeg, {
    contentType: "image/jpeg",
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
  process.stdout.write(`Geconverteerd: ${storagePath} -> ${jpegPath}\n`);
}
