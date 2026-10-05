(function () {
  "use strict";
  const SF = (window.SF = window.SF || {});
  SF.version = "0.1.0";
  SF.schemaVersion = 1;
  SF.events = new EventTarget();
  SF.exporters = new Map();
  SF.importers = new Map();
  SF.uid = (prefix = "sf") =>
    prefix +
    "-" +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
  SF.clone = (o) => JSON.parse(JSON.stringify(o));
  SF.registerExporter = (id, adapter) => {
    if (!id || typeof adapter !== "function") throw new Error("无效导出器");
    SF.exporters.set(id, adapter);
  };
  SF.registerImporter = (id, adapter) => {
    if (!id || typeof adapter !== "function") throw new Error("无效导入器");
    SF.importers.set(id, adapter);
  };
  SF.emit = (name, detail) =>
    SF.events.dispatchEvent(new CustomEvent(name, { detail }));
  SF.download = (data, name, type = "application/json") => {
    const blob =
      data instanceof Blob
        ? data
        : new Blob(
            [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
            { type },
          );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  let timer;
  SF.status = (message, error = false) => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("visible");
    clearTimeout(timer);
    timer = setTimeout(
      () => toast.classList.remove("visible"),
      error ? 7000 : 3500,
    );
    document.getElementById("status-message").textContent = message;
  };
  SF.openDialog = (id) => {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
  };
  SF.closeDialog = (id) => document.getElementById(id).close();
})();
