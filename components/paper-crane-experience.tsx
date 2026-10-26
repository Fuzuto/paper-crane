"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowCounterClockwise, Check, DownloadSimple, GlobeHemisphereWest, LockSimple, Question, SpeakerHigh, SpeakerSlash, Trash, X } from "@phosphor-icons/react";
import { useReducedMotionPreference } from "@/lib/motion-preference";
import { CRANE_STORAGE_KEY, PAPER_COLORS, PAPER_PATTERNS, loadCranes, saveCrane, deleteCrane, type Crane, type PaperColor, type PaperPattern } from "@/lib/cranes";
import { createFoldingState, foldingReducer } from "@/lib/folding";
import { FOLD_GESTURES } from "@/lib/fold-gestures";
import CraneArt from "./crane-art";
import CraneNoteEditor from "./crane-note-editor";
import DragFoldPaper from "./drag-fold-paper";

type View = "studio" | "collection";
const paperHex = (color: PaperColor) => PAPER_COLORS.find((paper) => paper.id === color)!.hex;
const dateLabel = (date: string) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const milestones = [{ at: 1, name: "A beginning" }, { at: 10, name: "A small flock" }, { at: 100, name: "A sky of hope" }, { at: 1000, name: "Senbazuru" }];
const initialWorkspace = () => foldingReducer(createFoldingState("ivory"), { type: "start" });

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      (opener?.isConnected ? opener : document.getElementById("main-content"))?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className="detail-dialog" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title">
    <div className="dialog-content">
      <button className="icon-button dialog-close" aria-label="Close crane details" onClick={onClose}><X size={20} /></button>
      <h2 id="dialog-title" className="sr-only">{title}</h2>
      {children}
    </div>
  </dialog>;
}

export default function PaperCraneExperience() {
  const [view, setView] = useState<View>("studio");
  const [folding, dispatchFold] = useReducer(foldingReducer, undefined, initialWorkspace);
  const { phase, color, pattern, completedSteps: step } = folding;
  const [settling, setSettling] = useState(false);
  const [cranes, setCranes] = useState<Crane[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [name, setName] = useState("");
  const [wish, setWish] = useState("");
  const [writingNote, setWritingNote] = useState(false);
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
  const phaseTitle = useRef<HTMLHeadingElement>(null);
  const wishName = useRef<HTMLInputElement>(null);
  const keepCraneButton = useRef<HTMLButtonElement>(null);
  const editNoteButton = useRef<HTMLButtonElement>(null);
  const paperMenu = useRef<HTMLDetailsElement>(null);
  const helpMenu = useRef<HTMLDetailsElement>(null);
  const reduce = useReducedMotionPreference();
  const count = cranes.length;

  const refreshCollection = useCallback(() => {
    try { setCranes(loadCranes()); setCollectionError(""); setError(""); }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : "Your collection could not be opened.";
      setCollectionError(message); setError(message);
    }
    setLoaded(true);
  }, []);

  function closeDetails() { setSelected(null); setEditingNote(false); setRemoveConfirm(false); setDetailError(""); }

  useEffect(() => {
    const readView = () => {
      setView(window.location.hash === "#collection" || window.location.hash === "#journey" ? "collection" : "studio");
      setSelected(null); setEditingNote(false); setRemoveConfirm(false); setDetailError("");
    };
    refreshCollection(); readView();
    const onStorage = (event: StorageEvent) => { if (event.key === CRANE_STORAGE_KEY || event.key === null) refreshCollection(); };
    const closeMenus = (event: PointerEvent) => {
      for (const menu of [paperMenu.current, helpMenu.current]) {
        if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("popstate", readView);
    window.addEventListener("hashchange", readView);
    document.addEventListener("pointerdown", closeMenus);
    return () => {
      window.removeEventListener("storage", onStorage); window.removeEventListener("popstate", readView);
      window.removeEventListener("hashchange", readView); document.removeEventListener("pointerdown", closeMenus);
      if (timer.current) clearTimeout(timer.current);
      audio.current?.close();
    };
  }, [refreshCollection]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    (phaseTitle.current ?? main.current)?.focus({ preventScroll: true });
  }, [view, phase]);
  useEffect(() => { if (writingNote) wishName.current?.focus({ preventScroll: true }); }, [writingNote]);
  useEffect(() => { if (removeConfirm) keepCraneButton.current?.focus(); }, [removeConfirm]);

  function navigate(next: View) {
    closeDetails(); setView(next);
    if (window.location.hash !== `#${next}`) window.history.pushState({}, "", `#${next}`);
  }
  function resetFolds(nextColor = color, nextPattern = pattern) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setSettling(false);
    dispatchFold({ type: "restart" });
    dispatchFold({ type: "choose-paper", color: nextColor, pattern: nextPattern });
    dispatchFold({ type: "start" });
  }
  function startFresh() {
    resetFolds(); setName(""); setWish(""); setWritingNote(false); setVisibility("private"); pendingId.current = "";
    if (paperMenu.current) paperMenu.current.open = false;
    if (helpMenu.current) helpMenu.current.open = false;
    navigate("studio");
    requestAnimationFrame(() => phaseTitle.current?.focus({ preventScroll: true }));
  }
  function choosePaper(nextColor: PaperColor, nextPattern: PaperPattern) {
    if (step === 0 && phase === "folding" && !settling) resetFolds(nextColor, nextPattern);
  }
  function fold() {
    if (settling || phase !== "folding") return;
    setSettling(true); dispatchFold({ type: "preview", progress: 1 });
    timer.current = setTimeout(() => { dispatchFold({ type: "commit-fold" }); setSettling(false); timer.current = null; }, reduce ? 80 : 550);
  }
  function undo() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setSettling(false); dispatchFold({ type: "undo" });
  }
  function save(event: FormEvent) { event.preventDefault(); keepCrane(); }
  function keepCrane() {
    if (phase !== "wish") return;
    if (!pendingId.current) pendingId.current = crypto.randomUUID();
    const savedName = name.trim() || `${PAPER_COLORS.find((paper) => paper.id === color)!.name} crane`;
    const crane: Crane = { id: pendingId.current, name: savedName, wish: wish.trim(), color, pattern, visibility, createdAt: new Date().toISOString(), folds: 12 };
    try {
      setCranes(saveCrane(crane)); setName(savedName); setLoaded(true); setCollectionError(""); setError(""); dispatchFold({ type: "finish" });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your crane could not be saved. Please try again."); }
  }
  function saveNote(updated: Crane) {
    try {
      setCranes(saveCrane(updated)); setSelected(updated); setEditingNote(false); setDetailError(""); setCollectionError(""); setError("");
      requestAnimationFrame(() => editNoteButton.current?.focus({ preventScroll: true }));
    } catch (failure) { setDetailError(failure instanceof Error ? failure.message : "Your changes could not be saved. Please try again."); }
  }
  function cancelNote() {
    setEditingNote(false); setDetailError("");
    requestAnimationFrame(() => editNoteButton.current?.focus({ preventScroll: true }));
  }
  function remove() {
    if (!selected) return;
    try {
      setCranes(deleteCrane(selected.id)); closeDetails(); setError("");
      requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    } catch (failure) { setDetailError(failure instanceof Error ? failure.message : "This crane could not be removed."); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ version: 1, cranes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "paper-crane-collection.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function toggleSound() {
    if (sound) { await audio.current?.close(); audio.current = null; setSound(false); return; }
    try {
      const context = new AudioContext(); audio.current = context;
      const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const data = buffer.getChannelData(0); let last = 0;
      for (let index = 0; index < data.length; index++) { last = (last + (Math.random() * 2 - 1) * .02) / 1.02; data[index] = last * 3.5; }
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filterNode = context.createBiquadFilter(); filterNode.type = "lowpass"; filterNode.frequency.value = 600;
      const gain = context.createGain(); gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(.16, context.currentTime + 1);
      source.connect(filterNode).connect(gain).connect(context.destination); source.start(); await context.resume(); setSound(true);
    } catch {
      await audio.current?.close().catch(() => {}); audio.current = null; setSound(false);
      setError("Ambient sound is unavailable in this browser. You can still fold.");
    }
  }
  const visibleCranes = useMemo(() => cranes.filter((crane) => filter === "all" || crane.visibility === filter)
    .sort((a, b) => sort === "newest" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(a.createdAt) - Date.parse(b.createdAt)), [cranes, filter, sort]);

  return <MotionConfig reducedMotion="user"><div className="site-shell" data-view={view}>
    <header className="site-header">
      <button className="brand" aria-label="Paper Crane home" onClick={() => navigate("studio")}>paper crane</button>
      <nav className="header-actions" aria-label="Main navigation">
        {view === "studio" ? <button className="nav-link" onClick={() => navigate("collection")} aria-label="My collection">Collection</button>
          : <button className="nav-link" onClick={() => navigate("studio")}><ArrowLeft size={15} />Back to paper</button>}
      </nav>
    </header>
    <main id="main-content" ref={main} tabIndex={-1}>
      {error && <div className="error-banner" role="alert"><p>{error}</p><button className="icon-button" aria-label="Dismiss message" onClick={() => setError("")}><X size={18} /></button></div>}
      {view === "studio" && <div className="studio" id="view-studio">
        {phase === "folding" && <div className="fold-workspace">
          <div className="fold-stage"><DragFoldPaper step={step} color={paperHex(color)} pattern={pattern} disabled={settling} onFold={fold} /></div>
          <div className="fold-caption">
            <span className="fold-step-number">{step + 1} / 12</span>
            <h1 ref={phaseTitle} tabIndex={-1} className="fold-instruction" aria-live="polite">{settling ? "Crease made." : FOLD_GESTURES[step].prompt}</h1>
            <div className="fold-dots sr-only" role="group" aria-label={`${step} folds completed`} />
          </div>
          <div className="studio-toolbar">
            <div className="paper-tools">
              <details className="paper-menu" ref={paperMenu} onToggle={(event) => { if (event.currentTarget.open && helpMenu.current) helpMenu.current.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                <summary>Paper</summary>
                <div className="paper-tray">
                  <fieldset className="paper-options" disabled={step > 0 || settling}>
                    <legend>Color <span>{PAPER_COLORS.find((paper) => paper.id === color)?.name}</span></legend>
                    <div className="color-options">{PAPER_COLORS.map((paper) => <button key={paper.id} type="button" className={color === paper.id ? "color-option selected" : "color-option"} style={{ backgroundColor: paper.hex }} onClick={() => choosePaper(paper.id, pattern)} aria-label={paper.name} aria-pressed={color === paper.id}>{color === paper.id && <Check size={16} />}</button>)}</div>
                  </fieldset>
                  <fieldset className="paper-options" disabled={step > 0 || settling}>
                    <legend>Pattern</legend>
                    <div className="pattern-options">{PAPER_PATTERNS.map((paper) => <button key={paper.id} className={pattern === paper.id ? "pattern-option selected" : "pattern-option"} onClick={() => choosePaper(color, paper.id)} aria-pressed={pattern === paper.id}>{paper.name}</button>)}</div>
                  </fieldset>
                  {step > 0 && <p className="privacy-note">Start over to change paper.</p>}
                  <button type="button" className="text-button panel-close" onClick={() => { if (paperMenu.current) paperMenu.current.open = false; paperMenu.current?.querySelector("summary")?.focus(); }}>Done</button>
                </div>
              </details>
            </div>
            <div className="fold-actions">
              <button className="text-button" onClick={undo} disabled={step === 0 || settling} aria-label="Undo fold"><ArrowCounterClockwise size={17} /><span>Undo</span></button>
              <button className="text-button" onClick={startFresh} disabled={settling}>Start over</button>
            </div>
            <div className="quiet-controls">
              <details className="help-menu" ref={helpMenu} onToggle={(event) => { if (event.currentTarget.open && paperMenu.current) paperMenu.current.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                <summary aria-label="Folding help"><Question size={19} aria-hidden="true" /></summary>
                <div className="help-tray"><h2>One fold at a time.</h2><p>Grab the marked corner, drag it to the ring, then release.</p><p>Using a keyboard? Focus the corner, move with the arrow keys, then press Enter at the ring. Escape returns the paper.</p></div>
              </details>
              <button className="icon-button sound-button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Sound on. Turn off ambient sound" : "Sound off. Turn on ambient sound"}>{sound ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}</button>
            </div>
          </div>
        </div>}
        {phase === "wish" && <div className="finish-space">
          <div className="finish-art"><CraneArt color={paperHex(color)} pattern={pattern} interactive /></div>
          <h1 ref={phaseTitle} tabIndex={-1} className="finish-title">Your crane.</h1>
          {!writingNote ? <><div className="finish-actions"><button className="button primary" onClick={keepCrane}>Keep for later<ArrowRight size={16} /></button><button className="text-button" onClick={() => setWritingNote(true)}>Add a note</button></div><p className="wish-later-note">A name or wish can come later.</p></>
            : <form className="wish-form" onSubmit={save}>
              <label className="field-label" htmlFor="crane-name">Name your crane <span>(optional)</span></label>
              <input ref={wishName} id="crane-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="A name" autoComplete="off" />
              <div className="wish-label-row"><label className="field-label" htmlFor="crane-wish">Your wish <span>(optional)</span></label><span>{wish.length}/280</span></div>
              <textarea id="crane-wish" value={wish} onChange={(event) => setWish(event.target.value)} maxLength={280} rows={3} placeholder="I wish for…" />
              <details className="note-details"><summary>Privacy</summary><fieldset className="visibility-options"><legend>Who is this wish for?</legend><label><input type="radio" name="visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} /><LockSimple size={16} />Just me</label><label><input type="radio" name="visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} /><GlobeHemisphereWest size={16} />Open to sharing</label></fieldset><p className="privacy-note">Saved only in this browser. Nothing is published.</p></details>
              <div className="wish-actions"><button type="submit" className="button primary">Keep my crane</button><button type="button" className="text-button" onClick={keepCrane}>Keep for later</button></div>
            </form>}
          <button className="text-button wish-undo" onClick={undo}><ArrowLeft size={14} />Return to the last fold</button>
        </div>}
        {phase === "complete" && <div className="completion">
          <div className="completion-art"><CraneArt color={paperHex(color)} pattern={pattern} interactive /></div>
          <h1 ref={phaseTitle} tabIndex={-1} className="finish-title">Kept.</h1>
          <p className="completion-message">{name} · saved to your collection.</p>
          <div className="completion-actions"><button className="button primary" onClick={startFresh}>Fold another<ArrowRight size={16} /></button><button className="text-button" onClick={() => navigate("collection")}>My collection</button></div>
        </div>}
      </div>}
      {view === "collection" && <div className="collection page-width" id="view-collection">
        <div className="collection-heading"><div><h1 ref={phaseTitle} tabIndex={-1} className="collection-title">Your cranes.</h1><p className="collection-subtitle">{count} {count === 1 ? "crane" : "cranes"} folded</p></div><button className="button" onClick={startFresh}>Start folding<ArrowRight size={16} /></button></div>
        <details className="journey-details" id="journey"><summary>{count.toLocaleString()} of 1,000</summary><div className="collection-summary"><div className="progress-track" role="progressbar" aria-label="Thousand cranes journey" aria-valuenow={Math.min(count, 1000)} aria-valuemin={0} aria-valuemax={1000}><span style={{ width: `${Math.min(count / 10, 100)}%` }} /></div><div className="journey-milestones">{milestones.map((milestone) => <div key={milestone.at} className={count >= milestone.at ? "milestone reached" : "milestone"}><span>{milestone.at.toLocaleString()}</span><span>{milestone.name}</span></div>)}</div></div></details>
        <div className="collection-toolbar"><div className="collection-filters"><label className="sr-only" htmlFor="filter-cranes">Filter cranes</label><select id="filter-cranes" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All cranes</option><option value="private">Just me</option><option value="public">Open to sharing</option></select></div><div className="collection-tools"><label className="sr-only" htmlFor="sort-cranes">Sort cranes</label><select id="sort-cranes" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><button className="icon-button" aria-label="Download collection backup" disabled={count === 0} onClick={download}><DownloadSimple size={18} /></button></div></div>
        {!loaded ? <div className="collection-loading" role="status">Opening your collection…</div>
          : collectionError ? <div className="empty-collection"><h2>Your collection couldn’t be opened.</h2><p>{collectionError}</p><button className="text-button" onClick={refreshCollection}>Try again<ArrowCounterClockwise size={16} /></button></div>
            : visibleCranes.length === 0 ? <div className="empty-collection"><div><CraneArt small color={paperHex("ivory")} /></div><h2>{count === 0 ? "No cranes yet." : "No matching cranes."}</h2>{count === 0 ? <button className="text-button" onClick={startFresh}>Fold your first<ArrowRight size={16} /></button> : <button className="text-button" onClick={() => setFilter("all")}>See all cranes<ArrowRight size={16} /></button>}</div>
              : <div className="crane-gallery">{visibleCranes.map((crane) => <button className="crane-card" key={crane.id} onClick={() => { setSelected(crane); setEditingNote(false); setRemoveConfirm(false); setDetailError(""); }} aria-label={`Open ${crane.name}`}><div className="crane-card-art"><CraneArt small color={paperHex(crane.color)} pattern={crane.pattern} /><span className="crane-privacy">{crane.visibility === "private" ? <LockSimple size={14} /> : <GlobeHemisphereWest size={14} />}</span></div><div className="crane-card-info"><h3>{crane.name}</h3><span>{dateLabel(crane.createdAt)}</span>{crane.wish && <p>{crane.wish}</p>}</div></button>)}</div>}
        <p className="collection-storage-note">Saved in this browser. Download a backup to keep a copy.</p>
      </div>}
    </main>
    {selected && <Dialog title={selected.name} onClose={closeDetails}>
      <div className="detail-art"><CraneArt color={paperHex(selected.color)} pattern={selected.pattern} interactive /></div>
      <div className="detail-body"><span className="detail-date">{dateLabel(selected.createdAt)}</span>
        {editingNote ? <CraneNoteEditor key={selected.id} crane={selected} onSave={saveNote} onCancel={cancelNote} error={detailError} />
          : <><h2>{selected.name}</h2>{selected.wish && <p className="detail-wish">{selected.wish}</p>}<span className="detail-privacy">{selected.visibility === "private" ? <LockSimple size={14} /> : <GlobeHemisphereWest size={14} />}{selected.visibility === "private" ? "Just you" : "Open to sharing, saved locally"}</span>
            {removeConfirm ? <div className="delete-confirm" role="group" aria-label="Confirm crane removal"><p>Remove this crane and its wish?</p><button ref={keepCraneButton} className="button" onClick={() => { setRemoveConfirm(false); setDetailError(""); }}>Keep it</button><button className="button danger" onClick={remove}>Remove crane</button>{detailError && <p role="alert">{detailError}</p>}</div>
              : <div className="detail-actions"><button ref={editNoteButton} className="button detail-edit-button" onClick={() => { setEditingNote(true); setDetailError(""); }}>{selected.wish ? "Edit details" : "Add a wish"}</button><button className="text-button remove-button" onClick={() => setRemoveConfirm(true)}><Trash size={14} />Remove crane</button></div>}</>}
      </div>
    </Dialog>}
  </div></MotionConfig>;
}
