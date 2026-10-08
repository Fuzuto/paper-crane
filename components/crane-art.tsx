"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useReducedMotionPreference as useReducedMotion } from "@/lib/motion-preference";

const Crane3D = dynamic(() => import("./crane-3d").then((module) => module.Crane3D), {
  ssr: false,
  loading: () => null,
});

export type CraneArtProps = {
  color?: string;
  pattern?: string;
  interactive?: boolean;
  className?: string;
  small?: boolean;
};

// Every surface corresponds to a crease in the same hand-shaped model used by
// the 3D view. This keeps the accessible fallback and collection thumbnails true
// to the paper selected in the folding studio.
const surfaces = [
  { points: "326,72 349,323 402,269", shade: "light" },
  { points: "326,72 402,269 423,316", shade: "medium" },
  { points: "349,323 402,269 423,316", shade: "dark" },
  { points: "414,307 635,377 446,332", shade: "light" },
  { points: "414,307 635,377 455,305", shade: "medium" },
  { points: "319,321 222,255 185,215 196,262 333,352", shade: "medium" },
  { points: "319,321 185,215 209,260 352,338", shade: "light" },
  { points: "185,215 169,244 113,281 196,262", shade: "dark" },
  { points: "185,215 113,281 169,244", shade: "light" },
  { points: "319,321 381,296 446,332 388,386", shade: "medium" },
  { points: "319,321 388,386 354,337", shade: "dark" },
  { points: "381,296 388,386 446,332", shade: "light" },
  { points: "625,114 389,274 405,341", shade: "light" },
  { points: "625,114 453,212 405,341", shade: "medium" },
  { points: "625,114 405,341 473,322", shade: "dark" },
] as const;

class ArtworkBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function CraneArt({ color = "#d998a1", pattern = "plain", interactive = false, className = "", small = false }: CraneArtProps) {
  const id = useId().replaceAll(":", "");
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [allow3D, setAllow3D] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (small) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType ?? "")) return;
    // The paper silhouette stays immediate on phones; pointer-driven 3D is
    // reserved for larger displays where its depth adds to the experience.
    const compact = window.matchMedia("(max-width: 700px)");
    let idle: number | undefined;
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (compact.matches) { setAllow3D(false); setReady(false); return; }
      timer = window.setTimeout(() => {
        if ("requestIdleCallback" in window) idle = window.requestIdleCallback(() => setAllow3D(true), { timeout: 1500 });
        else setAllow3D(true);
      }, 600);
    };
    update(); compact.addEventListener("change", update);
    return () => { compact.removeEventListener("change", update); window.clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback(idle); };
  }, [small]);

  useEffect(() => {
    if (small || !host.current) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (!entry.isIntersecting) setReady(false);
    }, { rootMargin: "100px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [small]);

  const failure = useCallback(() => { setFailed(true); setReady(false); }, []);
  const artworkReady = useCallback(() => setReady(true), []);
  const gradient = `${id}-paper`;
  const clip = `${id}-silhouette`;
  const texture = `${id}-texture`;
  const waves = `${id}-waves`;
  const speckles = `${id}-speckles`;

  return (
    <div ref={host} className={className} role="img" aria-label={`${pattern === "plain" ? "" : `${pattern} paper `}origami crane${interactive && allow3D ? ", gently turns as you move your pointer" : ""}`} style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, isolation: "isolate" }}>
      <svg viewBox="80 36 600 425" aria-hidden="true" style={{ width: "100%", height: "100%", display: "block", overflow: "visible", position: "absolute", inset: 0, pointerEvents: "none" }}>
        <defs>
          <radialGradient id={`${id}-shadow`}><stop stopColor="#4e3c35" stopOpacity=".10" /><stop offset="1" stopColor="#4e3c35" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="394" cy="417" rx="166" ry="26" fill={`url(#${id}-shadow)`} />
      </svg>
      <svg viewBox="80 36 600 425" aria-hidden="true" style={{ width: "100%", height: "100%", display: "block", overflow: "visible", position: "absolute", inset: 0, opacity: ready && visible && !failed && !small ? 0 : 1, transition: reducedMotion ? "none" : "opacity 500ms ease", pointerEvents: "none" }}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={color} /><stop offset="1" stopColor={color} /></linearGradient>
          <clipPath id={clip}>{surfaces.map((surface, index) => <polygon key={index} points={surface.points} />)}</clipPath>
          <filter id={texture} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
          <pattern id={waves} x="0" y="0" width="38" height="24" patternUnits="userSpaceOnUse"><g fill="none" stroke="#fffdf8" strokeWidth=".8" opacity=".38"><path d="M-19 24a19 19 0 0 1 38 0M-14 24a14 14 0 0 1 28 0M-9 24a9 9 0 0 1 18 0M19 24a19 19 0 0 1 38 0M24 24a14 14 0 0 1 28 0M29 24a9 9 0 0 1 18 0M0 0a19 19 0 0 1 38 0M5 0a14 14 0 0 1 28 0M10 0a9 9 0 0 1 18 0" /></g></pattern>
          <pattern id={speckles} x="0" y="0" width="31" height="29" patternUnits="userSpaceOnUse"><g fill="#fff8e8" opacity=".55"><circle cx="4" cy="8" r="1" /><circle cx="24" cy="18" r=".7" /><circle cx="14" cy="26" r=".45" /></g><path d="M18 6l2 1M6 20l1 2" stroke="#714d43" strokeWidth=".7" opacity=".2" /></pattern>
        </defs>
        <g>
          {surfaces.map((surface, index) => (
            <g key={index}>
              <polygon points={surface.points} fill={`url(#${gradient})`} />
              <polygon points={surface.points} fill={surface.shade === "light" ? "#fff8ed" : "#5c3440"} opacity={surface.shade === "light" ? .22 : surface.shade === "dark" ? .2 : .055} />
            </g>
          ))}
          <g clipPath={`url(#${clip})`}>
            {pattern !== "plain" && <rect x="90" y="50" width="570" height="360" fill={`url(#${pattern === "seigaiha" ? waves : speckles})`} />}
            <rect x="90" y="50" width="570" height="360" filter={`url(#${texture})`} opacity=".035" style={{ mixBlendMode: "multiply" }} />
          </g>
          <g fill="none" stroke="#fffaf3" strokeWidth=".8" opacity=".3" strokeLinejoin="round"><path d="M326 72l76 197 21 47M625 114L405 341M185 215l134 106 69 65M414 307l221 70" /></g>
          <g fill="none" stroke="#6e4149" strokeWidth=".65" opacity=".14"><path d="M453 212L405 341M349 323l53-54M319 321l62-25M388 386l58-54" /></g>
        </g>
      </svg>
      {!small && allow3D && visible && !failed && (
        <ArtworkBoundary onError={failure}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, transition: reducedMotion ? "none" : "opacity 600ms ease" }}>
            <Crane3D color={color} pattern={pattern} interactive={interactive} reducedMotion={Boolean(reducedMotion)} onReady={artworkReady} onError={failure} />
          </div>
        </ArtworkBoundary>
      )}
    </div>
  );
}

export default CraneArt;


