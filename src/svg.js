(function () {
  "use strict";
  const SF = (window.SF = window.SF || {});
  const NS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const MAX_SIZE = 8 * 1024 * 1024;
  const tags = new Set(
    "svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc linearGradient radialGradient stop clipPath mask pattern marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence image style".split(
      " ",
    ),
  );
  const active = new Set([
    "script",
    "foreignobject",
    "animate",
    "animatetransform",
    "animatemotion",
    "set",
    "discard",
    "iframe",
    "object",
    "embed",
    "audio",
    "video",
    "handler",
  ]);
  const properties = new Set(
    "fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color stop-color stop-opacity flood-color flood-opacity lighting-color clip-path clip-rule mask filter marker-start marker-mid marker-end font-family font-size font-style font-weight font-variant font-stretch letter-spacing word-spacing text-anchor text-decoration dominant-baseline alignment-baseline baseline-shift paint-order vector-effect shape-rendering text-rendering image-rendering visibility display overflow isolation".split(
      " ",
    ),
  );
  const attrs = new Set(
    "id class viewBox preserveAspectRatio width height x y x1 y1 x2 y2 cx cy r rx ry d points transform gradientTransform gradientUnits spreadMethod offset fx fy fr patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits markerUnits markerWidth markerHeight refX refY orient filterUnits primitiveUnits in in2 result type values operator k1 k2 k3 k4 mode stdDeviation dx dy scale xChannelSelector yChannelSelector edgeMode kernelMatrix kernelUnitLength order divisor bias targetX targetY preserveAlpha surfaceScale diffuseConstant specularConstant specularExponent limitingConeAngle azimuth elevation pointsAtX pointsAtY pointsAtZ z baseFrequency numOctaves seed stitchTiles amplitude exponent intercept slope tableValues lengthAdjust textLength startOffset method spacing rotate pathLength".split(
      " ",
    ),
  );
  let sequence = 0;
  const uid = () => "sf" + Date.now().toString(36) + (++sequence).toString(36);
  function fail(message) {
    throw new Error("SVG：" + message);
  }
  function parse(raw, fragment) {
    if (typeof raw !== "string" || !raw.trim()) fail("内容为空。");
    if (raw.length > MAX_SIZE) fail("单个文件超过 8 MB 限制。");
    if (/<!DOCTYPE|<!ENTITY/i.test(raw)) fail("不支持文档类型或实体声明。");
    const source = fragment
      ? '<svg xmlns="' + NS + '" xmlns:xlink="' + XLINK + '">' + raw + "</svg>"
      : raw;
    let doc = new DOMParser().parseFromString(source, "image/svg+xml");
    if (
      doc.querySelector("parsererror") ||
      doc.documentElement.localName !== "svg"
    )
      fail("文件不是有效的 SVG。");
    if (!doc.documentElement.namespaceURI) {
      doc.documentElement.setAttribute("xmlns", NS);
      doc = new DOMParser().parseFromString(
        new XMLSerializer().serializeToString(doc),
        "image/svg+xml",
      );
    }
    if (doc.documentElement.namespaceURI !== NS) fail("SVG 命名空间无效。");
    if (doc.getElementsByTagName("*").length > 50000)
      fail("元素过多（最多 50,000）。");
    return doc.documentElement;
  }
  function safeValue(value, name) {
    if (
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ||
      /(?:javascript|vbscript)\s*:|expression\s*\(|@import|\\/i.test(value)
    )
      fail("检测到不安全的样式或链接。");
    const stripped = value.replace(
      /url\(\s*(['"]?)#([A-Za-z0-9_.:-]+)\1\s*\)/gi,
      "",
    );
    if (/url\s*\(/i.test(stripped)) fail("不允许外部样式引用。");
    if (name === "font-family" && /[{}<>;]/.test(value)) fail("字体格式无效。");
    return value;
  }
  function declarations(text) {
    // The browser CSS parser handles numeric units, colors and malformed declarations.
    safeValue(text, "style");
    const style = document.createElement("span").style;
    style.cssText = text;
    const result = [];
    for (const name of style)
      if (properties.has(name)) {
        const value = safeValue(style.getPropertyValue(name), name);
        result.push([name, value, style.getPropertyPriority(name)]);
      }
    return result;
  }
  function clean(root) {
    const all = [root, ...root.querySelectorAll("*")];
    // Reject active content before removing unknown elements so hidden payloads fail too.
    for (const node of all) {
      if (active.has(node.localName.toLowerCase()))
        fail("包含脚本、动画或活动内容。");
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.localName)) fail("不允许事件处理代码。");
        if (attr.localName === "href") {
          const value = attr.value.trim();
          const local = /^#[A-Za-z0-9_.:-]+$/.test(value);
          const image =
            node.localName === "image" &&
            /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(
              value,
            );
          if (!local && !image) fail("不允许外部链接或外部图片。");
        }
      }
    }
    for (const node of all) {
      if (
        node !== root &&
        (!tags.has(node.localName) || node.namespaceURI !== NS)
      ) {
        node.remove();
        continue;
      }
      for (const attr of [...node.attributes]) {
        const name = attr.name;
        if (name === "xmlns" || name === "xmlns:xlink") continue;
        if (attr.localName === "href") continue;
        if (name === "style") {
          const list = declarations(attr.value);
          node.removeAttribute(name);
          for (const [key, value, priority] of list)
            node.style.setProperty(key, value, priority);
          continue;
        }
        if (properties.has(name)) {
          safeValue(attr.value, name);
          continue;
        }
        if (
          attrs.has(name) ||
          /^data-[a-z0-9-]+$/.test(name) ||
          name === "xml:space"
        )
          continue;
        node.removeAttributeNode(attr);
      }
    }
    // Resolve the supported CSS cascade inside this SVG. Styles never leak into the app.
    const cascade = new Map();
    for (const node of [root, ...root.querySelectorAll("*")]) {
      const values = new Map();
      for (const name of node.style)
        values.set(name, {
          value: node.style.getPropertyValue(name),
          important: node.style.getPropertyPriority(name) === "important",
          specificity: 1000000,
          order: 0,
        });
      cascade.set(node, values);
    }
    let order = 0;
    for (const sheet of [...root.querySelectorAll("style")]) {
      const css = sheet.textContent.replace(/\/\*[\s\S]*?\*\//g, "");
      safeValue(css, "style");
      if (/@|\\/.test(css)) fail("不支持外部字体或高级 CSS 规则。");
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      if (css.replace(/([^{}]+)\{([^{}]*)\}/g, "").trim())
        fail("样式表格式无效。");
      for (const rule of rules) {
        const values = declarations(rule[2]);
        order++;
        for (const selector of rule[1].split(",").map((s) => s.trim())) {
          if (!selector || !/^[a-zA-Z0-9_.#*\s>+~-]+$/.test(selector))
            fail("不支持此 CSS 选择器。");
          const specificity =
            (selector.match(/#[\w-]+/g) || []).length * 10000 +
            (selector.match(/\.[\w-]+/g) || []).length * 100 +
            (selector.replace(/[.#][\w-]+/g, "").match(/[a-zA-Z][\w-]*/g) || [])
              .length;
          let targets;
          try {
            targets = [...root.querySelectorAll(selector)];
            if (root.matches(selector)) targets.push(root);
          } catch (_) {
            fail("CSS 选择器无效。");
          }
          for (const node of targets)
            for (const [name, value, priority] of values) {
              const rules = cascade.get(node),
                previous = rules.get(name),
                important = priority === "important";
              if (
                !previous ||
                (important && !previous.important) ||
                (important === previous.important &&
                  (specificity > previous.specificity ||
                    (specificity === previous.specificity &&
                      order >= previous.order)))
              )
                rules.set(name, { value, important, specificity, order });
            }
        }
      }
      sheet.remove();
    }
    for (const [node, values] of cascade)
      for (const [name, rule] of values)
        node.style.setProperty(
          name,
          rule.value,
          rule.important ? "important" : "",
        );
    // Processing instructions, comments and unknown namespaces are never emitted.
    const walk = document.createTreeWalker(
      root,
      NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_COMMENT,
    );
    const remove = [];
    while (walk.nextNode()) remove.push(walk.currentNode);
    remove.forEach((n) => n.remove());
    root.setAttribute("xmlns", NS);
    return root;
  }
  function remap(root, prefix) {
    const base =
      String(prefix || uid()).replace(/[^A-Za-z0-9_-]/g, "_") || uid();
    const ids = new Map();
    for (const node of [root, ...root.querySelectorAll("[id]")])
      if (node.hasAttribute("id")) {
        const id = node.getAttribute("id");
        if (ids.has(id)) fail("同一文件包含重复 ID：" + id);
        ids.set(id, base + "_" + ids.size);
      }
    for (const node of [root, ...root.querySelectorAll("*")])
      for (const attr of [...node.attributes]) {
        if (attr.name === "id") {
          node.setAttribute("id", ids.get(attr.value));
          continue;
        }
        let value = attr.value.replace(
          /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi,
          (_, quote, id) =>
            "url(#" + (ids.get(id) || base + "_missing_" + id) + ")",
        );
        if (attr.localName === "href" && value.startsWith("#"))
          value =
            "#" +
            (ids.get(value.slice(1)) || base + "_missing_" + value.slice(1));
        if (attr.namespaceURI)
          node.setAttributeNS(attr.namespaceURI, attr.name, value);
        else node.setAttribute(attr.name, value);
      }
    return root;
  }
  const serialize = (root) => new XMLSerializer().serializeToString(root);
  function length(value) {
    const match = /^\s*(\d*\.?\d+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(
      value || "",
    );
    if (!match) return null;
    return (
      Number(match[1]) *
      { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[
        (match[2] || "px").toLowerCase()
      ]
    );
  }
  SF.SVG = {
    normalize(raw, prefix) {
      const root = clean(parse(raw, false));
      let box = (root.getAttribute("viewBox") || "")
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      const validBox =
        box.length === 4 &&
        box.every(Number.isFinite) &&
        box[2] > 0 &&
        box[3] > 0;
      if (root.hasAttribute("viewBox") && !validBox) fail("viewBox 尺寸无效。");
      const width =
        length(root.getAttribute("width")) || (validBox ? box[2] : 100);
      const height =
        length(root.getAttribute("height")) || (validBox ? box[3] : 100);
      if (
        ![width, height].every(
          (v) => Number.isFinite(v) && v > 0 && v <= 100000,
        )
      )
        fail("尺寸必须在 0–100,000 之间。");
      if (!validBox) box = [0, 0, width, height];
      root.setAttribute("viewBox", box.join(" "));
      root.setAttribute("width", width);
      root.setAttribute("height", height);
      remap(root, prefix);
      return { svg: serialize(root), width, height };
    },
    sanitizeFragment(raw, prefix) {
      if (raw === "") return "";
      const root = clean(parse(raw, true));
      if (prefix) remap(root, prefix);
      // Still reject ambiguous IDs even when retaining IDs for a project round trip.
      else {
        const ids = new Set();
        for (const node of root.querySelectorAll("[id]")) {
          const id = node.id;
          if (ids.has(id)) fail("重复 ID：" + id);
          ids.add(id);
        }
      }
      return [...root.childNodes].map(serialize).join("");
    },
    rekey(raw, prefix) {
      const isFull = /^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(raw);
      const root = remap(parse(raw, !isFull), prefix);
      return isFull
        ? serialize(root)
        : [...root.childNodes].map(serialize).join("");
    },
  };
})();
