import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  /** A local File or a Supabase storage path inside the `orders` bucket. */
  file?: File | null;
  storagePath?: string | null;
  filename?: string;
  height?: number;
  className?: string;
};

const SUPPORTED = [".stl", ".obj"];

function extOf(name: string) {
  const i = name.toLowerCase().lastIndexOf(".");
  return i >= 0 ? name.toLowerCase().slice(i) : "";
}

export function ModelViewer({ file, storagePath, filename, height = 240, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const name = filename || file?.name || storagePath || "";
  const ext = extOf(name);
  const supported = SUPPORTED.includes(ext);

  useEffect(() => {
    if (!supported || !containerRef.current) return;
    setLoading(true);
    setError(null);

    const container = containerRef.current;
    const width = container.clientWidth || 300;
    const h = height;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, width / h, 0.1, 5000);
    camera.position.set(80, 80, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, h);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1, 1, 1);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-1, -0.5, -1);
    scene.add(dir2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    let frameId = 0;
    let disposed = false;
    let mesh: THREE.Object3D | null = null;

    const animate = () => {
      if (disposed) return;
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    const fitToObject = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const dist = maxDim * 2.2;
      camera.position.set(dist, dist * 0.8, dist);
      camera.lookAt(0, 0, 0);
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
    };

    const loadFromArrayBuffer = (buf: ArrayBuffer) => {
      try {
        if (ext === ".stl") {
          const geometry = new STLLoader().parse(buf);
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: 0x00b4d8, metalness: 0.1, roughness: 0.6 });
          mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
        } else if (ext === ".obj") {
          const text = new TextDecoder().decode(buf);
          const obj = new OBJLoader().parse(text);
          obj.traverse((c: any) => {
            if (c.isMesh) {
              c.material = new THREE.MeshStandardMaterial({ color: 0x00b4d8, metalness: 0.1, roughness: 0.6 });
            }
          });
          mesh = obj;
          scene.add(mesh);
        }
        if (mesh) fitToObject(mesh);
        setLoading(false);
        animate();
      } catch (e: any) {
        setError("Kon model niet laden");
        setLoading(false);
      }
    };

    const loadIt = async () => {
      try {
        if (file) {
          const buf = await file.arrayBuffer();
          if (!disposed) loadFromArrayBuffer(buf);
        } else if (storagePath) {
          const { data, error } = await supabase.storage.from("orders").download(storagePath);
          if (error || !data) throw error || new Error("Download mislukt");
          const buf = await data.arrayBuffer();
          if (!disposed) loadFromArrayBuffer(buf);
        }
      } catch (e: any) {
        if (!disposed) {
          setError("Kon model niet laden");
          setLoading(false);
        }
      }
    };

    loadIt();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 300;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    };
  }, [file, storagePath, ext, supported, height]);

  if (!supported) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-muted/40 rounded-lg border border-border text-muted-foreground ${className || ""}`}
        style={{ height }}
      >
        <FileText className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-xs">Geen 3D-preview voor {ext || "dit bestand"}</p>
      </div>
    );
  }

  return (
    <div className={`relative bg-muted/30 rounded-lg overflow-hidden border border-border ${className || ""}`}>
      <div ref={containerRef} style={{ width: "100%", height }} />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
