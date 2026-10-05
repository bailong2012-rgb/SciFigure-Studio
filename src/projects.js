(function () {
  "use strict";
  const SF = (window.SF = window.SF || {});
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = () =>
    "project-" +
    (window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2));
  SF.Projects = {
    async init({ editor, store, onStatus = () => {}, demoDocument }) {
      await store.ready();
      const el = (id) => document.getElementById(id);
      const dialog = el("project-dialog"),
        nameInput = el("project-name");
      let active,
        pending,
        timer,
        saving = Promise.resolve(),
        actions = Promise.resolve(),
        loading = false,
        busy = false,
        writing = false;
      function status(text, kind = "info") {
        onStatus(text, kind);
      }
      function failure(error) {
        status(
          "操作失败：" +
            (error.message || String(error)) +
            "。当前内容仍保留；请导出项目备份。",
          "error",
        );
      }
      function snapshot() {
        const doc = clone(editor.getDocument()),
          now = new Date().toISOString();
        return Object.assign(doc, {
          format: "scifigure-project",
          version: 1,
          id: active.id,
          name: doc.name || active.name || "未命名项目",
          createdAt: active.createdAt || now,
          updatedAt: now,
        });
      }
      function markChanged() {
        if (loading || !active) return;
        try {
          pending = snapshot();
          active.name = pending.name;
          if (nameInput) nameInput.value = active.name;
        } catch (error) {
          failure(error);
          return;
        }
        status(
          store.persistent === false
            ? "临时内容已修改，请及时导出项目备份。"
            : "有修改，等待自动保存…",
        );
        clearTimeout(timer);
        timer = setTimeout(() => {
          flush().catch(failure);
        }, 650);
      }
      function flush() {
        clearTimeout(timer);
        const operation = saving
          .catch(() => {})
          .then(async () => {
            while (pending) {
              const doc = pending;
              pending = null;
              try {
                writing = true;
                await store.putProject(doc);
              } catch (error) {
                if (!pending) pending = doc;
                throw error;
              } finally {
                writing = false;
              }
              if (active && active.id === doc.id && !pending)
                status(
                  store.persistent === false
                    ? "仅临时保存在内存中，关闭即丢失；请导出项目。"
                    : "已自动保存到此浏览器",
                  store.persistent === false ? "warning" : "success",
                );
            }
          });
        saving = operation;
        return operation;
      }
      function install(doc) {
        loading = true;
        try {
          // The editor validates the entire document before changing its scene.
          editor.loadDocument(clone(doc));
          const result = editor.getDocument(),
            now = new Date().toISOString();
          active = {
            id:
              doc.format === "scifigure-project" && doc.id
                ? doc.id
                : result.id || uid(),
            name: result.name || doc.name || "未命名项目",
            createdAt: doc.createdAt || now,
          };
          nameInput.value = active.name;
          pending = snapshot();
        } finally {
          loading = false;
        }
      }
      async function remember() {
        try {
          await store.setSetting("lastProject", active.id);
        } catch (error) {
          status("项目已打开，但无法记录最近项目：" + error.message, "warning");
        }
      }
      async function openProject(id) {
        const doc = await store.getProject(id);
        if (!doc) throw new Error("项目不存在");
        await flush();
        install(doc);
        await flush();
        await remember();
        if (dialog.open) dialog.close();
      }
      async function newProject() {
        await flush();
        loading = true;
        try {
          editor.newDocument({ name: "未命名项目", width: 1200, height: 800 });
          const doc = clone(editor.getDocument());
          doc.id = uid();
          doc.createdAt = new Date().toISOString();
          install(doc);
        } finally {
          loading = false;
        }
        await flush();
        await remember();
        if (dialog.open) dialog.close();
      }
      function run(operation) {
        actions = actions
          .catch(() => {})
          .then(async () => {
            busy = true;
            try {
              await operation();
            } catch (error) {
              failure(error);
            } finally {
              busy = false;
            }
          });
        return actions;
      }
      function button(label, action, projectId) {
        const node = document.createElement("button");
        node.type = "button";
        node.textContent = label;
        if (projectId) node.dataset.projectId = projectId;
        node.addEventListener("click", () => run(action));
        return node;
      }
      async function renderDialog() {
        const projects = await store.listProjects();
        dialog.replaceChildren();
        const title = document.createElement("h2");
        title.textContent = "项目管理";
        dialog.append(title);
        const note = document.createElement("p");
        note.className = "help";
        note.textContent =
          store.persistent === false
            ? store.warning || "当前使用临时存储，关闭即丢失。请导出项目备份。"
            : "项目保存在当前浏览器中。移动文件、切换浏览器或清理浏览数据后可能无法访问，请定期导出备份。";
        dialog.append(note);
        const list = document.createElement("div");
        list.className = "project-list";
        dialog.append(list);
        projects.forEach((project) => {
          const row = document.createElement("div");
          row.className = "project-row";
          row.dataset.id = project.id;
          const details = document.createElement("div");
          details.className = "project-details";
          const title = document.createElement("strong");
          title.textContent =
            project.name +
            (active && active.id === project.id ? "（当前）" : "");
          const info = document.createElement("small");
          info.textContent =
            project.width +
            " × " +
            project.height +
            " · " +
            new Date(project.updatedAt).toLocaleString("zh-CN");
          details.append(title, info);
          row.append(
            details,
            button("打开", () => openProject(project.id), project.id),
            button("重命名", async () => {
              const name = window.prompt("项目名称", project.name);
              if (name === null || !name.trim()) return;
              await flush();
              if (active.id === project.id) {
                editor.setName(name.trim().slice(0, 160));
                markChanged();
                await flush();
              } else {
                const doc = await store.getProject(project.id);
                doc.name = name.trim().slice(0, 160);
                doc.updatedAt = new Date().toISOString();
                await store.putProject(doc);
              }
              await renderDialog();
            }),
            button("复制", async () => {
              await flush();
              const doc = await store.getProject(project.id);
              doc.id = uid();
              doc.name += " 副本";
              doc.createdAt = doc.updatedAt = new Date().toISOString();
              await store.putProject(doc);
              await renderDialog();
            }),
            button("删除", async () => {
              if (
                !window.confirm(
                  "删除项目“" +
                    project.name +
                    "”？此操作不可撤销，请先导出备份。",
                )
              )
                return;
              await flush();
              if (active.id === project.id) {
                const next = (await store.listProjects()).find(
                  (item) => item.id !== project.id,
                );
                if (next) await openProject(next.id);
                else await newProject();
              }
              await store.deleteProject(project.id);
              await renderDialog();
              if (!dialog.open) dialog.showModal();
            }),
          );
          list.append(row);
        });
        if (!projects.length) {
          const empty = document.createElement("p");
          empty.textContent = "尚无项目";
          list.append(empty);
        }
        const footer = document.createElement("div");
        footer.className = "dialog-actions";
        footer.append(
          button("新建空白项目", newProject),
          button("关闭", () => dialog.close()),
        );
        dialog.append(footer);
      }
      el("projects-btn").addEventListener("click", () =>
        run(async () => {
          await flush();
          await renderDialog();
          if (!dialog.open) dialog.showModal();
        }),
      );
      el("new-project").addEventListener("click", () => run(newProject));
      nameInput.addEventListener("change", () => {
        const name = nameInput.value.trim().slice(0, 160) || "未命名项目";
        editor.setName(name);
        markChanged();
      });
      el("save-project").addEventListener("click", () => {
        try {
          const doc = snapshot(),
            blob = new Blob([JSON.stringify(doc, null, 2)], {
              type: "application/json",
            }),
            url = URL.createObjectURL(blob),
            anchor = document.createElement("a");
          anchor.href = url;
          anchor.download =
            (doc.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "项目") +
            ".scifigure.json";
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          status("已生成项目备份，请确认浏览器下载完成。", "success");
        } catch (error) {
          failure(error);
        }
      });
      el("load-project").addEventListener("click", () =>
        el("project-file").click(),
      );
      el("project-file").addEventListener("change", (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        run(async () => {
          if (file.size > 32 * 1024 * 1024)
            throw new Error("项目文件超过 32 MB 上限");
          const doc = JSON.parse(await file.text());
          if (
            !doc ||
            (doc.format !== "scifigure-project" &&
              doc.format !== "biology-svg-editor")
          )
            throw new Error("不支持的项目格式");
          if (doc.format === "scifigure-project" && doc.version !== 1)
            throw new Error("不支持此项目版本");
          if (doc.format === "scifigure-project") {
            doc.id = uid();
            doc.createdAt = new Date().toISOString();
          }
          await flush();
          install(doc);
          await flush();
          await remember();
          status(
            store.persistent === false
              ? "项目已导入临时内存，请导出备份。"
              : "项目已导入并保存到此浏览器",
            store.persistent === false ? "warning" : "success",
          );
        });
      });
      editor.onChange(markChanged);
      window.addEventListener("beforeunload", (event) => {
        if (pending || writing || busy || store.persistent === false) {
          event.preventDefault();
          event.returnValue = "";
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) flush().catch(failure);
      });
      try {
        const lastId = await store.getSetting("lastProject"),
          allProjects = await store.listProjects();
        const doc =
          (lastId && (await store.getProject(lastId))) ||
          (allProjects[0] && (await store.getProject(allProjects[0].id)));
        if (doc) {
          install(doc);
          await flush();
          await remember();
        } else if (demoDocument) {
          install(clone(demoDocument));
          await flush();
          await remember();
        } else await newProject();
      } catch (error) {
        failure(error);
      }
      if (store.persistent === false)
        status(store.warning || "当前仅临时保存，请导出项目备份。", "warning");
      return { flush };
    },
  };
})();
