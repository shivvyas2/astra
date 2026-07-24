"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { gsap } from "gsap";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type Section = {
  eyebrow: string;
  title: string;
  lines: string[];
  cta?: { primary: { label: string; href: string }; secondary?: { label: string; href: string } };
};

const SECTIONS: Section[] = [
  {
    eyebrow: "Astrology, computed — not guessed",
    title: "ASTRA",
    lines: ["Your real birth chart, read by the stars."],
    cta: {
      primary: { label: "Get your reading", href: "/signup" },
      secondary: { label: "Log in", href: "/login" },
    },
  },
  {
    eyebrow: "A real engine",
    title: "THE SCIENCE",
    lines: [
      "We compute your exact chart with the Swiss Ephemeris —",
      "ascendant, houses, nakshatras, and your Vimshottari dasha.",
    ],
  },
  {
    eyebrow: "Vedic & Western",
    title: "YOUR CHART",
    lines: [
      "Switch between sidereal Vedic (kundli) and tropical Western.",
      "Every answer is grounded in your actual placements.",
    ],
  },
  {
    eyebrow: "Ask anything",
    title: "YOUR FUTURE",
    lines: [
      "Career, relationships, timing, a kundli reading —",
      "explained in plain words an average person can understand.",
    ],
    cta: { primary: { label: "Create your free account", href: "/signup" } },
  },
];

export default function CosmicHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const heroSubRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  const [shown, setShown] = useState(false);

  const refs = useRef<any>({ stars: [], animationId: 0, targetZ: 320, smoothZ: 320 });

  // WebGL scene
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    const r = refs.current;
    const isMobile = window.innerWidth < 768;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05050a, 0.00035);
    r.scene = scene;

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 8, 320);
    r.camera = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current!, antialias: !isMobile, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.7;
    r.renderer = renderer;

    // Bloom (skip on mobile for performance)
    let composer: any = null;
    if (!isMobile) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.5, 0.85));
      r.composer = composer;
    }

    // Starfield (three depth layers)
    const starCount = isMobile ? 1400 : 4200;
    for (let layer = 0; layer < 3; layer++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(starCount * 3);
      const col = new Float32Array(starCount * 3);
      const siz = new Float32Array(starCount);
      for (let j = 0; j < starCount; j++) {
        const radius = 200 + Math.random() * 900;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        pos[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
        pos[j * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        pos[j * 3 + 2] = radius * Math.cos(phi);
        const c = new THREE.Color();
        const pick = Math.random();
        if (pick < 0.72) c.setHSL(0, 0, 0.75 + Math.random() * 0.25);
        else if (pick < 0.9) c.setHSL(0.06, 0.7, 0.7); // warm
        else c.setHSL(0.66, 0.6, 0.75); // indigo
        col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b;
        siz[j] = Math.random() * 2 + 0.5;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(siz, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, depth: { value: layer } },
        vertexShader: `
          attribute float size; attribute vec3 color; varying vec3 vColor;
          uniform float time; uniform float depth;
          void main(){ vColor=color; vec3 p=position;
            float a=time*0.04*(1.0-depth*0.3);
            mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a)); p.xy=rot*p.xy;
            vec4 mv=modelViewMatrix*vec4(p,1.0);
            gl_PointSize=size*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `
          varying vec3 vColor;
          void main(){ float d=length(gl_PointCoord-vec2(0.5)); if(d>0.5) discard;
            float o=1.0-smoothstep(0.0,0.5,d); gl_FragColor=vec4(vColor,o); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const stars = new THREE.Points(geo, mat);
      scene.add(stars);
      r.stars.push(stars);
    }

    // Nebula plane (Astra colors: indigo + warm)
    const nebGeo = new THREE.PlaneGeometry(6000, 3500, 60, 60);
    const nebMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        c1: { value: new THREE.Color(0x3a2bff) },
        c2: { value: new THREE.Color(0xe8663d) },
        opacity: { value: 0.28 },
      },
      vertexShader: `varying vec2 vUv; varying float vE; uniform float time;
        void main(){ vUv=uv; vec3 p=position;
          float e=sin(p.x*0.01+time)*cos(p.y*0.01+time)*18.0; p.z+=e; vE=e;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform vec3 c1; uniform vec3 c2; uniform float opacity; uniform float time;
        varying vec2 vUv; varying float vE;
        void main(){ float m=sin(vUv.x*9.0+time)*cos(vUv.y*9.0+time);
          vec3 col=mix(c1,c2,m*0.5+0.5);
          float a=opacity*(1.0-length(vUv-0.5)*2.0); a*=1.0+vE*0.01;
          gl_FragColor=vec4(col,max(a,0.0)); }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const nebula = new THREE.Mesh(nebGeo, nebMat);
    nebula.position.z = -900;
    scene.add(nebula);
    r.nebula = nebula;

    // Glowing focal orb (a distant sun)
    const orbMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; uniform float time;
        void main(){ float i=pow(0.72-dot(vN,vec3(0.0,0.0,1.0)),2.0);
          vec3 glow=vec3(1.0,0.5,0.28)*i; float p=sin(time*1.5)*0.1+0.9; glow*=p;
          gl_FragColor=vec4(glow,i*0.5); }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 32), orbMat);
    orb.position.set(120, 40, -260);
    scene.add(orb);
    r.orb = orb;

    // Parallax mountain / hill silhouettes forming a horizon
    r.mountains = [];
    const mLayers = [
      { z: -30, h: 70, color: 0x0b0b16, op: 1 },
      { z: -80, h: 95, color: 0x141029, op: 0.9 },
      { z: -140, h: 125, color: 0x1d1636, op: 0.7 },
    ];
    mLayers.forEach((L, idx) => {
      const pts: THREE.Vector2[] = [];
      const seg = 64;
      for (let i = 0; i <= seg; i++) {
        const x = (i / seg - 0.5) * 1500;
        const y =
          Math.sin(i * 0.35 + idx * 1.3) * L.h * 0.45 +
          Math.sin(i * 0.12) * L.h +
          Math.random() * L.h * 0.15 - 205;
        pts.push(new THREE.Vector2(x, y));
      }
      pts.push(new THREE.Vector2(3000, -700));
      pts.push(new THREE.Vector2(-3000, -700));
      const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
      const mat = new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: L.op, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.z = L.z;
      scene.add(m);
      r.mountains.push(m);
    });

    const clock = new THREE.Clock();
    const animate = () => {
      r.animationId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      r.stars.forEach((s: any) => (s.material.uniforms.time.value = t));
      nebMat.uniforms.time.value = t * 0.5;
      orbMat.uniforms.time.value = t;
      r.mountains.forEach((m: any, i: number) => { m.position.x = Math.sin(t * 0.08) * 3 * (1 + i * 0.4); });
      // smooth fly-through on scroll + gentle drift
      r.smoothZ += (r.targetZ - r.smoothZ) * 0.05;
      camera.position.z = r.smoothZ;
      camera.position.x = Math.sin(t * 0.1) * 6;
      camera.position.y = 8 + Math.cos(t * 0.13) * 3;
      camera.lookAt(0, 6, -400);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    };
    animate();
    // Fade the canvas in once the first frames are drawn (no pop-in).
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));

    // GSAP intro
    if (heroTitleRef.current) {
      const chars = heroTitleRef.current.querySelectorAll(".ch");
      gsap.set(heroTitleRef.current, { visibility: "visible" });
      gsap.from(chars, { y: 140, opacity: 0, duration: 1.2, stagger: 0.05, ease: "power4.out" });
    }
    if (heroSubRef.current) {
      gsap.from(heroSubRef.current, { y: 40, opacity: 0, duration: 1, delay: 0.5, ease: "power3.out" });
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer?.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(r.animationId);
      window.removeEventListener("resize", onResize);
      r.stars.forEach((s: any) => { s.geometry.dispose(); s.material.dispose(); });
      r.mountains.forEach((m: any) => { m.geometry.dispose(); m.material.dispose(); });
      nebGeo.dispose(); nebMat.dispose(); orb.geometry.dispose(); orbMat.dispose();
      renderer.dispose();
    };
  }, []);

  // Scroll → camera target + progress
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      // fly from z=320 (near) to z=-520 (deep) as you scroll
      refs.current.targetZ = 320 - p * 840;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const split = (s: string) => s.split("").map((ch, i) => <span key={i} className="ch inline-block">{ch === " " ? " " : ch}</span>);

  return (
    <div className="relative">
      {/* Real photo background (no dark overlay) */}
      <div aria-hidden className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/planet-sun.jpg)" }} />
      {/* Fixed 3D starfield overlay (transparent; falls back to a glow for reduced motion) */}
      {reduced ? (
        <div aria-hidden className="fixed inset-0 -z-10"
          style={{ background: "radial-gradient(60% 50% at 60% 40%, rgba(232,102,61,0.18), rgba(58,43,255,0.10) 45%, transparent 75%)" }} />
      ) : (
        <canvas ref={canvasRef} className={`fixed inset-0 -z-10 h-full w-full transition-opacity duration-1000 ${shown ? "opacity-100" : "opacity-0"}`} />
      )}

      {/* Single hero section */}
      {SECTIONS.slice(0, 1).map((s, i) => (
        <section key={i} className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-muted">{s.eyebrow}</p>
          {i === 0 ? (
            <h1 ref={heroTitleRef} style={{ visibility: "hidden" }}
              className="max-w-full break-words text-5xl font-bold leading-none tracking-tight sm:text-8xl md:text-9xl">{split(s.title)}</h1>
          ) : (
            <h2 className="max-w-full animate-fade-up break-words text-4xl font-bold leading-none tracking-tight sm:text-7xl">{s.title}</h2>
          )}
          <div ref={i === 0 ? heroSubRef : undefined} className="mt-6 max-w-2xl space-y-1 text-base text-muted sm:text-lg">
            {s.lines.map((l, k) => <p key={k}>{l}</p>)}
          </div>
          {s.cta && (
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href={s.cta.primary.href} className="rounded-lg bg-fg px-6 py-3 font-medium text-bg transition-transform hover:scale-[1.03]">
                {s.cta.primary.label}
              </Link>
              {s.cta.secondary && (
                <Link href={s.cta.secondary.href} className="rounded-lg border border-white/25 px-6 py-3 transition-colors hover:bg-white/5">
                  {s.cta.secondary.label}
                </Link>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
