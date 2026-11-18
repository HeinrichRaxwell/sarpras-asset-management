import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Animated glass-particle background layer for the login page.
 * Renders a subtle 3D particle field with slow orbit + parallax on mouse.
 * Honors prefers-reduced-motion (renders a static frame).
 */
export default function LoginBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 18;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Particle field — soft round points drifting in 3D
    const COUNT = 700;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const palette = [0x6366f1, 0x8b5cf6, 0x06b6d4, 0xa855f7, 0x0ea5e9];
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      c.set(palette[i % palette.length]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Soft circular sprite for particles
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dctx = dot.getContext('2d')!;
    const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 32, 32);
    const sprite = new THREE.CanvasTexture(dot);

    const mat = new THREE.PointsMaterial({
      size: 0.1,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // A few floating glass-like rings for depth
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
    });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(5 + i * 2.4, 0.015, 6, 64),
        ringMat,
      );
      r.rotation.x = Math.random() * Math.PI;
      r.rotation.y = Math.random() * Math.PI;
      scene.add(r);
      rings.push(r);
    }

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: MouseEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = clock.getElapsedTime();
      if (now - last < 1 / 30) return; // cap ~30fps
      last = now;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      points.rotation.y = now * 0.03 + pointer.x * 0.25;
      points.rotation.x = pointer.y * 0.15;
      rings.forEach((r, i) => {
        r.rotation.z = now * (0.04 + i * 0.015);
      });

      renderer.render(scene, camera);
    };

    if (reduced) {
      // Static single frame
      renderer.render(scene, camera);
    } else {
      tick();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      ringMat.dispose();
      rings.forEach((r) => r.geometry.dispose());
      sprite.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 -z-10" aria-hidden="true" />;
}