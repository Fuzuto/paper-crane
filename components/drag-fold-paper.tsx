"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { animate, motion, useMotionValue, useTransform, type MotionStyle } from "motion/react";
import { FOLD_GESTURES, sampleFoldGesture, type FoldPoint } from "@/lib/fold-gestures";
import { useReducedMotionPreference } from "@/lib/motion-preference";

const shapes = [
  "M90 90 L310 90 L310 310 L90 310 Z",
  "M90 90 L310 310 L90 310 Z",
  "M90 90 L310 90 L310 310 L90 310 Z",
  "M90 145 L310 145 L310 255 L90 255 Z",
  "M200 70 L325 200 L200 330 L75 200 Z",
  "M200 70 L270 210 L200 330 L130 210 Z",
  "M200 45 L270 200 L200 355 L130 200 Z",
  "M200 45 L250 200 L200 355 L150 200 Z",
  "M200 45 L245 195 L225 355 L200 270 L175 355 L155 195 Z",
  "M200 100 L335 85 L245 205 L200 265 L90 95 L165 185 Z",
  "M80 155 L110 75 L135 105 L170 205 L200 240 L335 85 L245 240 L200 280 Z",
  "M55 130 L170 195 L110 75 L140 105 L200 215 L335 85 L265 205 L355 150 L230 285 L170 260 Z",
];
const pathFor = (points: readonly FoldPoint[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(" ") + " Z";
type Feedback = "idle" | "dragging" | "ready" | "returning";

export default function DragFoldPaper({ step, color, pattern, disabled, onFold }: {
  step: number; color: string; pattern: string; disabled: boolean; onFold: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const gesture = FOLD_GESTURES[step];
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<{ id: number; origin: FoldPoint; current: FoldPoint } | null>(null);
  const ready = useRef(false);
  const committed = useRef(false);
  const feedbackRef = useRef<Feedback>("idle");
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [keyboardMessage, setKeyboardMessage] = useState("");
  const progress = useMotionValue(0);
  const reduce = useReducedMotionPreference();

  // Rotate the selected flap about its crease. The projected corner tracks the drag;
  // the raised paper adds depth, while every point on the hinge remains fixed.
  function project(point: FoldPoint, value: number): FoldPoint {
    const [a, b] = gesture.crease;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
    const hinge = { x: a.x + t * dx, y: a.y + t * dy };
    const cosine = 1 - 2 * value;
    const height = Math.hypot(point.x - hinge.x, point.y - hinge.y) * Math.sqrt(Math.max(0, 1 - cosine * cosine));
    return { x: hinge.x + (point.x - hinge.x) * cosine, y: hinge.y + (point.y - hinge.y) * cosine - height * .12 };
  }
  const flapPath = useTransform(progress, (value) => pathFor(gesture.flap.map((point) => project(point, value))));
  const handleLeft = useTransform(progress, (value) => `${project(gesture.start, value).x / 4}%`);
  const handleTop = useTransform(progress, (value) => `${project(gesture.start, value).y / 4}%`);
  const flapShine = useTransform(progress, [0, .5, 1], [.04, .25, .13]);
  const fill = pattern === "plain" ? undefined : `url(#${id}-${pattern})`;

  function setFeedbackOnce(next: Feedback) {
    if (feedbackRef.current === next) return;
    feedbackRef.current = next;
    setFeedback(next);
  }
  function returnPaper(message = "") {
    ready.current = false;
    pointer.current = null;
    setFeedbackOnce("returning");
    setKeyboardMessage(message);
    progress.stop();
    if (reduce) { progress.set(0); setFeedbackOnce("idle"); }
    else animate(progress, 0, { duration: .35, ease: [.2, .8, .2, 1], onComplete: () => setFeedbackOnce("idle") });
  }

  useEffect(() => {
    progress.stop(); progress.set(0); ready.current = false; committed.current = false; pointer.current = null;
    feedbackRef.current = "idle"; setFeedback("idle"); setKeyboardMessage("");
  }, [step, progress]);
  useEffect(() => progress.on("change", (value) => {
    if (stage.current) stage.current.dataset.progress = value.toFixed(4);
  }), [progress]);
  useEffect(() => {
    const cancel = () => { if (pointer.current && !committed.current) returnPaper("Fold paused. Grab the corner to try again."); };
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); progress.stop(); };
    // The listener uses the current gesture only to reset, never to commit a fold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, reduce]);

  function paperPoint(event: PointerEvent<HTMLButtonElement>): FoldPoint {
    const matrix = svg.current?.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    }
    const rect = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 400, y: (event.clientY - rect.top) / rect.height * 400 };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId || disabled || committed.current) return;
    const point = paperPoint(event);
    active.current = { x: gesture.start.x + point.x - active.origin.x, y: gesture.start.y + point.y - active.origin.y };
    const sample = sampleFoldGesture(gesture, active.current);
    progress.set(sample.progress); ready.current = sample.canCommit;
    setFeedbackOnce(sample.canCommit ? "ready" : "dragging");
  }
  function commit() {
    if (disabled || committed.current || !ready.current) return;
    committed.current = true; pointer.current = null;
    progress.stop();
    animate(progress, 1, { duration: reduce ? 0 : .16 });
    setKeyboardMessage("Crease made."); onFold();
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || pointer.current || committed.current) return;
    let value = progress.get();
    if (["ArrowRight", "ArrowUp"].includes(event.key)) value += .1;
    else if (["ArrowLeft", "ArrowDown"].includes(event.key)) value -= .1;
    else if (event.key === "End") value = 1;
    else if (["Home", "Escape"].includes(event.key)) { event.preventDefault(); returnPaper("Corner returned. Use the arrow keys to move it."); return; }
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (ready.current) commit();
      else setKeyboardMessage("Move the corner to the ring with the arrow keys before pressing Enter.");
      return;
    } else return;
    event.preventDefault(); progress.stop(); value = Math.max(0, Math.min(1, value)); progress.set(value);
    ready.current = value >= .999; setFeedbackOnce(ready.current ? "ready" : "dragging");
    setKeyboardMessage(ready.current ? "Corner at the ring. Press Enter to crease." : `Corner at ${Math.round(value * 100)} percent. Continue toward the ring.`);
  }

  return <div ref={stage} className="drag-fold-stage" data-step={step} data-progress="0">
    <div className="paper-viewport">
      <svg ref={svg} className="drag-fold-paper" viewBox="0 0 400 400" role="img" aria-label={`Your paper, fold ${step + 1} of 12`}>
        <defs>
          <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity=".84" /></linearGradient>
          <pattern id={`${id}-speckled`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="5" cy="7" r="1" fill="#fff" opacity=".6" /><circle cx="19" cy="19" r=".6" fill="#fff" opacity=".5" /></pattern>
          <pattern id={`${id}-seigaiha`} width="28" height="18" patternUnits="userSpaceOnUse"><path d="M0 18a14 14 0 0 1 28 0M4 18a10 10 0 0 1 20 0M8 18a6 6 0 0 1 12 0" fill="none" stroke="#fff" strokeWidth=".8" opacity=".45" /></pattern>
          <mask id={`${id}-base`}><rect width="400" height="400" fill="white" /><path d={pathFor(gesture.flap)} fill="black" /></mask>
          <clipPath id={`${id}-outline`}><path d={shapes[step]} /></clipPath>
          <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#847b6e" floodOpacity=".17" /></filter>
          <filter id={`${id}-flap-shadow`} x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#71614f" floodOpacity=".2" /></filter>
        </defs>
        <g filter={`url(#${id}-shadow)`}>
          <g mask={`url(#${id}-base)`}>
            <path d={shapes[step]} fill={`url(#${id}-paper)`} stroke={color} strokeWidth=".8" />
            {fill && <path d={shapes[step]} fill={fill} />}
            {step >= 4 && <path d="M200 45 L200 355 L130 200 Z" fill="#fff" opacity=".16" clipPath={`url(#${id}-outline)`} />}
          </g>
        </g>
        <motion.path d={flapPath} fill={`url(#${id}-paper)`} stroke={color} strokeWidth=".8" filter={`url(#${id}-flap-shadow)`} />
        {fill && <motion.path d={flapPath} fill={fill} />}
        <motion.path d={flapPath} fill="#fff" style={{ opacity: flapShine }} />
        <path d={`M${gesture.crease[0].x} ${gesture.crease[0].y} L${gesture.crease[1].x} ${gesture.crease[1].y}`} stroke="#66544d" strokeWidth="1" strokeDasharray="4 5" opacity=".3" />
        <path className="fold-drag-thread" d={`M${gesture.start.x} ${gesture.start.y} Q${(gesture.start.x + gesture.target.x) / 2 + 18} ${(gesture.start.y + gesture.target.y) / 2 - 20} ${gesture.target.x} ${gesture.target.y}`} fill="none" stroke="#786555" strokeDasharray="2 7" strokeWidth="1.2" opacity=".3" />
        <circle className={feedback === "ready" ? "fold-target is-ready" : "fold-target"} cx={gesture.target.x} cy={gesture.target.y} r="13" fill="#f7f5ef" fillOpacity=".72" stroke="#827364" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={gesture.target.x} cy={gesture.target.y} r="3" fill="#827364" />
      </svg>
      <motion.button type="button" className={`fold-grab-handle${pointer.current ? " is-grabbing" : ""}`} style={{ left: handleLeft, top: handleTop, "--fold-color": color } as MotionStyle}
        aria-label={`Grab paper corner for fold ${step + 1}`} aria-disabled={disabled} aria-describedby={`${id}-help`} aria-keyshortcuts="ArrowRight ArrowUp ArrowLeft ArrowDown Home End Enter Escape"
        data-start-x={gesture.start.x} data-start-y={gesture.start.y} data-target-x={gesture.target.x} data-target-y={gesture.target.y}
        onPointerDown={(event) => {
          if (disabled || committed.current || !event.isPrimary || event.button !== 0) return;
          event.preventDefault(); progress.stop(); progress.set(0); ready.current = false;
          pointer.current = { id: event.pointerId, origin: paperPoint(event), current: gesture.start };
          event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
          setKeyboardMessage(""); setFeedbackOnce("dragging");
        }} onPointerMove={move}
        onPointerUp={(event) => {
          if (pointer.current?.id !== event.pointerId) return;
          move(event); if (ready.current) commit(); else returnPaper("Bring the corner to the ring, then release.");
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }} onPointerCancel={() => { if (pointer.current) returnPaper("Fold paused. Grab the corner to try again."); }}
        onLostPointerCapture={() => { if (pointer.current && !committed.current) returnPaper(); }}
        onKeyDown={keyDown} onBlur={() => { if (!pointer.current && !committed.current && progress.get() > 0) returnPaper(); }}>
        <span className="fold-grab-dot" aria-hidden="true" />
      </motion.button>
    </div>
    <p className="sr-only" id={`${id}-help`}>Drag this corner to the dotted ring, then release. With a keyboard, use the arrow keys to move along the fold, Enter to crease at the ring, and Escape to return.</p>
    <p className="sr-only" role="status" aria-live="polite">{keyboardMessage || (feedback === "ready" ? "Corner at the ring. Release to crease." : "")}</p>
  </div>;
}
