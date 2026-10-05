(function () {
  "use strict";
  const SF = window.SF,
    NS = "http://www.w3.org/2000/svg",
    $ = (id) => document.getElementById(id);
  const S = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const textValue = (t) =>
    t.querySelector("tspan")
      ? [...t.children].map((s) => s.textContent).join("\n")
      : t.textContent;
  const matrix = (n) => {
    const m = n.transform?.baseVal?.consolidate()?.matrix;
    return m ? new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]) : new DOMMatrix();
  };
  const setMatrix = (n, m) => {
    n.setAttribute(
      "transform",
      `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].join(" ")})`,
    );
    Object.assign(n.dataset, {
      x: m.e,
      y: m.f,
      sx: Math.hypot(m.a, m.b),
      sy: (m.a * m.d - m.b * m.c) / Math.max(1e-9, Math.hypot(m.a, m.b)),
      rotation: (Math.atan2(m.b, m.a) * 180) / Math.PI,
    });
  };
  const corners = (b) => [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.height],
    [b.x, b.y + b.height],
  ];
  function bounds(points) {
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y),
      x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  const geometry = (n) => {
    const b = n.getBBox(),
      m = matrix(n);
    return bounds(
      corners(b).map(([x, y]) => new DOMPoint(x, y).matrixTransform(m)),
    );
  };
  const union = (nodes) =>
    bounds(
      nodes.flatMap((n) => corners(geometry(n)).map(([x, y]) => ({ x, y }))),
    );
  const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const around = (x, y, m) =>
    new DOMMatrix().translate(x, y).multiply(m).translate(-x, -y);
  class Editor {
    constructor() {
      this.stage = $("stage");
      this.art = $("art");
      this.defs = $("defs");
      this.overlay = $("selection");
      this.guides = $("guides");
      this.selected = [];
      this.listeners = [];
      this.undoStack = [];
      this.redoStack = [];
      this.clipboard = null;
      this.zoom = 1;
      this.drag = null;
      this.space = false;
      this.doc = null;
      this.bind();
      this.newDocument({ name: "未命名项目", width: 1568, height: 784 });
    }
    onChange(fn) {
      this.listeners.push(fn);
      return () => {
        this.listeners = this.listeners.filter((f) => f !== fn);
      };
    }
    getDocument() {
      return {
        ...SF.clone(this.doc),
        scene: { defs: this.defs.innerHTML, body: this.art.innerHTML },
      };
    }
    validateDocument(raw) {
      let d = SF.clone(raw);
      if (d.format === "biology-svg-editor" && d.version === 1)
        d = {
          format: "scifigure-project",
          version: 1,
          id: SF.uid("project"),
          name: "导入的科研图",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          canvas: { width: d.width, height: d.height, background: "#ffffff" },
          scene: { defs: d.defs, body: d.body },
        };
      if (d.format !== "scifigure-project" || d.version !== 1)
        throw new Error("工程格式或版本不受支持");
      if (
        !d.canvas ||
        !d.scene ||
        typeof d.scene.body !== "string" ||
        typeof d.scene.defs !== "string"
      )
        throw new Error("工程结构不完整");
      for (const k of ["width", "height"])
        if (
          !Number.isFinite(d.canvas[k]) ||
          d.canvas[k] < 64 ||
          d.canvas[k] > 12000
        )
          throw new Error("画布尺寸须为 64–12000");
      if (d.scene.body.length + d.scene.defs.length > 30 * 1024 * 1024)
        throw new Error("工程过大（0.1 版上限 30 MB SVG 内容）");
      if (!/^#[0-9a-f]{6}$/i.test(d.canvas.background))
        d.canvas.background = "#ffffff";
      d.id =
        typeof d.id === "string" && d.id.length < 200
          ? d.id
          : SF.uid("project");
      d.name = String(d.name || "未命名项目").slice(0, 160);
      d.createdAt = d.createdAt || new Date().toISOString();
      d.updatedAt = d.updatedAt || d.createdAt;
      d.scene = {
        body: SF.SVG.sanitizeFragment(d.scene.body),
        defs: SF.SVG.sanitizeFragment(d.scene.defs),
      };
      const temp = S("g");
      temp.innerHTML = d.scene.body;
      for (const n of [...temp.children]) {
        if (n.tagName !== "g" || !n.hasAttribute("data-item")) {
          const g = S("g");
          Object.assign(g.dataset, {
            item: SF.uid("item"),
            name: "导入图形",
            kind: "icon",
          });
          n.replaceWith(g);
          g.append(n);
        }
      }
      d.scene.body = temp.innerHTML;
      return d;
    }
    loadDocument(raw) {
      const d = this.validateDocument(raw);
      this.doc = d;
      this.art.innerHTML = d.scene.body;
      this.defs.innerHTML = d.scene.defs;
      this.selected = [];
      this.drag = null;
      this.undoStack = [this.snapshot()];
      this.redoStack = [];
      this.applyCanvas();
      this.render();
      SF.emit("document:opened", { id: d.id });
    }
    newDocument({ name = "未命名项目", width = 1568, height = 784 } = {}) {
      this.loadDocument({
        format: "scifigure-project",
        version: 1,
        id: SF.uid("project"),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canvas: {
          width: Number(width),
          height: Number(height),
          background: "#ffffff",
        },
        scene: { defs: "", body: "" },
      });
    }
    setName(name) {
      const value = String(name).trim().slice(0, 160) || "未命名项目";
      if (this.doc.name !== value) {
        this.doc.name = value;
        this.commit("rename");
      }
    }
    snapshot() {
      return JSON.stringify({
        canvas: this.doc.canvas,
        name: this.doc.name,
        defs: this.defs.innerHTML,
        body: this.art.innerHTML,
      });
    }
    commit(reason = "edit") {
      const s = this.snapshot();
      if (s === this.undoStack.at(-1)) {
        this.render();
        return;
      }
      this.undoStack.push(s);
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack = [];
      this.changed(reason);
    }
    changed(reason) {
      this.doc.updatedAt = new Date().toISOString();
      this.render();
      for (const f of this.listeners) f(this.getDocument());
      SF.emit("document:changed", { id: this.doc.id, reason });
    }
    restoreSnapshot(s) {
      const d = JSON.parse(s);
      this.doc.canvas = d.canvas;
      this.doc.name = d.name;
      this.defs.innerHTML = d.defs;
      this.art.innerHTML = d.body;
      this.selected = [];
      this.applyCanvas();
      this.changed("history");
    }
    undo() {
      if (this.undoStack.length > 1) {
        this.redoStack.push(this.undoStack.pop());
        this.restoreSnapshot(this.undoStack.at(-1));
      }
    }
    redo() {
      if (this.redoStack.length) {
        const s = this.redoStack.pop();
        this.undoStack.push(s);
        this.restoreSnapshot(s);
      }
    }
    applyCanvas() {
      const { width: w, height: h, background } = this.doc.canvas;
      this.stage.setAttribute("viewBox", `0 0 ${w} ${h}`);
      this.stage.setAttribute("width", w);
      this.stage.setAttribute("height", h);
      for (const id of ["background", "grid"]) {
        $(id).setAttribute("width", w);
        $(id).setAttribute("height", h);
      }
      $("background").setAttribute("fill", background);
      $("canvas-width").value = w;
      $("canvas-height").value = h;
      $("canvas-background").value = background;
      $("canvas-title").textContent = `${w} × ${h} px`;
      $("document-info").textContent = `${w} × ${h} · SVG · v${SF.version}`;
      this.fit();
    }
    fit() {
      if (!this.doc) return;
      const z = $("zoom").value;
      const area = $("workarea");
      this.zoom =
        z === "fit"
          ? clamp(
              Math.min(
                (area.clientWidth - 90) / this.doc.canvas.width,
                (area.clientHeight - 110) / this.doc.canvas.height,
              ),
              0.08,
              1.4,
            )
          : clamp(Number(z), 0.08, 5);
      this.stage.style.width = this.doc.canvas.width * this.zoom + "px";
      this.stage.style.height = this.doc.canvas.height * this.zoom + "px";
      this.drawSelection();
    }
    setZoom(z) {
      z = clamp(z, 0.08, 5);
      let opt = [...$("zoom").options].find((o) => Number(o.value) === z);
      if (!opt) {
        opt = new Option(Math.round(z * 100) + "%", z);
        opt.dataset.custom = "1";
        $("zoom").querySelector("[data-custom]")?.remove();
        $("zoom").add(opt);
      }
      $("zoom").value = String(z);
      this.fit();
    }
    select(nodes) {
      this.selected = [...new Set(nodes)].filter(
        (n) => n.parentElement === this.art,
      );
      this.render();
      SF.emit("selection:changed", {
        ids: this.selected.map((n) => n.dataset.item),
      });
    }
    editable() {
      return this.selected.filter(
        (n) => n.dataset.locked !== "true" && n.dataset.hidden !== "true",
      );
    }
    drawSelection() {
      this.overlay.replaceChildren();
      const nodes = this.selected.filter((n) => n.dataset.hidden !== "true");
      if (!nodes.length) return;
      for (const n of nodes) {
        const b = geometry(n);
        this.overlay.append(
          S("rect", {
            x: b.x - 2 / this.zoom,
            y: b.y - 2 / this.zoom,
            width: Math.max(b.width, 0.1) + 4 / this.zoom,
            height: Math.max(b.height, 0.1) + 4 / this.zoom,
            class: "selection-box",
            "stroke-dasharray": n.dataset.locked === "true" ? "4 4" : "",
          }),
        );
      }
      const active = this.editable();
      if (!active.length) return;
      const b = union(active),
        size = 8 / this.zoom;
      const hs = [
        ["resize-nw", b.x, b.y, "nwse-resize"],
        ["resize-ne", b.x + b.width, b.y, "nesw-resize"],
        ["resize-se", b.x + b.width, b.y + b.height, "nwse-resize"],
        ["resize-sw", b.x, b.y + b.height, "nesw-resize"],
      ];
      for (const [name, x, y, cursor] of hs) {
        const r = S("rect", {
          x: x - size / 2,
          y: y - size / 2,
          width: size,
          height: size,
          rx: 1 / this.zoom,
          "data-handle": name,
          style: `cursor:${cursor}`,
        });
        r.append(S("title"));
        r.lastChild.textContent = "拖动缩放";
        this.overlay.append(r);
      }
      const cx = b.x + b.width / 2,
        cy = b.y - 30 / this.zoom;
      this.overlay.append(
        S("line", { x1: cx, y1: b.y, x2: cx, y2: cy, class: "rotation-stem" }),
      );
      const rotate = S("circle", {
        cx,
        cy,
        r: 10 / this.zoom,
        "data-handle": "rotate",
      });
      const title = S("title");
      title.textContent = "拖动旋转 · Shift 按 15° 吸附";
      rotate.append(title);
      this.overlay.append(rotate);
      const symbol = S("text", {
        x: cx,
        y: cy + 4 / this.zoom,
        "text-anchor": "middle",
        "font-family": "Arial",
        "font-size": 15 / this.zoom,
        fill: "#fff",
        "pointer-events": "none",
      });
      symbol.textContent = "↻";
      this.overlay.append(symbol);
    }
    render() {
      this.drawSelection();
      $("undo").disabled = this.undoStack.length < 2;
      $("redo").disabled = !this.redoStack.length;
      const n = this.selected[0],
        count = this.selected.length;
      $("element-props").hidden = !n;
      $("canvas-props").hidden = !!n;
      $("selection-count").textContent = n ? count + " 个" : "画布";
      $("selection-info").textContent = n
        ? `已选择 ${count} 个元素${this.editable().length < count ? " · 含锁定/隐藏元素" : ""}`
        : `${this.art.children.length} 个元素 · 拖入素材开始绘图`;
      $("layer-count").textContent = `(${this.art.children.length})`;
      $("project-name").value = this.doc.name;
      if (n) {
        $("prop-name").textContent =
          count > 1 ? `选择了 ${count} 个元素` : n.dataset.name || "图形";
        const t =
          count === 1 && n.dataset.kind === "text"
            ? n.querySelector("text")
            : null;
        $("text-props").hidden = !t;
        if (t) {
          $("prop-text").value = textValue(t);
          $("prop-fontsize").value = t.getAttribute("font-size") || 18;
          $("prop-weight").value = t.getAttribute("font-weight") || 400;
          $("prop-anchor").value = t.getAttribute("text-anchor") || "start";
        }
        const b = union(
          this.selected.filter((n) => n.dataset.hidden !== "true").length
            ? this.selected.filter((n) => n.dataset.hidden !== "true")
            : [n],
        );
        for (const [key, v] of Object.entries(b))
          $("prop-" + key).value = Math.round(v * 10) / 10;
        $("prop-rotation").value =
          Math.round(
            ((Math.atan2(matrix(n).b, matrix(n).a) * 180) / Math.PI) * 10,
          ) / 10;
        $("prop-opacity").value = Math.round(
          Number(n.getAttribute("opacity") || 1) * 100,
        );
        for (const attr of ["fill", "stroke"]) {
          const value =
            n
              .querySelector(`[${attr}]:not([${attr}="none"])`)
              ?.getAttribute(attr) || "#102f54";
          $("prop-" + attr).value = /^#[0-9a-f]{6}$/i.test(value)
            ? value
            : "#102f54";
        }
        $("prop-strokewidth").value =
          n.querySelector("[stroke-width]")?.getAttribute("stroke-width") || 1;
        $("prop-dash").value =
          n
            .querySelector("[stroke-dasharray]")
            ?.getAttribute("stroke-dasharray") || "";
      }
      this.renderLayers();
    }
    renderLayers() {
      const q = $("layer-search").value.toLowerCase().trim(),
        fragment = document.createDocumentFragment();
      [...this.art.children]
        .reverse()
        .filter((n) => !q || (n.dataset.name || "").toLowerCase().includes(q))
        .forEach((n) => {
          const row = document.createElement("div");
          row.className =
            "layer-row" +
            (this.selected.includes(n) ? " active" : "") +
            (n.dataset.hidden === "true" ? " hidden-layer" : "");
          const vis = document.createElement("button");
          vis.className = "layer-visibility";
          vis.textContent = n.dataset.hidden === "true" ? "◌" : "◉";
          vis.title = "显示 / 隐藏";
          vis.onclick = () => {
            this.toggleHidden(n);
          };
          const lock = document.createElement("button");
          lock.className = "layer-lock";
          lock.textContent = n.dataset.locked === "true" ? "▣" : "◇";
          lock.title = "锁定 / 解锁";
          lock.onclick = () => {
            n.dataset.locked = n.dataset.locked === "true" ? "false" : "true";
            this.commit("lock");
          };
          const name = document.createElement("button");
          name.className = "layer-name";
          name.textContent =
            (n.dataset.kind === "text" ? "T  " : "") +
            (n.dataset.name || "图形");
          name.title = n.dataset.name || "图形";
          name.onclick = (e) =>
            this.select(
              e.shiftKey
                ? this.selected.includes(n)
                  ? this.selected.filter((a) => a !== n)
                  : [...this.selected, n]
                : [n],
            );
          row.append(vis, lock, name);
          fragment.append(row);
        });
      $("layers").replaceChildren(fragment);
    }
    point(e) {
      return new DOMPoint(e.clientX, e.clientY).matrixTransform(
        this.stage.getScreenCTM().inverse(),
      );
    }
    topItem(target) {
      let n = target.closest?.("[data-item]");
      while (n && n.parentElement !== this.art)
        n = n.parentElement.closest("[data-item]");
      return n;
    }
    beginPointer(e) {
      if (e.button !== 0 || this.space) return;
      const p = this.point(e),
        handle = e.target.dataset.handle;
      const active = this.editable();
      if (handle && active.length) {
        const b = union(active),
          c = center(b);
        this.drag = {
          mode: handle === "rotate" ? "rotate" : "resize",
          handle,
          start: p,
          b,
          c,
          items: active.map((n) => ({ n, m: matrix(n) })),
          moved: false,
          lastAngle: Math.atan2(p.y - c.y, p.x - c.x),
          angle: 0,
        };
        this.stage.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      const n = this.topItem(e.target);
      if (n && n.dataset.locked !== "true") {
        if (e.shiftKey) {
          this.select(
            this.selected.includes(n)
              ? this.selected.filter((s) => s !== n)
              : [...this.selected, n],
          );
          return;
        }
        if (!this.selected.includes(n)) this.select([n]);
        this.drag = {
          mode: "move",
          start: p,
          b: union(this.editable()),
          items: this.editable().map((n) => ({ n, m: matrix(n) })),
          moved: false,
        };
      } else if (!n) {
        const initial = e.shiftKey ? [...this.selected] : [];
        if (!e.shiftKey) this.select([]);
        this.drag = { mode: "marquee", start: p, initial, moved: false };
      } else return;
      this.stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    snapDelta(dx, dy, b) {
      if (!$("snap").checked) return { dx, dy };
      const threshold = 6 / this.zoom;
      const grid = Number($("grid-size").value) || 10;
      let out = { dx, dy },
        bestX = threshold,
        bestY = threshold;
      const movingX = [b.x + dx, b.x + b.width / 2 + dx, b.x + b.width + dx],
        movingY = [b.y + dy, b.y + b.height / 2 + dy, b.y + b.height + dy];
      const targetsX = [0, this.doc.canvas.width / 2, this.doc.canvas.width],
        targetsY = [0, this.doc.canvas.height / 2, this.doc.canvas.height];
      for (const n of this.art.children) {
        if (this.selected.includes(n) || n.dataset.hidden === "true") continue;
        const g = geometry(n);
        targetsX.push(g.x, g.x + g.width / 2, g.x + g.width);
        targetsY.push(g.y, g.y + g.height / 2, g.y + g.height);
      }
      let gx = null,
        gy = null;
      for (const a of movingX)
        for (const t of targetsX) {
          const d = t - a;
          if (Math.abs(d) < bestX) {
            bestX = Math.abs(d);
            out.dx = dx + d;
            gx = t;
          }
        }
      for (const a of movingY)
        for (const t of targetsY) {
          const d = t - a;
          if (Math.abs(d) < bestY) {
            bestY = Math.abs(d);
            out.dy = dy + d;
            gy = t;
          }
        }
      if (gx === null) out.dx = Math.round((b.x + dx) / grid) * grid - b.x;
      if (gy === null) out.dy = Math.round((b.y + dy) / grid) * grid - b.y;
      if (gx !== null)
        this.guides.append(
          S("line", {
            x1: gx,
            y1: 0,
            x2: gx,
            y2: this.doc.canvas.height,
            stroke: "#e276a1",
            "stroke-width": 1 / this.zoom,
            "stroke-dasharray": `${4 / this.zoom} ${4 / this.zoom}`,
          }),
        );
      if (gy !== null)
        this.guides.append(
          S("line", {
            x1: 0,
            y1: gy,
            x2: this.doc.canvas.width,
            y2: gy,
            stroke: "#e276a1",
            "stroke-width": 1 / this.zoom,
            "stroke-dasharray": `${4 / this.zoom} ${4 / this.zoom}`,
          }),
        );
      return out;
    }
    movePointer(e) {
      if (!this.drag) return;
      const d = this.drag,
        p = this.point(e);
      let dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      this.guides.replaceChildren();
      if (Math.abs(dx) + Math.abs(dy) > 1 / this.zoom) d.moved = true;
      if (!d.moved) return;
      if (d.mode === "move") {
        if (!e.altKey) ({ dx, dy } = this.snapDelta(dx, dy, d.b));
        for (const s of d.items)
          setMatrix(s.n, new DOMMatrix().translate(dx, dy).multiply(s.m));
      } else if (d.mode === "rotate") {
        const angle = Math.atan2(p.y - d.c.y, p.x - d.c.x);
        let delta = angle - d.lastAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        d.angle += delta;
        d.lastAngle = angle;
        let degrees = (d.angle * 180) / Math.PI;
        if (e.shiftKey) degrees = Math.round(degrees / 15) * 15;
        const m = around(d.c.x, d.c.y, new DOMMatrix().rotate(degrees));
        d.items.forEach((s) => setMatrix(s.n, m.multiply(s.m)));
        $("selection-info").textContent =
          `旋转 ${degrees.toFixed(1)}° · Shift 按 15° 吸附`;
        if (Math.abs(degrees) > 0.01) d.moved = true;
      } else if (d.mode === "resize") {
        const west = d.handle.endsWith("nw") || d.handle.endsWith("sw"),
          north = d.handle.endsWith("nw") || d.handle.endsWith("ne"),
          anchor = {
            x: west ? d.b.x + d.b.width : d.b.x,
            y: north ? d.b.y + d.b.height : d.b.y,
          };
        let fx = 1 + (west ? -dx : dx) / Math.max(1, d.b.width),
          fy = 1 + (north ? -dy : dy) / Math.max(1, d.b.height);
        if ($("aspect").checked !== e.shiftKey)
          fx = fy = Math.abs(dx) > Math.abs(dy) ? fx : fy;
        fx = Math.max(0.02, fx);
        fy = Math.max(0.02, fy);
        const m = around(anchor.x, anchor.y, new DOMMatrix().scale(fx, fy));
        d.items.forEach((s) => setMatrix(s.n, m.multiply(s.m)));
      } else if (d.mode === "marquee") {
        const b = {
          x: Math.min(d.start.x, p.x),
          y: Math.min(d.start.y, p.y),
          width: Math.abs(dx),
          height: Math.abs(dy),
        };
        this.guides.append(
          S("rect", {
            ...b,
            fill: "#40abc321",
            stroke: "#35afc6",
            "stroke-width": 1 / this.zoom,
          }),
        );
        const nodes = [...this.art.children].filter((n) => {
          if (n.dataset.locked === "true" || n.dataset.hidden === "true")
            return false;
          const g = geometry(n);
          return (
            g.x >= b.x &&
            g.y >= b.y &&
            g.x + g.width <= b.x + b.width &&
            g.y + g.height <= b.y + b.height
          );
        });
        this.selected = [...new Set([...d.initial, ...nodes])];
      }
      this.drawSelection();
    }
    endPointer() {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      this.guides.replaceChildren();
      if (d.moved && d.mode !== "marquee") this.commit(d.mode);
      else this.render();
    }
    addItem(name, markup, kind = "icon", at) {
      const n = S("g");
      Object.assign(n.dataset, { item: SF.uid("item"), name, kind });
      n.innerHTML = markup;
      this.art.append(n);
      const b = n.getBBox();
      const p = at || {
        x: this.doc.canvas.width / 2,
        y: this.doc.canvas.height / 2,
      };
      setMatrix(
        n,
        new DOMMatrix().translate(
          p.x - b.x - b.width / 2,
          p.y - b.y - b.height / 2,
        ),
      );
      this.select([n]);
      this.commit("add");
      return n;
    }
    addAsset(asset, at) {
      const sanitized = SF.SVG.normalize(asset.svg, SF.uid("svg"));
      const parser = new DOMParser().parseFromString(
        sanitized.svg,
        "image/svg+xml",
      );
      const svg = parser.documentElement;
      svg.setAttribute("width", sanitized.width);
      svg.setAttribute("height", sanitized.height);
      const wrapper = this.addItem(
        asset.name || "导入素材",
        new XMLSerializer().serializeToString(svg),
        "icon",
        at,
      );
      const b = geometry(wrapper),
        limit = Math.min(this.doc.canvas.width, this.doc.canvas.height) * 0.28;
      if (Math.max(b.width, b.height) > limit) {
        const c = center(b),
          s = limit / Math.max(b.width, b.height);
        setMatrix(
          wrapper,
          around(c.x, c.y, new DOMMatrix().scale(s)).multiply(matrix(wrapper)),
        );
        this.undoStack.pop();
        this.commit("add");
      }
      return wrapper;
    }
    remove() {
      const n = this.editable();
      if (!n.length) return;
      for (const el of n) el.remove();
      this.selected = this.selected.filter((x) => !n.includes(x));
      this.commit("delete");
    }
    copy() {
      this.clipboard = {
        body: this.editable().map((n) => n.outerHTML),
        defs: this.defs.innerHTML,
      };
      SF.status("已复制到软件内部剪贴板");
    }
    paste() {
      if (!this.clipboard?.body.length) return;
      const prefix = SF.uid("paste");
      const raw = `<defs>${this.clipboard.defs}</defs><g>${this.clipboard.body.join("")}</g>`;
      const g = S("g");
      g.innerHTML = SF.SVG.rekey(raw, prefix);
      const definitions = g.querySelector("defs");
      if (definitions) this.defs.append(...definitions.childNodes);
      const container = g.lastElementChild;
      const out = [];
      for (const node of [...container.children]) {
        node.dataset.item = SF.uid("item");
        setMatrix(
          node,
          new DOMMatrix().translate(18, 18).multiply(matrix(node)),
        );
        this.art.append(node);
        out.push(node);
      }
      this.selected = out;
      this.commit("paste");
    }
    duplicate() {
      this.clipboard = {
        body: this.editable().map((n) => n.outerHTML),
        defs: this.defs.innerHTML,
      };
      this.paste();
    }
    group() {
      const active = this.editable();
      if (active.length < 2) return SF.status("请先 Shift 多选至少两个元素");
      const g = S("g");
      Object.assign(g.dataset, {
        item: SF.uid("group"),
        name: "组合",
        kind: "group",
      });
      this.art.insertBefore(g, active[0]);
      [...this.art.children]
        .filter((n) => active.includes(n))
        .forEach((n) => g.append(n));
      this.selected = [g];
      this.commit("group");
    }
    ungroup() {
      const active = this.editable();
      if (active.length !== 1) return SF.status("请先选择一个组合或图标");
      const n = active[0];
      let container = n;
      let children = [...container.children].filter(
        (c) => !["defs", "title", "desc"].includes(c.tagName),
      );
      while (
        children.length === 1 &&
        ["g", "svg"].includes(children[0].tagName)
      ) {
        container = children[0];
        children = [...container.children].filter(
          (c) => !["defs", "title", "desc"].includes(c.tagName),
        );
      }
      if (children.length < 2) return SF.status("这个元素已经是单一图形");
      const origin = this.art.getCTM().inverse().multiply(container.getCTM());
      const inherited = [];
      for (
        let cursor = container;
        cursor && cursor !== this.art;
        cursor = cursor.parentElement
      )
        inherited.unshift(cursor);
      const newNodes = [];
      for (const child of children) {
        const wrapper = S("g");
        Object.assign(wrapper.dataset, {
          item: SF.uid("item"),
          name: child.dataset.name || child.dataset.part || "拆分图形",
          kind:
            child.dataset.kind || (child.tagName === "text" ? "text" : "icon"),
        });
        setMatrix(wrapper, origin);
        let target = wrapper;
        for (const ancestor of inherited) {
          const layer = S("g");
          for (const a of ancestor.attributes)
            if (
              ![
                "id",
                "transform",
                "x",
                "y",
                "width",
                "height",
                "viewBox",
                "xmlns",
              ].includes(a.name) &&
              !a.name.startsWith("data-")
            )
              layer.setAttribute(a.name, a.value);
          target.append(layer);
          target = layer;
        }
        const content = child.cloneNode(true);
        content.querySelectorAll("defs").forEach((d) => d.remove());
        target.append(content);
        this.art.insertBefore(wrapper, n);
        newNodes.push(wrapper);
      }
      for (const d of n.querySelectorAll("defs"))
        this.defs.append(...[...d.children].map((x) => x.cloneNode(true)));
      n.remove();
      this.selected = newNodes;
      this.commit("ungroup");
    }
    setText(n, value) {
      const t = n.querySelector("text");
      if (!t) return;
      t.replaceChildren();
      const lines = value.split("\n");
      if (lines.length === 1) t.textContent = value;
      else
        lines.forEach((line, i) => {
          const span = S("tspan", {
            x: t.getAttribute("x") || 0,
            dy: i ? "1.25em" : "0",
          });
          span.textContent = line || " ";
          t.append(span);
        });
      n.dataset.name = lines.join(" ").slice(0, 160) || "文字";
    }
    editText(n) {
      if (n?.dataset.kind !== "text" || n.dataset.locked === "true") return;
      $("text-edit-value").value = textValue(n.querySelector("text"));
      SF.openDialog("text-dialog");
      $("text-edit-value").focus();
      $("text-edit-value").select();
      $("text-edit-apply").onclick = () => {
        this.setText(n, $("text-edit-value").value);
        $("text-dialog").close();
        this.commit("text");
      };
    }
    toggleHidden(n) {
      n.dataset.hidden = n.dataset.hidden === "true" ? "false" : "true";
      if (n.dataset.hidden === "true") n.setAttribute("display", "none");
      else n.removeAttribute("display");
      this.commit("visibility");
    }
    alignment(action) {
      const nodes = this.editable();
      if (!nodes.length) return;
      const b =
        nodes.length === 1
          ? {
              x: 0,
              y: 0,
              width: this.doc.canvas.width,
              height: this.doc.canvas.height,
            }
          : union(nodes);
      if (action.startsWith("distribute")) {
        if (nodes.length < 3) return SF.status("等距分布需要至少三个元素");
        const horizontal = action === "distribute-h",
          key = horizontal ? "x" : "y",
          dim = horizontal ? "width" : "height";
        const list = nodes
          .map((n) => ({ n, b: geometry(n) }))
          .sort((a, b) => a.b[key] - b.b[key]);
        const total = list.reduce((s, x) => s + x.b[dim], 0),
          gap = (b[dim] - total) / (list.length - 1);
        let cursor = b[key];
        for (const s of list) {
          const delta = cursor - s.b[key];
          setMatrix(
            s.n,
            new DOMMatrix()
              .translate(horizontal ? delta : 0, horizontal ? 0 : delta)
              .multiply(matrix(s.n)),
          );
          cursor += s.b[dim] + gap;
        }
      } else
        for (const n of nodes) {
          const g = geometry(n);
          let dx = 0,
            dy = 0;
          if (action === "left") dx = b.x - g.x;
          if (action === "hcenter") dx = b.x + b.width / 2 - g.x - g.width / 2;
          if (action === "right") dx = b.x + b.width - g.x - g.width;
          if (action === "top") dy = b.y - g.y;
          if (action === "vcenter")
            dy = b.y + b.height / 2 - g.y - g.height / 2;
          if (action === "bottom") dy = b.y + b.height - g.y - g.height;
          setMatrix(n, new DOMMatrix().translate(dx, dy).multiply(matrix(n)));
        }
      this.commit("align");
    }
    recolor(n, attr, color) {
      const cache = new Map();
      n.querySelectorAll(
        "path,circle,ellipse,rect,polygon,polyline,line,text,tspan,use",
      ).forEach((s) => {
        const old = s.style.getPropertyValue(attr) || s.getAttribute(attr);
        if (
          old === "none" ||
          (attr === "stroke" &&
            !s.hasAttribute("stroke") &&
            !s.style.getPropertyValue("stroke"))
        )
          return;
        s.style.removeProperty(attr);
        if (attr === "fill" && old?.startsWith("url(")) {
          const id = old.match(/#([^)]*)/)?.[1];
          const gradient = id
            ? [...this.stage.querySelectorAll("[id]")].find((d) => d.id === id)
            : null;
          if (
            gradient &&
            ["linearGradient", "radialGradient"].includes(gradient.tagName)
          ) {
            let newId = cache.get(id);
            if (!newId) {
              const copy = gradient.cloneNode(true);
              newId = copy.id = SF.uid("gradient");
              copy.querySelectorAll("stop").forEach((stop, i) => {
                const mix = i === 0 ? 0.65 : 0;
                const c =
                  "#" +
                  [1, 3, 5]
                    .map((k) =>
                      Math.round(
                        parseInt(color.slice(k, k + 2), 16) * (1 - mix) +
                          255 * mix,
                      )
                        .toString(16)
                        .padStart(2, "0"),
                    )
                    .join("");
                stop.style.removeProperty("stop-color");
                stop.setAttribute("stop-color", c);
              });
              this.defs.append(copy);
              cache.set(id, newId);
            }
            s.setAttribute(attr, `url(#${newId})`);
            return;
          }
        }
        s.setAttribute(attr, color);
      });
    }
    exportSVG() {
      const svg = this.stage.cloneNode(true);
      svg.removeAttribute("id");
      svg.removeAttribute("style");
      svg.setAttribute("xmlns", NS);
      for (const id of ["ui-defs", "grid", "guides", "selection"])
        svg.querySelector("#" + id)?.remove();
      return new XMLSerializer().serializeToString(svg);
    }
    async exportPNG() {
      const z = Number($("png-scale").value),
        w = this.doc.canvas.width * z,
        h = this.doc.canvas.height * z;
      if (w * h > 50000000)
        throw new Error("导出像素超过 5000 万，请降低倍率或画布尺寸");
      await document.fonts.ready;
      const url = URL.createObjectURL(
        new Blob([this.exportSVG()], { type: "image/svg+xml;charset=utf-8" }),
      );
      try {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("SVG 无法转换为 PNG"));
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = this.doc.canvas.background;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("PNG 编码失败");
        SF.download(blob, this.doc.name + `-${z}x.png`, "image/png");
        SF.status(`已导出 ${w} × ${h} PNG`);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    bind() {
      const stage = this.stage;
      stage.addEventListener("pointerdown", (e) => this.beginPointer(e));
      stage.addEventListener("pointermove", (e) => this.movePointer(e));
      stage.addEventListener("pointerup", () => this.endPointer());
      stage.addEventListener("pointercancel", () => this.endPointer());
      stage.addEventListener("dblclick", (e) =>
        this.editText(
          this.topItem(e.target) ||
            (this.selected.length === 1 ? this.selected[0] : null),
        ),
      );
      const actions = {
        undo: () => this.undo(),
        redo: () => this.redo(),
        duplicate: () => this.duplicate(),
        delete: () => this.remove(),
        group: () => this.group(),
        ungroup: () => this.ungroup(),
      };
      Object.entries(actions).forEach(([id, fn]) => ($(id).onclick = fn));
      $("add-text").onclick = () =>
        this.addItem(
          "新增文字",
          '<text x="0" y="0" font-size="24" font-weight="500" text-anchor="middle" fill="#173b59">双击编辑文字</text>',
          "text",
        );
      $("add-rect").onclick = () =>
        this.addItem(
          "矩形",
          '<rect width="140" height="90" rx="6" fill="#d9edf2" stroke="#6797a9" stroke-width="1.5"/>',
          "shape",
        );
      $("add-ellipse").onclick = () =>
        this.addItem(
          "圆形",
          '<ellipse cx="0" cy="0" rx="48" ry="48" fill="#d9edf2" stroke="#6797a9" stroke-width="1.5"/>',
          "shape",
        );
      $("add-arrow").onclick = () =>
        this.addItem(
          "箭头",
          '<path d="M0 0 H104 M94 -7 104 0 94 7" fill="none" stroke="#173b59" stroke-width="2" stroke-linejoin="round"/>',
          "line",
        );
      $("prop-text").onchange = (e) => {
        const n = this.editable()[0];
        if (n) {
          this.setText(n, e.target.value);
          this.commit("text");
        }
      };
      for (const [id, attr] of [
        ["fontsize", "font-size"],
        ["weight", "font-weight"],
        ["anchor", "text-anchor"],
      ])
        $("prop-" + id).onchange = (e) => {
          this.editable().forEach((n) =>
            n.querySelectorAll("text").forEach((t) => {
              t.style.removeProperty(attr);
              t.setAttribute(attr, e.target.value);
            }),
          );
          this.commit("text-style");
        };
      for (const axis of ["x", "y"])
        $("prop-" + axis).onchange = (e) => {
          const nodes = this.editable();
          if (!nodes.length) return;
          const b = union(nodes),
            value = Number(e.target.value);
          if (!Number.isFinite(value)) return;
          const dx = axis === "x" ? value - b.x : 0,
            dy = axis === "y" ? value - b.y : 0;
          nodes.forEach((n) =>
            setMatrix(n, new DOMMatrix().translate(dx, dy).multiply(matrix(n))),
          );
          this.commit("position");
        };
      for (const axis of ["width", "height"])
        $("prop-" + axis).onchange = (e) => {
          const nodes = this.editable();
          if (!nodes.length) return;
          const b = union(nodes),
            value = Number(e.target.value);
          if (!Number.isFinite(value) || value <= 0) return;
          const factor = value / Math.max(0.001, b[axis]),
            x = axis === "width" || $("aspect").checked ? factor : 1,
            y = axis === "height" || $("aspect").checked ? factor : 1;
          const m = around(b.x, b.y, new DOMMatrix().scale(x, y));
          nodes.forEach((n) => setMatrix(n, m.multiply(matrix(n))));
          this.commit("resize");
        };
      $("prop-rotation").onchange = (e) => {
        const nodes = this.editable();
        if (!nodes.length) return;
        const target = Number(e.target.value);
        if (!Number.isFinite(target)) return;
        const m = matrix(nodes[0]),
          delta = target - (Math.atan2(m.b, m.a) * 180) / Math.PI,
          c = center(union(nodes)),
          r = around(c.x, c.y, new DOMMatrix().rotate(delta));
        nodes.forEach((n) => setMatrix(n, r.multiply(matrix(n))));
        this.commit("rotation");
      };
      $("prop-opacity").onchange = (e) => {
        this.editable().forEach((n) =>
          n.setAttribute("opacity", clamp(Number(e.target.value) / 100, 0, 1)),
        );
        this.commit("opacity");
      };
      for (const attr of ["fill", "stroke"])
        $("prop-" + attr).onchange = (e) => {
          this.editable().forEach((n) => this.recolor(n, attr, e.target.value));
          this.commit("color");
        };
      $("prop-strokewidth").onchange = (e) => {
        this.editable().forEach((n) =>
          n.querySelectorAll('[stroke],[style*="stroke"]').forEach((s) => {
            s.style.removeProperty("stroke-width");
            s.setAttribute("stroke-width", Math.max(0, Number(e.target.value)));
          }),
        );
        this.commit("stroke");
      };
      $("prop-dash").onchange = (e) => {
        this.editable().forEach((n) =>
          n.querySelectorAll('[stroke],[style*="stroke"]').forEach((s) => {
            s.style.removeProperty("stroke-dasharray");
            s.setAttribute("stroke-dasharray", e.target.value);
          }),
        );
        this.commit("dash");
      };
      for (const action of ["front", "back", "forward", "backward"])
        $(action).onclick = () => {
          const nodes = [...this.art.children].filter((n) =>
            this.editable().includes(n),
          );
          if (action === "back" || action === "forward") nodes.reverse();
          for (const n of nodes) {
            if (action === "front") this.art.append(n);
            if (action === "back") this.art.prepend(n);
            if (action === "forward" && n.nextElementSibling)
              this.art.insertBefore(n.nextElementSibling, n);
            if (action === "backward" && n.previousElementSibling)
              this.art.insertBefore(n, n.previousElementSibling);
          }
          this.commit("order");
        };
      $("lock").onclick = () => {
        const locked = this.selected.every((n) => n.dataset.locked === "true");
        this.selected.forEach(
          (n) => (n.dataset.locked = locked ? "false" : "true"),
        );
        this.commit("lock");
      };
      $("hide").onclick = () => {
        this.editable().forEach((n) => {
          n.dataset.hidden = "true";
          n.setAttribute("display", "none");
        });
        this.commit("visibility");
      };
      $("layer-search").oninput = () => this.renderLayers();
      $("align-action").onchange = (e) => {
        if (e.target.value) this.alignment(e.target.value);
        e.target.value = "";
      };
      for (const key of ["width", "height"])
        $("canvas-" + key).onchange = (e) => {
          const value = Number(e.target.value);
          if (!Number.isFinite(value) || value < 64 || value > 12000) {
            e.target.value = this.doc.canvas[key];
            return SF.status("画布尺寸须为 64–12000", true);
          }
          this.doc.canvas[key] = value;
          this.applyCanvas();
          this.commit("canvas");
        };
      $("canvas-background").onchange = (e) => {
        this.doc.canvas.background = e.target.value;
        this.applyCanvas();
        this.commit("canvas");
      };
      $("grid-toggle").onchange = (e) =>
        $("grid").setAttribute("display", e.target.checked ? "inline" : "none");
      $("grid-size").onchange = (e) => {
        const size = clamp(Number(e.target.value) || 10, 2, 200);
        e.target.value = size;
        const p = $("ui-grid-pattern");
        p.setAttribute("width", size);
        p.setAttribute("height", size);
        p.firstElementChild.setAttribute("d", `M${size} 0H0V${size}`);
      };
      $("zoom").onchange = () => this.fit();
      $("zoom-in").onclick = () => this.setZoom(this.zoom * 1.25);
      $("zoom-out").onclick = () => this.setZoom(this.zoom / 1.25);
      new ResizeObserver(() => this.fit()).observe($("workarea"));
      const area = $("workarea");
      let pan = null;
      area.addEventListener("pointerdown", (e) => {
        if (!this.space && e.button !== 1) return;
        e.preventDefault();
        pan = {
          x: e.clientX,
          y: e.clientY,
          left: area.scrollLeft,
          top: area.scrollTop,
        };
        area.setPointerCapture(e.pointerId);
        area.style.cursor = "grabbing";
      });
      area.addEventListener("pointermove", (e) => {
        if (pan) {
          area.scrollLeft = pan.left + pan.x - e.clientX;
          area.scrollTop = pan.top + pan.y - e.clientY;
        }
      });
      const endPan = () => {
        pan = null;
        area.style.cursor = this.space ? "grab" : "";
      };
      area.addEventListener("pointerup", endPan);
      area.addEventListener("pointercancel", endPan);
      area.addEventListener(
        "wheel",
        (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
          }
        },
        { passive: false },
      );
      document.addEventListener("keydown", (e) => {
        if (
          ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
          document.querySelector("dialog[open]")
        )
          return;
        const ctrl = e.ctrlKey || e.metaKey,
          k = e.key.toLowerCase();
        if (e.code === "Space") {
          e.preventDefault();
          this.space = true;
          area.style.cursor = "grab";
          return;
        }
        if (ctrl && k === "z") {
          e.preventDefault();
          e.shiftKey ? this.redo() : this.undo();
        } else if (ctrl && k === "y") {
          e.preventDefault();
          this.redo();
        } else if (ctrl && k === "d") {
          e.preventDefault();
          this.duplicate();
        } else if (ctrl && k === "c") {
          e.preventDefault();
          this.copy();
        } else if (ctrl && k === "v") {
          e.preventDefault();
          this.paste();
        } else if (ctrl && k === "a") {
          e.preventDefault();
          this.select(
            [...this.art.children].filter(
              (n) => n.dataset.locked !== "true" && n.dataset.hidden !== "true",
            ),
          );
        } else if (ctrl && k === "s") {
          e.preventDefault();
          $("save-project").click();
        } else if (k === "delete" || k === "backspace") {
          e.preventDefault();
          this.remove();
        } else if (k === "escape") {
          this.select([]);
        } else if (e.key.startsWith("Arrow") && this.editable().length) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1,
            dx =
              e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
            dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
          this.editable().forEach((n) =>
            setMatrix(n, new DOMMatrix().translate(dx, dy).multiply(matrix(n))),
          );
          this.commit("nudge");
        }
      });
      document.addEventListener("keyup", (e) => {
        if (e.code === "Space") {
          this.space = false;
          area.style.cursor = "";
        }
      });
      window.addEventListener("blur", () => {
        this.space = false;
        pan = null;
        this.endPointer();
        area.style.cursor = "";
      });
      SF.registerExporter("svg", () => {
        SF.download(
          this.exportSVG(),
          this.doc.name + ".svg",
          "image/svg+xml;charset=utf-8",
        );
        SF.status("已导出可编辑 SVG");
      });
      SF.registerExporter("png", () => this.exportPNG());
      for (const id of ["svg", "png"])
        $("export-" + id).onclick = async () => {
          const button = $("export-" + id);
          button.disabled = true;
          try {
            await SF.exporters.get(id)(this.getDocument());
          } catch (e) {
            SF.status(e.message, true);
          } finally {
            button.disabled = false;
          }
        };
    }
  }
  SF.Editor = Editor;
})();
