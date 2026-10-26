"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, GlobeHemisphereWest, LockSimple } from "@phosphor-icons/react";
import {
  MAX_CRANE_NAME_LENGTH,
  MAX_WISH_LENGTH,
  type Crane,
  type CraneVisibility,
} from "@/lib/cranes";

interface CraneNoteEditorProps {
  crane: Crane;
  onSave: (updated: Crane) => void;
  onCancel: () => void;
  error?: string;
}

export default function CraneNoteEditor({ crane, onSave, onCancel, error }: CraneNoteEditorProps) {
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(crane.name);
  const [wish, setWish] = useState(crane.wish);
  const [visibility, setVisibility] = useState<CraneVisibility>(crane.visibility);

  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
  }, []);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ ...crane, name: name.trim() || crane.name, wish: wish.trim(), visibility });
  }

  return (
    <form className="note-editor" onSubmit={save} aria-label="Edit crane name and wish">
      <h3 className="note-editor-title">Edit details</h3>

      <label className="field-label" htmlFor={`${id}-name`}>Name your crane <span>(optional)</span></label>
      <input
        ref={nameInput}
        id={`${id}-name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={MAX_CRANE_NAME_LENGTH}
        autoComplete="off"
        placeholder={crane.name}
        aria-describedby={`${id}-name-help`}
      />
      <p className="note-editor-help" id={`${id}-name-help`}>Leave blank to keep “{crane.name}”.</p>

      <div className="wish-label-row">
        <label className="field-label" htmlFor={`${id}-wish`}>Your wish <span>(optional)</span></label>
        <span id={`${id}-wish-count`}>{wish.length}/{MAX_WISH_LENGTH}</span>
      </div>
      <textarea
        id={`${id}-wish`}
        value={wish}
        onChange={(event) => setWish(event.target.value)}
        maxLength={MAX_WISH_LENGTH}
        rows={3}
        placeholder="I wish for…"
        aria-describedby={`${id}-wish-count ${id}-wish-help`}
      />
      <p className="note-editor-help" id={`${id}-wish-help`}>You can leave your wish blank and return to it later.</p>

      <fieldset className="visibility-options">
        <legend>Who is this wish for?</legend>
        <label>
          <input type="radio" name={`${id}-visibility`} value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} />
          <LockSimple size={17} aria-hidden="true" />
          <span>Just me</span>
        </label>
        <label>
          <input type="radio" name={`${id}-visibility`} value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} />
          <GlobeHemisphereWest size={17} aria-hidden="true" />
          <span>Open to sharing</span>
        </label>
      </fieldset>
      <p className="privacy-note">{visibility === "private"
        ? "Kept in this browser, just for you."
        : "This is a local preference. Your wish stays in this browser and is not published."}</p>

      {error && <p className="note-editor-error" role="alert">{error}</p>}
      <div className="note-editor-actions">
        <button type="submit" className="button primary">Save changes<Check size={17} aria-hidden="true" /></button>
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
