(async function () {
  "use strict";
  const SF = window.SF,
    $ = (id) => document.getElementById(id);
  document
    .querySelectorAll("[data-close]")
    .forEach(
      (button) => (button.onclick = () => $(button.dataset.close).close()),
    );
  $("help-btn").onclick = () => SF.openDialog("help-dialog");
  try {
    await SF.store.ready();
    const editor = new SF.Editor();
    const projectStatus = (text, kind = "info") => {
      $("save-status").textContent = text;
      $("save-status").title = text;
      if (kind === "error") SF.status(text, true);
      else if (kind === "warning") SF.status(text);
    };
    const projects = await SF.Projects.init({
      editor,
      store: SF.store,
      onStatus: projectStatus,
      demoDocument: SF.demoDocument,
    });
    if (!(await SF.store.getSetting("builtinVersion"))) {
      const existing = new Set((await SF.store.listAssets()).map((a) => a.id));
      const missing = SF.builtins.filter((a) => !existing.has(a.id));
      const records = SF.Assets.preparePack({
        format: "scifigure-assets",
        version: 1,
        name: "基础科研素材",
        assets: missing,
      });
      await SF.store.putAssets(records);
      await SF.store.setSetting("builtinVersion", 1);
    }
    const library = await SF.Assets.init({
      store: SF.store,
      onInsert: (asset) => editor.addAsset(asset),
      onStatus: (msg, error) =>
        SF.status(msg, error === true || error === "error"),
    });
    SF.app = { editor, projects, library };
    SF.registerImporter("svg", (raw) => SF.SVG.normalize(raw, SF.uid("svg")));
    SF.registerImporter("project", (raw) =>
      editor.validateDocument(typeof raw === "string" ? JSON.parse(raw) : raw),
    );
    const area = $("workarea");
    area.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        area.classList.add("drop-active");
      }
    });
    area.addEventListener("dragleave", (e) => {
      if (!area.contains(e.relatedTarget)) area.classList.remove("drop-active");
    });
    area.addEventListener("drop", async (e) => {
      e.preventDefault();
      area.classList.remove("drop-active");
      const files = [...e.dataTransfer.files];
      if (!files.length) return;
      try {
        const assets = [];
        for (const file of files) {
          if (!/\.svg$/i.test(file.name))
            throw new Error("画布支持拖入 SVG，工程文件请使用“打开工程”");
          assets.push({
            name: file.name.replace(/\.svg$/i, ""),
            ...SF.SVG.normalize(await file.text(), SF.uid("svg")),
          });
        }
        const p = editor.point(e);
        for (const [i, asset] of assets.entries())
          editor.addAsset(asset, { x: p.x + 20 * i, y: p.y + 20 * i });
        SF.status(
          "已加入 " +
            assets.length +
            " 个 SVG；要长期保存到素材库，请使用左侧“导入 SVG”。",
        );
      } catch (error) {
        SF.status(error.message, true);
      }
    });
    if (!SF.store.persistent) SF.status(SF.store.warning, true);
    else
      $("status-message").textContent =
        `就绪 · ${SF.builtins.length} 类原创基础素材`;
    SF.emit("app:ready", { version: SF.version });
    document.body.dataset.ready = "true";
  } catch (error) {
    console.error(error);
    SF.status("启动失败：" + error.message, true);
    $("save-status").textContent = "启动失败，请查看提示";
    document.body.dataset.failed = "true";
  }
})();
