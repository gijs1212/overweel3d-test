import { useState, useEffect, useRef, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilePreview3DProps {
  file?: File;
  url?: string;
  filename: string;
  className?: string;
}

function MeshFromGeometry({ geometry }: { geometry: THREE.BufferGeometry }) {
  // Auto-compute bounding box for centering and scaling
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2 / maxDim;

  return (
    <mesh geometry={geometry} scale={[scale, scale, scale]}>
      <meshStandardMaterial color="hsl(142, 60%, 50%)" metalness={0.3} roughness={0.6} />
    </mesh>
  );
}

function MeshFromGroup({ group }: { group: THREE.Group }) {
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    if (ref.current) {
      const box = new THREE.Box3().setFromObject(ref.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      ref.current.scale.set(scale, scale, scale);

      // Apply material
      ref.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color("hsl(142, 60%, 50%)"),
            metalness: 0.3,
            roughness: 0.6,
          });
        }
      });
    }
  }, [group]);

  return <primitive ref={ref} object={group} />;
}

function Scene({ file, url, filename }: { file?: File; url?: string; filename: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

    const loadFromBuffer = async (buffer: ArrayBuffer) => {
      try {
        if (ext === ".stl") {
          const loader = new STLLoader();
          const geo = loader.parse(buffer);
          setGeometry(geo);
        } else if (ext === ".obj") {
          const text = new TextDecoder().decode(buffer);
          const loader = new OBJLoader();
          const obj = loader.parse(text);
          setGroup(obj);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    };

    if (file) {
      file.arrayBuffer().then(loadFromBuffer).catch(() => setError(true));
    } else if (url) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then(loadFromBuffer)
        .catch(() => setError(true));
    }
  }, [file, url, filename]);

  if (error) return null;
  if (!geometry && !group) return null;

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-5, -3, -5]} intensity={0.4} />
      <Center>
        {geometry && <MeshFromGeometry geometry={geometry} />}
        {group && <MeshFromGroup group={group} />}
      </Center>
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

export function FilePreview3D({ file, url, filename, className = "" }: FilePreview3DProps) {
  const [show, setShow] = useState(false);
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  const supported = [".stl", ".obj"].includes(ext);

  if (!supported) return null;

  return (
    <div className={className}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShow(!show)}
        className="text-xs gap-1 h-7 px-2"
      >
        {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {show ? "Verberg" : "Preview"}
      </Button>

      {show && (
        <div className="mt-2 rounded-lg overflow-hidden border border-border bg-muted/30" style={{ height: 200 }}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
              </div>
            }
          >
            <Canvas camera={{ position: [3, 3, 3], fov: 45 }}>
              <Scene file={file} url={url} filename={filename} />
            </Canvas>
          </Suspense>
        </div>
      )}
    </div>
  );
}
