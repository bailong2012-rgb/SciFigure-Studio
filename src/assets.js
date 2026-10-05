(function () {
  "use strict";
  const SF = (window.SF = window.SF || {});
  const PAGE_SIZE = 48;
  const MAX_PACK_SIZE = 128 * 1024 * 1024;
  let serial = 0;
  const newId = () =>
    "asset-" +
    (window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) +
        "-" +
        ++serial +
        "-" +
        Math.random().toString(36).slice(2));
  function text(value, field, fallback, max) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string" || value.length > max)
      throw new Error(field + "必须是长度不超过 " + max + " 的文字。");
    return value;
  }
  function record(raw, used) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("素材记录格式无效。");
    let id = text(raw.id, "素材编号", newId(), 250);
    if (!id || used.has(id)) id = newId();
    used.add(id);
    const name = text(raw.name, "名称", "未命名素材", 500).trim();
    if (!name) throw new Error("素材名称不能为空。");
    const tags = raw.tags === undefined ? [] : raw.tags;
    if (
      !Array.isArray(tags) ||
      tags.length > 64 ||
      tags.some((t) => typeof t !== "string" || t.length > 100)
    )
      throw new Error("标签必须是文字数组（最多 64 个，每个最多 100 字）。");
    if (raw.favorite !== undefined && typeof raw.favorite !== "boolean")
      throw new Error("收藏字段必须是布尔值。");
    const now = new Date().toISOString();
    const date = (value, field) => {
      if (value === undefined) return now;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        throw new Error(field + "无效。");
      return value;
    };
    const normalized = SF.SVG.normalize(raw.svg, id);
    return {
      id,
      name,
      category: text(raw.category, "分类", "未分类", 100),
      tags: [...tags],
      author: text(raw.author, "作者", "", 1000),
      source: text(raw.source, "来源", "", 2000),
      license: text(raw.license, "许可", "未声明", 2000),
      favorite: raw.favorite === true,
      createdAt: date(raw.createdAt, "创建日期"),
      updatedAt: date(raw.updatedAt, "更新日期"),
      ...normalized,
    };
  }
  function preparePack(pack, existingIds) {
    if (!pack || pack.format !== "scifigure-assets" || pack.version !== 1)
      throw new Error(
        "不支持的素材包格式或版本（需要 scifigure-assets 版本 1）。",
      );
    if (!Array.isArray(pack.assets) || pack.assets.length > 10000)
      throw new Error("素材包需包含素材数组，且不超过 10,000 条。");
    if (pack.name !== undefined) text(pack.name, "素材包名称", "", 500);
    const used = new Set(existingIds || []);
    return pack.assets.map((raw, i) => {
      try {
        return record(raw, used);
      } catch (error) {
        throw new Error("第 " + (i + 1) + " 个素材：" + error.message);
      }
    });
  }
  function element(tag, cls, label) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (label !== undefined) node.textContent = label;
    return node;
  }
  function button(label, id, callback) {
    const node = element("button", "", label);
    node.type = "button";
    if (id) node.id = id;
    if (callback) node.addEventListener("click", callback);
    return node;
  }
  function download(data, name, type) {
    if (SF.download) return SF.download(data, name, type);
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = element("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function installStyles() {
    if (document.getElementById("asset-styles")) return;
    const style = element("style");
    style.id = "asset-styles";
    style.textContent = `
      #asset-panel .asset-tools{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
      #asset-panel .asset-tools button{font-size:11px;padding:6px 8px}
      #asset-panel .asset-search{width:100%;box-sizing:border-box;margin-bottom:7px}
      #asset-panel .asset-filters{display:flex;gap:6px;align-items:center;margin-bottom:10px;font-size:12px}
      #asset-panel .asset-filters select{min-width:0;flex:1}
      #asset-panel .asset-filters label{display:flex;align-items:center;gap:3px;white-space:nowrap}
      #asset-panel .asset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      #asset-panel .asset-card{display:flex;flex-direction:column;padding:7px;min-width:0;position:relative;border:1px solid #dbe3ee;border-radius:9px;background:#fff}
      #asset-panel .asset-preview{border:0;background:#f3f6fa;width:100%;height:84px;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:5px;cursor:pointer}
      #asset-panel .asset-preview img{width:100%;height:100%;object-fit:contain}
      #asset-panel .asset-name{font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin:7px 0 3px}
      #asset-panel .asset-category{font-size:10px;color:#64748b;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      #asset-panel .asset-actions{display:flex;justify-content:space-between;gap:3px;margin-top:6px}
      #asset-panel .asset-actions button{padding:3px 5px;font-size:11px;min-width:0;background:#eef3f8;color:#274758;border:1px solid #c7d8e3}
      #asset-panel .asset-actions button:hover{background:#dcebf2;color:#173c50;border-color:#7c9eaf}
      #asset-panel .asset-pager{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:12px;font-size:11px}
      #asset-panel .asset-pager button{font-size:11px;padding:5px}
      #asset-panel .asset-summary,#asset-panel .asset-message{font-size:11px;line-height:1.5;color:var(--muted,#64748b);margin:7px 0}
      #asset-panel .asset-message[data-error="true"]{color:#b42318}
      #asset-dialog{width:min(540px,90vw);max-height:85vh;overflow:auto;box-sizing:border-box}
      #asset-dialog .asset-dialog-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #asset-dialog .asset-dialog-heading h2{font-size:19px;margin:4px 0 16px}
      #asset-dialog .asset-fields{display:grid;gap:12px}
      #asset-dialog .asset-fields label{display:grid;gap:5px;font-size:12px}
      #asset-dialog .asset-fields input,#asset-dialog .asset-fields textarea{width:100%;box-sizing:border-box}
      #asset-dialog .asset-fields textarea{min-height:62px;resize:vertical}
      #asset-dialog .asset-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
      #asset-dialog .asset-error{font-size:12px;color:#b42318;white-space:pre-wrap;margin-top:10px}
      #asset-dialog .asset-note{font-size:12px;color:var(--muted,#64748b);line-height:1.6}
    `;
    document.head.append(style);
  }
  async function init({ store, onInsert, onStatus }) {
    const panel = document.getElementById("asset-panel"),
      dialog = document.getElementById("asset-dialog");
    if (!panel || !dialog) throw new Error("缺少素材库界面容器。");
    installStyles();
    let metadata = [],
      page = 0,
      generation = 0,
      refreshVersion = 0,
      busy = false,
      urls = [];
    const say = (message, error = false) => {
      messageBox.textContent = message;
      messageBox.dataset.error = String(error);
      if (onStatus) onStatus(message, error);
    };
    const saved = (message) =>
      say(
        message +
          (store.persistent === false
            ? " 当前仅临时保存在内存中，请立即导出素材包备份。"
            : ""),
        store.persistent === false,
      );
    panel.replaceChildren();
    const tools = element("div", "asset-tools");
    const svgInput = element("input");
    svgInput.id = "asset-svg-file";
    svgInput.type = "file";
    svgInput.accept = ".svg,image/svg+xml";
    svgInput.multiple = true;
    svgInput.hidden = true;
    const packInput = element("input");
    packInput.id = "asset-pack-file";
    packInput.type = "file";
    packInput.accept = ".sciassets,.json,application/json";
    packInput.hidden = true;
    const importSVG = button("导入 SVG", "asset-import-svg", () =>
      svgInput.click(),
    );
    const importPack = button("导入素材包", "asset-import-pack", () =>
      packInput.click(),
    );
    const exportPack = button("导出素材包", "asset-export-pack", () =>
      run(exportAll),
    );
    tools.append(importSVG, importPack, exportPack, svgInput, packInput);
    const search = element("input", "asset-search");
    search.id = "asset-search";
    search.type = "search";
    search.placeholder = "搜索名称、标签或分类";
    search.setAttribute("aria-label", "搜索素材");
    const filters = element("div", "asset-filters");
    const category = element("select");
    category.id = "asset-category";
    category.setAttribute("aria-label", "素材分类");
    const favoriteLabel = element("label");
    const favorite = element("input");
    favorite.type = "checkbox";
    favorite.id = "asset-favorites";
    favoriteLabel.append(favorite, document.createTextNode("仅收藏"));
    filters.append(category, favoriteLabel);
    const summary = element("p", "asset-summary");
    summary.id = "asset-summary";
    const grid = element("div", "asset-grid");
    grid.id = "asset-grid";
    const pager = element("div", "asset-pager");
    const previous = button("上一页", "asset-prev", () => {
      page--;
      render();
    });
    const pageLabel = element("span");
    pageLabel.id = "asset-page-label";
    const next = button("下一页", "asset-next", () => {
      page++;
      render();
    });
    pager.append(previous, pageLabel, next);
    const messageBox = element("p", "asset-message");
    messageBox.id = "asset-message";
    messageBox.setAttribute("role", "status");
    messageBox.setAttribute("aria-live", "polite");
    panel.append(tools, search, filters, summary, grid, pager, messageBox);
    async function run(action) {
      if (busy) return;
      busy = true;
      [importSVG, importPack, exportPack].forEach((b) => (b.disabled = true));
      try {
        await action();
      } catch (error) {
        say(error.message || "操作失败，请重试。", true);
      } finally {
        busy = false;
        [importSVG, importPack, exportPack].forEach(
          (b) => (b.disabled = false),
        );
      }
    }
    function renderCategories() {
      const selected = category.value;
      category.replaceChildren();
      const option = element("option", "", "全部分类");
      option.value = "";
      category.append(option);
      [...new Set(metadata.map((a) => a.category || "未分类"))]
        .sort((a, b) => a.localeCompare(b, "zh-CN"))
        .forEach((c) => {
          const o = element("option", "", c);
          o.value = c;
          category.append(o);
        });
      if ([...category.options].some((o) => o.value === selected))
        category.value = selected;
    }
    async function refresh() {
      const token = ++refreshVersion;
      const nextMetadata = await store.listAssets();
      if (token !== refreshVersion) return;
      metadata = nextMetadata;
      renderCategories();
      render();
    }
    function render() {
      const token = ++generation;
      urls.forEach(URL.revokeObjectURL);
      urls = [];
      grid.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      const results = metadata.filter(
        (a) =>
          (!category.value || (a.category || "未分类") === category.value) &&
          (!favorite.checked || a.favorite) &&
          (!query ||
            [a.name, a.category, ...(a.tags || [])]
              .join(" ")
              .toLocaleLowerCase()
              .includes(query)),
      );
      const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
      page = Math.min(Math.max(page, 0), pages - 1);
      previous.disabled = page === 0;
      next.disabled = page === pages - 1;
      pageLabel.textContent = page + 1 + " / " + pages;
      summary.textContent =
        "共 " +
        metadata.length.toLocaleString("zh-CN") +
        " 个素材 · 当前匹配 " +
        results.length.toLocaleString("zh-CN") +
        " 个";
      if (!results.length)
        grid.append(
          element(
            "p",
            "asset-note",
            "暂无匹配素材。可导入 SVG 或调整筛选条件。",
          ),
        );
      results
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .forEach((asset) => {
          const card = element("article", "asset-card");
          card.dataset.assetId = asset.id;
          const preview = button("", null, () =>
            run(async () => {
              const full = await store.getAsset(asset.id);
              if (!full) throw new Error("素材已被删除。");
              await onInsert(full);
              say("已插入：" + full.name);
            }),
          );
          preview.className = "asset-preview";
          preview.title = "插入 " + asset.name;
          preview.setAttribute("aria-label", "插入 " + asset.name);
          const placeholder = element("span", "", "…");
          preview.append(placeholder);
          const name = element("div", "asset-name", asset.name);
          name.title = asset.name;
          const cat = element(
            "div",
            "asset-category",
            asset.category || "未分类",
          );
          const actions = element("div", "asset-actions");
          const fav = button(asset.favorite ? "★" : "☆", null, () =>
            run(async () => {
              await store.setFavorite(asset.id, !asset.favorite);
              await refresh();
            }),
          );
          fav.title = asset.favorite ? "取消收藏" : "收藏";
          fav.setAttribute("aria-label", fav.title + " " + asset.name);
          const edit = button("编辑", null, () =>
            run(async () => {
              const full = await store.getAsset(asset.id);
              if (!full) throw new Error("素材已被删除。");
              showEdit(full);
            }),
          );
          edit.setAttribute("aria-label", "编辑 " + asset.name);
          const del = button("删除", null, () =>
            run(async () => {
              if (
                !window.confirm(
                  "确定删除素材“" +
                    asset.name +
                    "”？已插入画布的图形不受影响。",
                )
              )
                return;
              await store.deleteAsset(asset.id);
              await refresh();
              say("已删除素材。");
            }),
          );
          del.setAttribute("aria-label", "删除 " + asset.name);
          actions.append(fav, edit, del);
          card.append(preview, name, cat, actions);
          grid.append(card);
          // Only this page's vectors are requested; off-page assets remain metadata only.
          store
            .getAsset(asset.id)
            .then((full) => {
              if (token !== generation || !full) return;
              const safe = SF.SVG.normalize(full.svg, "preview-" + asset.id);
              const url = URL.createObjectURL(
                new Blob([safe.svg], { type: "image/svg+xml" }),
              );
              urls.push(url);
              const img = element("img");
              img.loading = "lazy";
              img.alt = asset.name;
              img.src = url;
              preview.replaceChildren(img);
            })
            .catch((error) => {
              if (token === generation) {
                placeholder.textContent = "预览失败";
                preview.title = error.message;
              }
            });
        });
    }
    function showEdit(asset) {
      dialog.replaceChildren();
      const header = element("div", "asset-dialog-heading");
      header.append(
        element("h2", "", "编辑素材信息"),
        button("关闭", "asset-close-dialog", () => dialog.close()),
      );
      const form = element("form");
      form.id = "asset-edit-form";
      const fields = element("div", "asset-fields");
      const inputs = {};
      const specs = [
        ["name", "名称", asset.name, 500],
        ["category", "分类", asset.category, 100],
        ["tags", "标签（逗号分隔）", (asset.tags || []).join(", "), 6464],
        ["author", "作者", asset.author, 1000],
        ["source", "来源", asset.source, 2000],
        ["license", "许可 / 使用条件", asset.license, 2000],
      ];
      specs.forEach(([key, label, value, max]) => {
        const wrapper = element("label", "", label);
        const input = element(key === "license" ? "textarea" : "input");
        input.id = "asset-edit-" + key;
        input.value = value || "";
        input.maxLength = max;
        if (key === "name") input.required = true;
        wrapper.append(input);
        fields.append(wrapper);
        inputs[key] = input;
      });
      const note = element(
        "p",
        "asset-note",
        "导入素材保留作者提供的许可。编辑这些字段不会授予额外使用权。",
      );
      const errorBox = element("div", "asset-error");
      errorBox.setAttribute("role", "alert");
      const actions = element("div", "asset-dialog-actions");
      const cancel = button("取消", "asset-edit-cancel", () => dialog.close());
      const save = element("button", "", "保存");
      save.id = "asset-edit-save";
      save.type = "submit";
      actions.append(cancel, save);
      form.append(fields, note, errorBox, actions);
      dialog.append(header, form);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
          const updates = { ...asset, updatedAt: new Date().toISOString() };
          Object.entries(inputs).forEach(([key, input]) => {
            updates[key] =
              key === "tags"
                ? input.value
                    .split(/[,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : input.value.trim();
          });
          const validated = record(updates, new Set());
          await store.putAssets([validated]);
          dialog.close();
          await refresh();
          saved("素材信息已保存。");
        } catch (error) {
          errorBox.textContent = error.message;
          say("素材信息保存失败：" + error.message, true);
        } finally {
          save.disabled = false;
        }
      });
      if (!dialog.open) dialog.showModal();
      inputs.name.focus();
    }
    async function importSVGFiles(files) {
      if (files.length > 1000)
        throw new Error("一次最多导入 1,000 个 SVG 文件。");
      const ids = new Set(metadata.map((a) => a.id));
      const records = [];
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error(file.name + " 超过单个 SVG 8 MB 限制。");
        say("正在检查 SVG：" + (records.length + 1) + " / " + files.length);
        try {
          records.push(
            record(
              {
                name: file.name.replace(/\.svg$/i, ""),
                svg: await file.text(),
                source: file.name,
              },
              ids,
            ),
          );
        } catch (error) {
          throw new Error(
            file.name + "：" + error.message + " 本批次尚未导入。",
          );
        }
      }
      await store.putAssets(records);
      page = 0;
      search.value = "";
      category.value = "";
      favorite.checked = false;
      await refresh();
      saved(
        "已导入 " +
          records.length +
          " 个 SVG；可点击“编辑”补充作者、标签和许可。",
      );
    }
    async function importPackFile(file) {
      if (file.size > MAX_PACK_SIZE)
        throw new Error("素材包超过 128 MB 限制，请分包导入。");
      say("正在校验整个素材包…");
      let pack;
      try {
        pack = JSON.parse(await file.text());
      } catch (_) {
        throw new Error("素材包不是有效 JSON。");
      }
      const records = preparePack(pack, new Set(metadata.map((a) => a.id)));
      await store.putAssets(records);
      page = 0;
      search.value = "";
      category.value = "";
      favorite.checked = false;
      await refresh();
      saved("已导入 " + records.length + " 个素材；重复编号已分配新编号。");
    }
    async function exportAll() {
      const assets = [];
      for (const item of metadata) {
        const full = await store.getAsset(item.id);
        if (!full) throw new Error("素材库已变化，请刷新后重新导出。");
        assets.push(full);
      }
      const data = JSON.stringify(
        {
          format: "scifigure-assets",
          version: 1,
          name: "SciFigure 素材库",
          assets,
        },
        null,
        2,
      );
      download(data, "SciFigure-素材库.sciassets", "application/json");
      say("已导出 " + assets.length + " 个素材。请保留素材包作为可移植备份。");
    }
    svgInput.addEventListener("change", () => {
      const files = [...svgInput.files];
      svgInput.value = "";
      if (files.length) run(() => importSVGFiles(files));
    });
    packInput.addEventListener("change", () => {
      const file = packInput.files[0];
      packInput.value = "";
      if (file) run(() => importPackFile(file));
    });
    search.addEventListener("input", () => {
      page = 0;
      render();
    });
    category.addEventListener("change", () => {
      page = 0;
      render();
    });
    favorite.addEventListener("change", () => {
      page = 0;
      render();
    });
    await refresh();
    return { refresh };
  }
  SF.Assets = { init, preparePack };
})();
