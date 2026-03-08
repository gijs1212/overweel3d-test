import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilePreview3DProps {
  file?: File;
  url?: string;
  filename: string;
  className?: string;
}

export function FilePreview3D({ file, url, filename, className = "" }: FilePreview3DProps) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);

  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  const supported = [".stl", ".obj"].includes(ext);

  const cleanup = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!show || !containerRef.current) return;

    setLoading(true);
    setError(false);

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 200;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color().setHSL(0, 0, 0.12);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(3, 3, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1);
    dirLight1.position.set(5, 5, 5);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-5, -3, -5);
    scene.add(dirLight2);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color("hsl(142, 60%, 50%)"),
      metalness: 0.3,
      roughness: 0.6,
    });

    const fitCameraToObject = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      object.scale.multiplyScalar(scale);
      object.position.sub(center.multiplyScalar(scale));
      controls.update();
    };

    const loadModel = async (buffer: ArrayBuffer) => {
      try {
        if (ext === ".stl") {
          const geometry = new STLLoader().parse(buffer);
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          fitCameraToObject(mesh);
        } else if (ext === ".obj") {
          const text = new TextDecoder().decode(buffer);
          const group = new OBJLoader().parse(text);
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) child.material = material;
          });
          scene.add(group);
          fitCameraToObject(group);
        }
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    };

    if (file) {
      file.arrayBuffer().then(loadModel).catch(() => { setError(true); setLoading(false); });
    } else if (url) {
      fetch(url).then(r => r.arrayBuffer()).then(loadModel).catch(() => { setError(true); setLoading(false); });
    }

    // Animate
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return cleanup;
  }, [show, file, url, ext, cleanup]);

  if (!supported) return null;

  return (
    <div className={className}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setShow(!show); if (show) cleanup(); }}
        className="text-xs gap-1 h-7 px-2"
      >
        {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {show ? "Verberg" : "Preview"}
      </Button>

      {show && (
        <div
          ref={containerRef}
          className="mt-2 rounded-lg overflow-hidden border border-border bg-muted/30 relative"
          style={{ height: 200 }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Preview niet beschikbaar
            </div>
          )}
        </div>
      )}
    </div>
  );
}
