"use client";

import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import styled from "styled-components";
import { SketchPicker } from "react-color";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import interact from "interactjs";
import Toolbar from "../components/Toolbar";

/* ---------------------------
  Styled helpers (minimal)
   --------------------------- */
const Wrapper = styled.div`padding:24px; max-width:1200px; margin:0 auto;`;
const TopBar = styled.div`display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;`;
const Tools = styled.div`display:flex; gap:12px; align-items:center; flex-wrap:wrap;`;
const Side = styled.div`width:320px;`;
const Main = styled.div`flex:1; display:flex; justify-content:center;`;
const Flex = styled.div`display:flex; gap:16px;`;
const A4 = styled.div.attrs(() => ({ className: "a4" }))``;

/* ---------------------------
  Utility: debounce
   --------------------------- */
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------------------
  Memoized Canvas Element
  - Uses refs to apply transient transforms directly to DOM
  - Only re-renders if its own props change shallowly
   --------------------------- */
const CanvasElement = memo(function CanvasElement({
  el,
  selected,
  onSelect,
  onCommit, // called when an interaction ends with updated transform
}) {
  const nodeRef = useRef(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    // Initialize style from el when mounted or when el changes
    node.style.left = el.x + "px";
    node.style.top = el.y + "px";
    node.style.width = el.width + "px";
    node.style.height = el.height + "px";
    node.style.transform = `rotate(${el.rotate || 0}deg)`;
    node.style.borderRadius = (el.radius || 0) + "px";
    node.dataset.elementId = el.id;
  }, [el]);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    // Skip if already initialized
    if (node.dataset.interact === "1") return;

    // We'll keep interim transform in dataset / css. Commit on end.
    interact(node)
      .draggable({
        listeners: {
          start() {
            node.style.transition = "none";
          },
          move(event) {
            // apply transform via translate (do not update React state)
            const curX = parseFloat(node.dataset.tx || 0);
            const curY = parseFloat(node.dataset.ty || 0);
            const nx = curX + event.dx;
            const ny = curY + event.dy;
            node.dataset.tx = nx;
            node.dataset.ty = ny;
            node.style.transform = `translate(${nx}px, ${ny}px) rotate(${el.rotate || 0}deg)`;
          },
          end() {
            // commit computed translate into absolute left/top and reset translate
            const tx = parseFloat(node.dataset.tx || 0);
            const ty = parseFloat(node.dataset.ty || 0);
            // compute new absolute position
            const left = (parseFloat(node.style.left) || el.x) + tx;
            const top = (parseFloat(node.style.top) || el.y) + ty;
            // reset transform and dataset
            node.style.transform = `rotate(${el.rotate || 0}deg)`;
            node.dataset.tx = 0;
            node.dataset.ty = 0;
            node.style.left = left + "px";
            node.style.top = top + "px";
            node.style.transition = "";
            onCommit(el.id, { x: left, y: top });
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
          start() {
            node.style.transition = "none";
          },
          move(event) {
            // apply width/height and position transiently
            const w = Math.max(20, event.rect.width);
            const h = Math.max(20, event.rect.height);
            const left = parseFloat(node.style.left || el.x) + event.deltaRect.left;
            const top = parseFloat(node.style.top || el.y) + event.deltaRect.top;
            node.style.width = w + "px";
            node.style.height = h + "px";
            node.style.left = left + "px";
            node.style.top = top + "px";
          },
          end(event) {
            const w = Math.max(20, event.rect.width);
            const h = Math.max(20, event.rect.height);
            const left = parseFloat(node.style.left || el.x);
            const top = parseFloat(node.style.top || el.y);
            node.style.transition = "";
            onCommit(el.id, { x: left, y: top, width: w, height: h });
          },
        },
        modifiers: [interact.modifiers.restrictSize({ min: { width: 20, height: 20 }, max: { width: 6000, height: 6000 } })],
      });

    node.dataset.interact = "1";

    return () => {
      try {
        interact(node).unset();
      } catch {}
    };
  }, [el, onCommit]);

  // Node click selects element
  function handlePointerDown(e) {
    e.stopPropagation();
    onSelect(el.id);
  }

  // Render element content
  const commonStyle = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    zIndex: el.z || 1,
    cursor: "grab",
    borderRadius: el.radius || 0,
    overflow: "hidden",
    boxShadow: selected ? "0 12px 30px rgba(0,0,0,0.18)" : "0 6px 18px rgba(0,0,0,0.08)",
    background: "white",
  };

  return (
    <div
      id={"el-" + el.id}
      ref={nodeRef}
      style={commonStyle}
      onPointerDown={handlePointerDown}
      aria-hidden={false}
    >
      {el.type === "image" && (
        <img
          src={el.src}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: el.filter || "none",
          }}
        />
      )}

      {el.type === "text" && (
        <div
          contentEditable
          suppressContentEditableWarning
          style={{
            width: "100%",
            height: "100%",
            padding: 8,
            boxSizing: "border-box",
            color: el.color || "#000",
            fontSize: (el.size || 18) + "px",
            fontFamily: el.font || "Dancing Script",
            overflow: "auto",
            outline: "none",
          }}
          onInput={(e) => {
            // We debounce content updates to avoid state thrash
            const txt = e.currentTarget.innerText;
            if (nodeRef.current) {
              // store current text in DOM to avoid stale render; commit on blur or when debouncer fires
              nodeRef.current.dataset.pendingText = txt;
            }
            // debounced commit handled by parent via onCommit? We'll call a small event after debounce below
          }}
          onBlur={() => {
            // commit on blur
            const pending = nodeRef.current && nodeRef.current.dataset.pendingText;
            if (pending !== undefined) {
              onCommit(el.id, { text: pending });
              delete nodeRef.current.dataset.pendingText;
            }
          }}
        >
          {el.text}
        </div>
      )}

      {el.type === "icon" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: Math.min(el.width, el.height) * 0.7 }}>
          {el.icon}
        </div>
      )}
    </div>
  );
},
// custom compare to avoid re-render unless key fields changed
(prev, next) => {
  // shallow compare important props
  const a = prev.el;
  const b = next.el;
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.z === b.z &&
    a.text === b.text &&
    a.src === b.src &&
    a.filter === b.filter &&
    prev.selected === next.selected
  );
});

/* ---------------------------
  Main Page (optimized)
   --------------------------- */
export default function Page() {
  const [elements, setElements] = useState([]); // keep elements in z-order
  const [selected, setSelected] = useState(null);
  const [bg, setBg] = useState({ r: 255, g: 250, b: 250, a: 1 });
  const [fontFamily, setFontFamily] = useState("Dancing Script");
  const fileRef = useRef();
  const pageRef = useRef();

  // history stacks (store snapshots)
  const historyRef = useRef([]);
  const futureRef = useRef([]);

  const pushHistory = useCallback(() => {
    try {
      const snap = JSON.stringify(elements);
      historyRef.current = [...historyRef.current, snap].slice(-50);
      futureRef.current = [];
    } catch {}
  }, [elements]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.length === 0) return;
    const last = h[h.length - 1];
    historyRef.current = h.slice(0, -1);
    futureRef.current = [JSON.stringify(elements), ...futureRef.current];
    setElements(JSON.parse(last));
    setSelected(null);
  }, [elements]);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (f.length === 0) return;
    const first = f[0];
    futureRef.current = f.slice(1);
    historyRef.current = [...historyRef.current, JSON.stringify(elements)].slice(-50);
    setElements(JSON.parse(first));
    setSelected(null);
  }, [elements]);

  // handle keyboard
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // add text
  function addText() {
    pushHistory();
    const id = Date.now() + Math.floor(Math.random() * 999);
    const el = {
      id,
      type: "text",
      text: "My sweet love…",
      x: 60,
      y: 60,
      width: 320,
      height: 120,
      size: 28,
      color: "#000",
      font: fontFamily,
      z: elements.length ? Math.max(...elements.map((e) => e.z || 0)) + 1 : 1,
    };
    setElements((p) => [...p, el]);
    setSelected(id);
  }

  // add icon
  function addIcon(icon) {
    pushHistory();
    const id = Date.now() + Math.floor(Math.random() * 999);
    const el = { id, type: "icon", icon, x: 80, y: 80, width: 120, height: 120, z: elements.length ? Math.max(...elements.map((e) => e.z || 0)) + 1 : 1 };
    setElements((p) => [...p, el]);
    setSelected(id);
  }

  // upload image (auto-resize)
  function uploadImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width,
          h = img.height;
        const scale = Math.min(1, Math.min(MAX / w, MAX / h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(
          (blob) => {
            const url = URL.createObjectURL(blob);
            pushHistory();
            const id = Date.now() + Math.floor(Math.random() * 999);
            const el = { id, type: "image", src: url, x: 80, y: 80, width: Math.min(480, w), height: Math.min(360, h), filter: "none", frame: "none", z: elements.length ? Math.max(...elements.map((e) => e.z || 0)) + 1 : 1 };
            setElements((p) => [...p, el]);
            setSelected(id);
          },
          "image/jpeg",
          0.9
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // commit from CanvasElement when interactions end (single state update)
  const handleCommit = useCallback((id, patch) => {
    // patch contains {x,y,width,height,text,...}
    setElements((prev) => {
      const next = prev.map((el) => (el.id === id ? { ...el, ...patch } : el));
      return next;
    });
  }, []);

  // update selected (UI controls)
  function updateSelected(patch) {
    if (!selected) return;
    pushHistory();
    setElements((prev) => prev.map((el) => (el.id === selected ? { ...el, ...patch } : el)));
  }

  function bringForward() {
    if (!selected) return;
    pushHistory();
    setElements((prev) => {
      const maxz = Math.max(...prev.map((p) => p.z || 0));
      return prev.map((el) => (el.id === selected ? { ...el, z: maxz + 1 } : el));
    });
  }

  function sendBackward() {
    if (!selected) return;
    pushHistory();
    setElements((prev) => prev.map((el) => (el.id === selected ? { ...el, z: Math.max(1, (el.z || 1) - 1) } : el)));
  }

  function deleteSelected() {
    if (!selected) return;
    pushHistory();
    setElements((prev) => prev.filter((el) => el.id !== selected));
    setSelected(null);
  }

  function applyFilterToSelected(filterName, value) {
    if (!selected) return;
    pushHistory();
    setElements((prev) => prev.map((el) => (el.id === selected ? { ...el, filter: `${filterName}(${value})` } : el)));
  }

  function addFrameToSelected(kind) {
    if (!selected) return;
    pushHistory();
    setElements((prev) => prev.map((el) => (el.id === selected ? { ...el, frame: kind } : el)));
  }

  // export
  function exportPNG() {
    if (!pageRef.current) return;
    html2canvas(pageRef.current, { scale: 2, useCORS: true }).then((canvas) => {
      const link = document.createElement("a");
      link.download = "love-page.png";
      link.href = canvas.toDataURL();
      link.click();
    });
  }

  function exportPDF() {
    if (!pageRef.current) return;
    html2canvas(pageRef.current, { scale: 2, useCORS: true }).then((canvas) => {
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(img, "PNG", 0, 0, 210, 297);
      pdf.save("love-page.pdf");
    });
  }

  // templates
  function loadTemplate(kind) {
    pushHistory();
    if (kind === "love-letter") {
      setElements([{ id: 1, type: "text", text: "My dearest…", x: 60, y: 60, width: 420, height: 200, size: 32, color: "#333", font: "Dancing Script", z: 1 }]);
    } else if (kind === "collage") {
      setElements([
        { id: 11, type: "image", src: "/sample1.jpg", x: 60, y: 60, width: 220, height: 160, z: 1 },
        { id: 12, type: "image", src: "/sample2.jpg", x: 300, y: 60, width: 220, height: 160, z: 2 },
        { id: 13, type: "text", text: "Our memories", x: 60, y: 240, width: 460, height: 100, size: 28, color: "#222", font: "Great Vibes", z: 3 },
      ]);
    } else if (kind === "valentine-card") {
      setElements([{ id: 21, type: "text", text: "Happy Valentine", x: 80, y: 120, width: 360, height: 120, size: 36, color: "#b30059", font: "Pacifico", z: 1 }]);
    }
  }

  // ensure elements remain in render order by z (we keep state as-is; we'll sort only when rendering map to stable array)
  const sorted = [...elements].sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <Wrapper>
      <TopBar>
        <h2 style={{ margin: 0 }}>Love Studio — Optimized A4 Editor</h2>
        <Tools>
          <Toolbar onAddText={addText} onAddHeart={() => addIcon("❤️")} onUpload={() => fileRef.current.click()} onExportPNG={exportPNG} onExportPDF={exportPDF} />
        </Tools>
      </TopBar>

      <Flex>
        <Side>
          <div style={{ background: "#fff", padding: 12, borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
            <h4>Background</h4>
            <SketchPicker color={bg} onChange={(c) => setBg(c.rgb)} />
            <div style={{ marginTop: 8 }}>
              <label>Font family</label>
              <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} style={{ width: "100%" }}>
                <option>Dancing Script</option>
                <option>Great Vibes</option>
                <option>Pacifico</option>
                <option>Shadows Into Light</option>
              </select>
            </div>

            <h4 style={{ marginTop: 12 }}>Filters</h4>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setFilter({ name: "none", value: "" })}>None</button>
              <button onClick={() => setFilter({ name: "sepia", value: "0.6" })}>Sepia</button>
              <button onClick={() => setFilter({ name: "grayscale", value: "0.6" })}>Mono</button>
              <button onClick={() => setFilter({ name: "blur", value: "2px" })}>Blur</button>
              <button onClick={() => setFilter({ name: "contrast", value: "1.2" })}>Contrast</button>
              <button onClick={() => setFilter({ name: "saturate", value: "1.2" })}>Saturate</button>
              <button onClick={() => setFilter({ name: "hue-rotate", value: "280deg" })}>Pink</button>
            </div>

            <h4 style={{ marginTop: 12 }}>Edit Selected</h4>
            {!selected && <div style={{ color: "#666" }}>Select an element to edit</div>}
            {selected &&
              (() => {
                const el = elements.find((x) => x.id === selected);
                if (!el) return null;
                return (
                  <div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <button onClick={() => bringForward()}>Bring ↑</button>
                      <button onClick={() => sendBackward()}>Send ↓</button>
                      <button onClick={() => deleteSelected()}>Delete</button>
                    </div>
                    {el.type === "text" && (
                      <>
                        <label>Text</label>
                        <textarea value={el.text} onChange={(e) => updateSelected({ text: e.target.value })} style={{ width: "100%" }} />
                        <label>Size</label>
                        <input type="range" min="8" max="96" value={el.size} onChange={(e) => updateSelected({ size: Number(e.target.value) })} />
                        <label>Color</label>
                        <input type="color" value={el.color} onChange={(e) => updateSelected({ color: e.target.value })} />
                        <label>Font</label>
                        <select value={el.font || fontFamily} onChange={(e) => updateSelected({ font: e.target.value })}>
                          <option>Dancing Script</option>
                          <option>Great Vibes</option>
                          <option>Pacifico</option>
                          <option>Shadows Into Light</option>
                        </select>
                      </>
                    )}

                    {el.type === "image" && (
                      <>
                        <label>Apply filter to image</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => applyFilterToSelected("grayscale", "0.6")}>Mono</button>
                          <button onClick={() => applyFilterToSelected("sepia", "0.6")}>Sepia</button>
                          <button onClick={() => applyFilterToSelected("blur", "2px")}>Blur</button>
                          <button onClick={() => applyFilterToSelected("hue-rotate", "280deg")}>Pink</button>
                        </div>
                        <label>Frames</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => addFrameToSelected("polaroid")}>Polaroid</button>
                          <button onClick={() => addFrameToSelected("pink")}>Pink</button>
                          <button onClick={() => addFrameToSelected("gold")}>Gold</button>
                          <button onClick={() => addFrameToSelected("heart")}>Heart</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

            <h4 style={{ marginTop: 12 }}>Templates</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => loadTemplate("love-letter")}>Love Letter</button>
              <button onClick={() => loadTemplate("collage")}>Collage</button>
              <button onClick={() => loadTemplate("valentine-card")}>Valentine Card</button>
            </div>

            <h4 style={{ marginTop: 12 }}>History</h4>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => undo()}>Undo</button>
              <button onClick={() => redo()}>Redo</button>
            </div>
          </div>
        </Side>

        <Main>
          <A4 ref={pageRef} onClick={() => setSelected(null)} style={{ background: `rgba(${bg.r},${bg.g},${bg.b},${bg.a})`, padding: "20mm" }}>
            {sorted.map((el) => (
              <CanvasElement key={el.id} el={el} selected={selected === el.id} onSelect={setSelected} onCommit={handleCommit} />
            ))}
          </A4>
        </Main>
      </Flex>

      {/* hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadImage(e.target.files && e.target.files[0])} />
    </Wrapper>
  );
}
