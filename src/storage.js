(function () {
  "use strict";
  const SF = (window.SF = window.SF || {});
  const copy = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const memory = {
    projects: new Map(),
    assetMeta: new Map(),
    assetPayload: new Map(),
    settings: new Map(),
  };
  let db, opening;
  const store = (SF.store = { persistent: false, warning: "" });
  store.ready = function () {
    if (opening) return opening;
    opening = new Promise((resolve) => {
      const unavailable = (error) => {
        store.warning =
          "浏览器本地存储不可用：当前仅临时保存在内存中，关闭即丢失。请使用“导出项目”和素材包备份。" +
          (error && error.message ? "（" + error.message + "）" : "");
        resolve(store);
      };
      try {
        if (!window.indexedDB) return unavailable();
        const request = window.indexedDB.open("SciFigureStudio", 1);
        let settled = false;
        request.onupgradeneeded = () => {
          const database = request.result;
          ["projects", "assetMeta", "assetPayload", "settings"].forEach(
            (name) => {
              if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, {
                  keyPath: name === "settings" ? "key" : "id",
                });
            },
          );
        };
        request.onerror = () => {
          if (!settled) {
            settled = true;
            unavailable(request.error);
          }
        };
        request.onblocked = () => {
          if (!settled) {
            settled = true;
            unavailable(new Error("请关闭旧版编辑器标签页后重试"));
          }
        };
        request.onsuccess = () => {
          if (settled) {
            request.result.close();
            return;
          }
          settled = true;
          db = request.result;
          store.persistent = true;
          db.onversionchange = () => {
            db.close();
            store.persistent = false;
            store.warning =
              "本地数据库版本已变化，请先导出项目备份，然后重新打开页面。";
          };
          resolve(store);
        };
      } catch (error) {
        unavailable(error);
      }
    });
    return opening;
  };
  async function transaction(names, mode, action) {
    await store.ready();
    if (!db) return action(null);
    return new Promise((resolve, reject) => {
      let tx, result;
      try {
        tx = db.transaction(names, mode);
        result = action(tx);
      } catch (error) {
        if (tx) tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () =>
        resolve(typeof result === "function" ? result() : result);
      tx.onabort = tx.onerror = () =>
        reject(
          tx.error ||
            new Error("本地存储操作失败，请导出备份并检查浏览器存储空间。"),
        );
    });
  }
  function get(name, id) {
    return transaction([name], "readonly", (tx) => {
      if (!tx) return copy(memory[name].get(id));
      const request = tx.objectStore(name).get(id);
      return () => request.result;
    });
  }
  function all(name) {
    return transaction([name], "readonly", (tx) => {
      if (!tx) return Array.from(memory[name].values(), copy);
      const request = tx.objectStore(name).getAll();
      return () => request.result;
    });
  }
  function put(name, value) {
    const snapshot = copy(value);
    return transaction([name], "readwrite", (tx) => {
      if (tx) tx.objectStore(name).put(snapshot);
      else
        memory[name].set(
          name === "settings" ? snapshot.key : snapshot.id,
          snapshot,
        );
    });
  }
  function validId(id) {
    if (typeof id !== "string" || !id || id.length > 300)
      throw new Error("记录编号无效");
  }
  store.listProjects = async () =>
    (await all("projects"))
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        width: doc.canvas.width,
        height: doc.canvas.height,
        updatedAt: doc.updatedAt,
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  store.getProject = (id) => get("projects", id);
  store.putProject = async (doc) => {
    validId(doc && doc.id);
    if (
      doc.format !== "scifigure-project" ||
      doc.version !== 1 ||
      !doc.canvas ||
      !doc.scene ||
      typeof doc.scene.body !== "string" ||
      typeof doc.scene.defs !== "string"
    )
      throw new Error("项目格式不支持或内容不完整");
    return put("projects", doc);
  };
  store.deleteProject = (id) =>
    transaction(["projects"], "readwrite", (tx) =>
      tx
        ? tx.objectStore("projects").delete(id) && undefined
        : memory.projects.delete(id) && undefined,
    );
  store.listAssets = () => all("assetMeta");
  store.getAsset = (id) =>
    transaction(["assetMeta", "assetPayload"], "readonly", (tx) => {
      if (!tx) {
        const metadata = memory.assetMeta.get(id);
        return metadata
          ? copy(Object.assign({}, metadata, memory.assetPayload.get(id)))
          : undefined;
      }
      const metadata = tx.objectStore("assetMeta").get(id),
        payload = tx.objectStore("assetPayload").get(id);
      return () =>
        metadata.result
          ? Object.assign({}, metadata.result, payload.result)
          : undefined;
    });
  store.putAssets = async (records) => {
    if (!Array.isArray(records)) throw new Error("素材列表无效");
    const snapshots = copy(records),
      ids = new Set();
    snapshots.forEach((record) => {
      validId(record && record.id);
      if (
        ids.has(record.id) ||
        typeof record.svg !== "string" ||
        !record.svg ||
        !Number.isFinite(record.width) ||
        record.width <= 0 ||
        !Number.isFinite(record.height) ||
        record.height <= 0
      )
        throw new Error("素材数据无效或编号重复");
      ids.add(record.id);
    });
    return transaction(["assetMeta", "assetPayload"], "readwrite", (tx) => {
      snapshots.forEach((record) => {
        const { svg, ...metadata } = record,
          payload = { id: record.id, svg };
        if (tx) {
          tx.objectStore("assetMeta").put(metadata);
          tx.objectStore("assetPayload").put(payload);
        } else {
          memory.assetMeta.set(record.id, metadata);
          memory.assetPayload.set(record.id, payload);
        }
      });
    });
  };
  store.deleteAsset = (id) =>
    transaction(["assetMeta", "assetPayload"], "readwrite", (tx) => {
      ["assetMeta", "assetPayload"].forEach((name) =>
        tx ? tx.objectStore(name).delete(id) : memory[name].delete(id),
      );
    });
  store.setFavorite = (id, favorite) =>
    transaction(["assetMeta"], "readwrite", (tx) => {
      if (!tx) {
        const record = memory.assetMeta.get(id);
        if (!record) throw new Error("素材不存在");
        record.favorite = !!favorite;
        record.updatedAt = new Date().toISOString();
        return;
      }
      const request = tx.objectStore("assetMeta").get(id);
      request.onsuccess = () => {
        if (!request.result) {
          tx.abort();
          return;
        }
        tx.objectStore("assetMeta").put(
          Object.assign({}, request.result, {
            favorite: !!favorite,
            updatedAt: new Date().toISOString(),
          }),
        );
      };
    });
  store.getSetting = async (key) => {
    const entry = await get("settings", key);
    return entry && entry.value;
  };
  store.setSetting = (key, value) => put("settings", { key, value });
})();
