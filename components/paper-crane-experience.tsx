"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useReducedMotionPreference as useReducedMotion } from "@/lib/motion-preference";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, DownloadSimple, Heart, Leaf, LockSimple, SpeakerHigh, SpeakerSlash, Stack, Trash, X, ArrowCounterClockwise, GlobeHemisphereWest, Sparkle } from "@phosphor-icons/react";
import CraneArt from "./crane-art";
import CraneNoteEditor from "./crane-note-editor";
import DragFoldPaper from "./drag-fold-paper";
import { CRANE_STORAGE_KEY, PAPER_COLORS, PAPER_PATTERNS, loadCranes, saveCrane, deleteCrane, type Crane, type PaperColor, type PaperPattern } from "@/lib/cranes";
import { createFoldingState, FOLD_STEPS, foldingReducer } from "@/lib/folding";
import { FOLD_GESTURES } from "@/lib/fold-gestures";

type View = "home" | "studio" | "collection";
const paperHex = (color: PaperColor) => PAPER_COLORS.find((p) => p.id === color)!.hex;
const dateLabel = (date: string) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const milestones = [{ at: 1, name: "A beginning", note: "One wish, given wings." }, { at: 10, name: "A small flock", note: "Ten little moments of care." }, { at: 100, name: "A sky of hope", note: "A hundred wishes taking flight." }, { at: 1000, name: "Senbazuru", note: "A thousand cranes, a tradition carried forward." }];

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .7 }}>{children}</motion.div>;
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    d?.showModal();
    return () => { d?.close(); const target = opener?.isConnected ? opener : document.getElementById("main-content"); target?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="detail-dialog" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="dialog-title"><div className="dialog-content"><button className="icon-button dialog-close" aria-label="Close crane details" onClick={onClose}><X size={20} /></button><h2 id="dialog-title" className="sr-only">{title}</h2>{children}</div></dialog>;
}

export default function PaperCraneExperience() {
  const [view, setView] = useState<View>("home");
  const [folding, dispatchFold] = useReducer(foldingReducer, undefined, createFoldingState);
  const { phase, color, pattern, completedSteps: step } = folding;
  const [settling, setSettling] = useState(false);
  const [cranes, setCranes] = useState<Crane[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [navigationRequest, setNavigationRequest] = useState(0);
  const [name, setName] = useState("");
  const [wish, setWish] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [selected, setSelected] = useState<Crane | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [filter, setFilter] = useState<"all" | "private" | "public">("all");
  const [sort, setSort] = useState("newest");
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingId = useRef("");
  const main = useRef<HTMLElement>(null);
  const wishName = useRef<HTMLInputElement>(null);
  const foldTitle = useRef<HTMLHeadingElement>(null);
  const completionTitle = useRef<HTMLHeadingElement>(null);
  const keepCraneButton = useRef<HTMLButtonElement>(null);
  const editNoteButton = useRef<HTMLButtonElement>(null);
  const pendingNavigation = useRef<{ view: View; anchor?: string } | null>(null);
  const reduce = useReducedMotion();
  const count = cranes.length;
  const nextMilestone = milestones.find((m) => m.at > count);

  const refreshCollection = useCallback(() => {
    try { setCranes(loadCranes()); setCollectionError(""); setError(""); }
    catch (e) { const message = e instanceof Error ? e.message : "Your collection could not be opened."; setCollectionError(message); setError(message); }
    setLoaded(true);
  }, []);

  const focusStudioPhase = useCallback(() => {
    const target = phase === "wish" ? wishName.current : phase === "complete" ? completionTitle.current : phase === "folding" ? foldTitle.current : main.current;
    target?.focus({ preventScroll: true });
  }, [phase]);

  const applyPendingNavigation = useCallback(() => {
    const pending = pendingNavigation.current;
    if (!pending || !document.getElementById("view-" + pending.view)) return;
    const anchor = pending.anchor ? document.getElementById(pending.anchor) : null;
    if (pending.anchor && !anchor) return;
    pendingNavigation.current = null;
    if (anchor) { anchor.scrollIntoView({ behavior: reduce ? "instant" : "smooth" }); anchor.focus({ preventScroll: true }); }
    else { window.scrollTo({ top: 0, behavior: "instant" }); if (pending.view === "studio") focusStudioPhase(); else main.current?.focus({ preventScroll: true }); }
  }, [focusStudioPhase, reduce]);

  const viewMounted = useCallback((node: HTMLDivElement | null) => {
    if (node) applyPendingNavigation();
  }, [applyPendingNavigation]);

  useEffect(() => {
    const frame = requestAnimationFrame(applyPendingNavigation);
    return () => cancelAnimationFrame(frame);
  }, [view, navigationRequest, applyPendingNavigation]);

  useEffect(() => {
    if (view !== "studio") return;
    const frame = requestAnimationFrame(() => { if (document.getElementById("view-studio")) focusStudioPhase(); });
    return () => cancelAnimationFrame(frame);
  }, [view, phase, focusStudioPhase]);

  useEffect(() => { if (removeConfirm) keepCraneButton.current?.focus(); }, [removeConfirm]);

  useEffect(() => {
    const readView = () => {
      const hash = window.location.hash;
      const next: View = hash === "#collection" ? "collection" : hash === "#studio" ? "studio" : "home";
      setView(next); setSelected(null); setEditingNote(false); setRemoveConfirm(false); setDetailError("");
      pendingNavigation.current = { view: next, anchor: next === "home" && hash ? hash.slice(1) : undefined };
      setNavigationRequest((request) => request + 1);
    };
    refreshCollection();
    if (window.location.hash) readView();
    const onStorage = (e: StorageEvent) => { if (e.key === CRANE_STORAGE_KEY || e.key === null) refreshCollection(); };
    window.addEventListener("storage", onStorage); window.addEventListener("popstate", readView); window.addEventListener("hashchange", readView);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("popstate", readView); window.removeEventListener("hashchange", readView); if (timer.current) clearTimeout(timer.current); audio.current?.close(); };
  }, [refreshCollection]);

  function navigate(next: View, anchor?: string) {
    pendingNavigation.current = { view: next, anchor };
    setView(next); setSelected(null); setEditingNote(false); setRemoveConfirm(false); setDetailError("");
    setNavigationRequest((request) => request + 1);
    window.history.pushState({}, "", next === "home" ? anchor ? `#${anchor}` : window.location.pathname + window.location.search : `#${next}`);
  }
  function startFresh(newColor?: PaperColor) { if (timer.current) clearTimeout(timer.current); setSettling(false); dispatchFold({ type: "restart" }); setName(""); setWish(""); setVisibility("private"); pendingId.current = ""; if (newColor) dispatchFold({ type: "choose-paper", color: newColor, pattern }); navigate("studio"); }
  function fold() {
    if (settling || phase !== "folding") return;
    setSettling(true); dispatchFold({ type: "preview", progress: 1 });
    timer.current = setTimeout(() => { dispatchFold({ type: "commit-fold" }); setSettling(false); timer.current = null; }, reduce ? 80 : 700);
  }
  function undo() { if (timer.current) clearTimeout(timer.current); setSettling(false); dispatchFold({ type: "undo" }); }
  function save(e: FormEvent) {
    e.preventDefault();
    keepCrane();
  }
  function keepCrane() {
    if (phase !== "wish") return;
    if (!pendingId.current) pendingId.current = crypto.randomUUID();
    const savedName = name.trim() || `${PAPER_COLORS.find((paper) => paper.id === color)!.name} crane`;
    const crane: Crane = { id: pendingId.current, name: savedName, wish: wish.trim(), color, pattern, visibility, createdAt: new Date().toISOString(), folds: 12 };
    try { setCranes(saveCrane(crane)); setName(savedName); setLoaded(true); setCollectionError(""); setError(""); dispatchFold({ type: "finish" }); } catch (e) { setError(e instanceof Error ? e.message : "Your crane could not be saved. Please try again."); }
  }
  function saveNote(updated: Crane) {
    try {
      setCranes(saveCrane(updated)); setSelected(updated); setEditingNote(false); setDetailError(""); setCollectionError(""); setError("");
      requestAnimationFrame(() => editNoteButton.current?.focus({ preventScroll: true }));
    } catch (e) { setDetailError(e instanceof Error ? e.message : "Your changes could not be saved. Please try again."); }
  }
  function cancelNote() {
    setEditingNote(false); setDetailError("");
    requestAnimationFrame(() => editNoteButton.current?.focus({ preventScroll: true }));
  }
  function remove() {
    if (!selected) return;
    try { setCranes(deleteCrane(selected.id)); setSelected(null); setEditingNote(false); setRemoveConfirm(false); setDetailError(""); setError(""); requestAnimationFrame(() => main.current?.focus({ preventScroll: true })); } catch (e) { setDetailError(e instanceof Error ? e.message : "This crane could not be removed."); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ version: 1, cranes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "paper-crane-collection.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function toggleSound() {
    if (sound) { await audio.current?.close(); audio.current = null; setSound(false); return; }
    try {
      const context = new AudioContext(); audio.current = context;
      const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const data = buffer.getChannelData(0); let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = last * 3.5; }
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filterNode = context.createBiquadFilter(); filterNode.type = "lowpass"; filterNode.frequency.value = 600;
      const gain = context.createGain(); gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(.16, context.currentTime + 1);
      source.connect(filterNode).connect(gain).connect(context.destination); source.start(); await context.resume(); setSound(true);
    } catch { await audio.current?.close().catch(() => {}); audio.current = null; setSound(false); setError("Ambient sound is unavailable in this browser. You can still enjoy folding."); }
  }
  const visibleCranes = useMemo(() => cranes.filter((c) => filter === "all" || c.visibility === filter).sort((a,b) => sort === "newest" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(a.createdAt) - Date.parse(b.createdAt)), [cranes,filter,sort]);

  return <MotionConfig reducedMotion="user"><div className="site-shell">
    <header className="site-header"><div className="header-inner"><button className="brand" aria-label="Paper Crane home" onClick={() => navigate("home")}><span className="brand-mark"><CraneArt small color="#b44f40" /></span><span>paper crane<span className="brand-japanese" lang="ja">紙鶴</span></span></button><nav aria-label="Main navigation"><button className={view === "home" ? "nav-link active" : "nav-link"} onClick={() => navigate("home", "how-it-works")}>The experience</button><button className="nav-link" onClick={() => navigate("home", "journey")}>1,000 cranes</button><button className={view === "collection" ? "nav-link active" : "nav-link"} onClick={() => navigate("collection")}>My collection{count > 0 && <span className="nav-count">{count}</span>}</button></nav><button className="button header-cta" onClick={() => phase === "complete" ? startFresh() : navigate("studio")}>{phase === "folding" || phase === "wish" ? "Continue folding" : "Start folding"}<ArrowUpRight size={16} /></button></div></header>
    <main id="main-content" ref={main} tabIndex={-1}>
      {error && <div className="error-banner" role="alert"><p>{error}</p><button className="icon-button" aria-label="Dismiss message" onClick={() => setError("")}><X size={18} /></button></div>}
      <AnimatePresence mode="wait">
      {view === "home" && <motion.div key="home" id="view-home" ref={viewMounted} onAnimationComplete={applyPendingNavigation} initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
        <section className="hero page-width"><div className="hero-copy"><motion.p className="eyebrow" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }}><span className="red-line" />A small act. A lasting connection.</motion.p><motion.h1 initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8 }}>A thousand folds,<br /><em>a thousand wishes.</em></motion.h1><motion.p className="hero-description" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15, duration: .8 }}>Slow down. Fold a crane. Leave a little hope in the world.</motion.p><motion.div className="hero-actions" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25, duration: .8 }}><button className="button primary" onClick={() => phase === "complete" ? startFresh() : navigate("studio")}>Start folding<ArrowUpRight size={19} /></button><button className="text-button" onClick={() => navigate("home", "tradition")}>Our story<ArrowRight size={17} /></button></motion.div></div><div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-crane"><CraneArt color={paperHex("rose")} interactive /></div><div className="floating-crane floating-one"><CraneArt small color={paperHex("sage")} /></div><div className="floating-crane floating-two"><CraneArt small color={paperHex("ivory")} /></div><span className="art-seal" lang="ja" aria-label="Wish">願</span><div className="art-bottom"><span><span className="live-dot" />Made by you, one fold at a time</span><button className="sound-button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Sound on. Turn off ambient sound" : "Sound off. Turn on ambient sound"}>{sound ? <SpeakerHigh size={17} /> : <SpeakerSlash size={17} />}<span>Sound {sound ? "on" : "off"}</span></button></div></div></section>
        <div className="hero-note page-width"><span>Digitalize traditions. Preserve human connection.</span><span className="note-right"><Heart size={14} /> Made by humans, not generated by AI.</span></div>
        <section id="how-it-works" tabIndex={-1} aria-label="The experience" className="how-section page-width"><Reveal className="how-heading"><h2>A little paper.<br />A little <em>possibility.</em></h2><p>No rush. No perfect way to begin.<br />Just a moment to make something that matters.</p></Reveal><div className="how-steps"><Reveal className="how-step"><span className="step-number">01</span><div className="step-art paper-stack"><i /><i /><i /></div><h3>Choose your paper</h3><p>A color that feels like you.<br />A fresh square of possibility.</p></Reveal><Reveal className="how-step"><span className="step-number">02</span><div className="step-art crease-art"><div /><ArrowDown size={24} weight="thin" /></div><h3>Find your own rhythm</h3><p>Twelve guided folds.<br />A quiet moment with every crease.</p></Reveal><Reveal className="how-step"><span className="step-number">03</span><div className="step-art mini-crane"><CraneArt small color={paperHex("sage")} /></div><h3>Give a wish its wings</h3><p>A thought, a hope, a little kindness.<br />Held in something you made.</p></Reveal></div></section>
        <section id="tradition" tabIndex={-1} aria-label="Our story" className="tradition-section"><div className="page-width tradition-grid"><Reveal className="tradition-art"><span className="tradition-circle" /><div className="tradition-crane"><CraneArt small color={paperHex("sage")} /></div><span className="japanese-poem" lang="ja">ひと折りに、想いを。</span><span className="poem-translation">A little intention in every fold.</span></Reveal><Reveal className="tradition-copy"><p className="eyebrow">An old tradition. A new kind of connection.</p><h2>Some things are worth<br /><em>taking time for.</em></h2><p>For generations, paper cranes have carried wishes for peace, healing, and happiness. A simple piece of paper, transformed by patient hands.</p><p>Paper Crane brings that ritual into a digital world. You make every fold. You write every wish. The meaning comes from you.</p><span className="tradition-signoff">One sheet. Twelve folds. Something of yourself.</span></Reveal></div></section>
        <section id="journey" tabIndex={-1} aria-label="The thousand cranes journey" className="journey-section page-width"><Reveal><div className="journey-top"><span className="journey-symbol" lang="ja">千</span><h2>A thousand cranes.<br /><em>One wish at a time.</em></h2><p>In the tradition of senbazuru, a thousand paper cranes become a symbol of hope.<br />Your journey starts with one. Take all the time you need.</p></div><div className="journey-progress"><div className="journey-count"><strong>{count.toLocaleString()}</strong><span>of 1,000 cranes folded</span></div><div className="progress-track" role="progressbar" aria-label="Thousand cranes journey" aria-valuenow={Math.min(count,1000)} aria-valuemin={0} aria-valuemax={1000}><span style={{ width: `${Math.min(count / 10, 100)}%` }} /></div><div className="milestones">{milestones.map((m) => <div key={m.at} className={count >= m.at ? "milestone reached" : "milestone"}><span className="milestone-dot">{count >= m.at && <Check size={11} />}</span><strong>{m.at.toLocaleString()}</strong><span>{m.name}</span></div>)}</div><p className="journey-message">{count === 0 ? "An empty sky is an invitation." : nextMilestone ? `${nextMilestone.at - count} more ${nextMilestone.at - count === 1 ? "crane" : "cranes"} until “${nextMilestone.name}”. Every fold counts.` : "A thousand moments of care. Your sky is full of hope."}</p></div></Reveal></section>
      </motion.div>}
      {view === "studio" && <motion.div key="studio" id="view-studio" ref={viewMounted} onAnimationComplete={applyPendingNavigation} className="studio page-width" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="studio-topline"><button className="text-button" onClick={() => navigate("home")}><ArrowLeft size={16} />Back to the quiet</button><span>Your folding studio <span className="studio-tiny">/ {phase === "paper" ? "Choose" : phase === "folding" ? "Fold" : phase === "wish" ? "Wish" : "Keep"}</span></span><button className="sound-button" onClick={toggleSound} aria-pressed={sound}>{sound ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}<span>Sound {sound ? "on" : "off"}</span></button></div>
        {phase === "paper" && <div className="studio-grid"><div className={`paper-preview pattern-${pattern}`} style={{ "--paper-color": paperHex(color) } as React.CSSProperties}><div className="preview-grid" /><motion.div className="paper-square" animate={{ backgroundColor: paperHex(color), rotate: -9 }} transition={{ duration: .45 }}><div className={`paper-pattern pattern-${pattern}`} /></motion.div><span className="preview-caption">Your paper. Your possibilities.</span></div><div className="studio-controls"><p className="eyebrow">Before the first fold</p><h1>What color is<br /><em>your wish?</em></h1><p className="studio-description">Choose a piece of paper that speaks to you.<br />There’s no right choice. Only yours.</p><fieldset className="paper-options"><legend>Paper color <span>{PAPER_COLORS.find((p) => p.id === color)?.name}</span></legend><div className="color-options">{PAPER_COLORS.map((p) => <button key={p.id} type="button" className={color === p.id ? "color-option selected" : "color-option"} style={{ backgroundColor: p.hex }} onClick={() => dispatchFold({ type: "choose-paper", color: p.id, pattern })} aria-label={p.name} aria-pressed={color === p.id}>{color === p.id && <Check size={19} />}</button>)}</div></fieldset><fieldset className="paper-options"><legend>Paper pattern</legend><div className="pattern-options">{PAPER_PATTERNS.map((p) => <button key={p.id} className={pattern === p.id ? "pattern-option selected" : "pattern-option"} onClick={() => dispatchFold({ type: "choose-paper", color, pattern: p.id })} aria-pressed={pattern === p.id}><span className={`pattern-sample pattern-${p.id}`} style={{ backgroundColor: paperHex(color) }} />{p.name}</button>)}</div></fieldset><button className="button primary studio-primary" onClick={() => dispatchFold({ type: "start" })}>Begin folding<ArrowRight size={19} /></button><p className="studio-footnote"><Leaf size={14} /> Twelve folds. A few unhurried minutes.</p></div></div>}
        {phase === "folding" && <div className="studio-grid"><div className="fold-stage"><div className="preview-grid" /><DragFoldPaper step={step} color={paperHex(color)} pattern={pattern} disabled={settling} onFold={fold} /><div className="fold-stage-bottom"><span>{PAPER_COLORS.find((p) => p.id === color)?.name} paper</span><span>Guided fold {Math.min(step + 1, 12)} of 12</span></div></div><div className="studio-controls fold-instructions"><p className="eyebrow">Fold {String(Math.min(step + 1, 12)).padStart(2,"0")} / 12</p><div className="fold-dots" role="group" aria-label={`${step} folds completed`}>{FOLD_STEPS.map((_,i) => <span key={i} className={i < step ? "done" : i === step ? "current" : ""} />)}</div><AnimatePresence mode="wait"><motion.div key={step} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} aria-live="polite"><h1 ref={foldTitle} tabIndex={-1}>{FOLD_STEPS[Math.min(step,11)].title}</h1><p className="fold-description">{FOLD_GESTURES[step].prompt}</p></motion.div></AnimatePresence><div className="fold-gesture-guide"><span className="gesture-guide-number">01 — 02 — 03</span><p>Grab the corner. Bring it to the ring.<br />Release to make your crease.</p><details className="keyboard-fold-help"><summary>Folding with a keyboard</summary><p>Focus the marked corner. Use arrow keys to move it toward the ring, then Enter to crease. Escape returns the corner.</p></details></div><p className="fold-hint">{FOLD_STEPS[Math.min(step,11)].hint}</p><div className="fold-secondary"><button className="text-button" onClick={undo} disabled={step === 0 || settling}><ArrowLeft size={16} />Undo fold</button><button className="text-button" onClick={() => { if (timer.current) clearTimeout(timer.current); setSettling(false); dispatchFold({ type: "restart" }); }}><ArrowCounterClockwise size={16} />Start over</button></div></div></div>}
        {phase === "wish" && <div className="studio-grid wish-grid"><div className="wish-preview"><CraneArt color={paperHex(color)} pattern={pattern} interactive /><div className="wish-preview-label"><span className="eyebrow">Made by you</span><h3>{name || "A wish waiting for wings"}</h3>{wish && <p>“{wish}”</p>}</div></div><form className="studio-controls wish-form" onSubmit={save}><p className="eyebrow">Your crane is ready</p><h1>Give your wish<br /><em>its wings.</em></h1><p className="studio-description">A hope for yourself. A thought for someone else.<br />Whatever you carry, there’s room for it here.</p><label className="field-label" htmlFor="crane-name">Name your crane <span>(optional)</span></label><input ref={wishName} id="crane-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="A little hope" autoComplete="off" /><div className="wish-label-row"><label className="field-label" htmlFor="crane-wish">Your wish <span>(optional)</span></label><span>{wish.length}/280</span></div><textarea id="crane-wish" value={wish} onChange={(e) => setWish(e.target.value)} maxLength={280} rows={3} placeholder="I wish for…" /><fieldset className="visibility-options"><legend>Who is this wish for?</legend><label><input type="radio" name="visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} /><LockSimple size={17} /><span>Just me</span></label><label><input type="radio" name="visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} /><GlobeHemisphereWest size={17} /><span>Open to sharing</span></label></fieldset><p className="privacy-note">{visibility === "private" ? "Kept in this browser, just for you." : "Saved in this browser. This choice does not publish your wish; community sharing is coming later."}</p><div className="wish-actions"><button type="submit" className="button primary studio-primary">Keep my crane<Heart size={18} /></button><button type="button" className="button wish-later-button" onClick={keepCrane}>Keep for later<ArrowRight size={17} /></button></div><p className="wish-later-note">You can add a name or wish later from your collection.</p><button type="button" className="text-button wish-undo" onClick={undo}><ArrowLeft size={15} />Return to the last fold</button></form></div>}
        {phase === "complete" && <div className="completion"><div className="completion-art"><CraneArt color={paperHex(color)} pattern={pattern} interactive /></div><span className="completion-check"><Check size={18} /></span><h1 ref={completionTitle} tabIndex={-1}>A little hope,<br /><em>made by you.</em></h1><p>“{name}” is now part of your collection.<br />{count === 1 ? "Your thousand cranes journey has begun." : `${count} cranes. ${count * 12} moments of care.`}</p>{milestones.some((m) => m.at === count) && <div className="milestone-reward"><Sparkle size={16} />{milestones.find((m) => m.at === count)?.note}</div>}<div className="completion-actions"><button className="button primary" onClick={() => navigate("collection")}>My collection<ArrowRight size={18} /></button><button className="text-button" onClick={() => startFresh()}>Fold another<ArrowUpRight size={17} /></button></div></div>}
      </motion.div>}
      {view === "collection" && <motion.div key="collection" id="view-collection" ref={viewMounted} onAnimationComplete={applyPendingNavigation} className="collection page-width" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="collection-heading"><div><p className="eyebrow">Little pieces of you</p><h1>Your sky of <em>wishes.</em></h1><p>Every crane holds a moment. Every wish has a home.</p></div><button className="button primary" onClick={() => startFresh()}>Start folding<ArrowUpRight size={19} /></button></div><div className="collection-stat"><div><strong>{count}</strong><span>{count === 1 ? "crane" : "cranes"} folded</span></div><div><strong>{count * 12}</strong><span>folds made with care</span></div><div className="collection-journey"><span>{Math.min(count / 10, 100).toFixed(1)}% of your thousand cranes journey</span><div className="progress-track"><span style={{ width: `${Math.min(count / 10, 100)}%` }} /></div></div></div><div className="collection-toolbar"><div className="filter-options" role="group" aria-label="Filter cranes">{(["all","private","public"] as const).map((f) => <button key={f} aria-pressed={filter === f} className={filter === f ? "selected" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All cranes" : f === "private" ? "Just me" : "Open to sharing"}</button>)}</div><div className="collection-tools"><label className="sr-only" htmlFor="sort-cranes">Sort cranes</label><select id="sort-cranes" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><button className="icon-button" aria-label="Download collection backup" disabled={count === 0} onClick={download}><DownloadSimple size={19} /></button></div></div>{!loaded ? <div className="collection-loading" aria-live="polite">Opening your collection…</div> : collectionError ? <div className="empty-collection"><h2>Your collection needs a moment.</h2><p>{collectionError}</p><button className="text-button" onClick={refreshCollection}>Try again<ArrowCounterClockwise size={17} /></button></div> : visibleCranes.length === 0 ? <div className="empty-collection"><div><CraneArt small color={paperHex("ivory")} /></div><h2>{count === 0 ? "Your first wish is waiting." : "No cranes here just yet."}</h2><p>{count === 0 ? "A single piece of paper is all it takes to begin." : "Try another filter to find your wishes."}</p>{count === 0 ? <button className="text-button" onClick={() => startFresh()}>Start folding<ArrowRight size={17} /></button> : <button className="text-button" onClick={() => setFilter("all")}>See all cranes<ArrowRight size={17} /></button>}</div> : <div className="crane-gallery">{visibleCranes.map((crane) => <motion.button layout className="crane-card" key={crane.id} onClick={() => { setSelected(crane); setEditingNote(false); setRemoveConfirm(false); setDetailError(""); }} aria-label={`Open ${crane.name}`}><div className="crane-card-art" style={{ "--crane-tint": `${paperHex(crane.color)}1c` } as React.CSSProperties}><CraneArt small color={paperHex(crane.color)} pattern={crane.pattern} /><span className="crane-privacy">{crane.visibility === "private" ? <LockSimple size={15} /> : <GlobeHemisphereWest size={15} />}</span></div><div className="crane-card-info"><h3>{crane.name}</h3><span>{dateLabel(crane.createdAt)}</span><p>{crane.wish || "A quiet wish, held close."}</p></div></motion.button>)}</div>}<p className="collection-storage-note"><LockSimple size={14} /> Your collection lives in this browser. Download a backup to keep a copy.</p></motion.div>}
      </AnimatePresence>
    </main>
    <footer className="site-footer page-width"><button className="brand footer-brand" onClick={() => navigate("home")}><span>paper crane</span><span className="brand-japanese" lang="ja">紙鶴</span></button><p>A little time. A little paper. A little more connection.</p><span>Made with intention.</span></footer>
    {selected && <Dialog title={selected.name} onClose={() => { setSelected(null); setEditingNote(false); setRemoveConfirm(false); setDetailError(""); }}><div className="detail-art"><CraneArt color={paperHex(selected.color)} pattern={selected.pattern} interactive /></div><div className="detail-body"><span className="detail-date">Folded {dateLabel(selected.createdAt)}</span>{editingNote ? <CraneNoteEditor key={selected.id} crane={selected} onSave={saveNote} onCancel={cancelNote} error={detailError} /> : <><h2>{selected.name}</h2>{selected.wish && <p className="detail-wish">“{selected.wish}”</p>}<span className="detail-privacy">{selected.visibility === "private" ? <LockSimple size={15} /> : <GlobeHemisphereWest size={15} />}{selected.visibility === "private" ? "A wish just for you" : "Open to sharing, saved locally"}</span>{removeConfirm ? <div className="delete-confirm" role="group" aria-label="Confirm crane removal"><p>Remove this crane and its wish from your collection?</p><button ref={keepCraneButton} className="button" onClick={() => { setRemoveConfirm(false); setDetailError(""); }}>Keep it</button><button className="button danger" onClick={remove}>Remove crane</button>{detailError && <p role="alert">{detailError}</p>}</div> : <div className="detail-actions"><button ref={editNoteButton} className="button detail-edit-button" onClick={() => { setEditingNote(true); setDetailError(""); }}>{selected.wish ? "Edit details" : "Add a wish"}<Heart size={16} /></button><button className="text-button remove-button" onClick={() => setRemoveConfirm(true)}><Trash size={15} />Remove crane</button></div>}</>}</div></Dialog>}
  </div></MotionConfig>;
}
