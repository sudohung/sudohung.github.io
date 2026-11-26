/*
 * Templatical 纯草稿模块（样例二次开发）
 *
 * 与「保存为 Mailchimp 模板」的区别：
 *   - 纯草稿只写本地 data/templatical_drafts.json；
 *   - 不调用 POST/PATCH /3.0/templates，不会在 Mailchimp 创建模板；
 *   - 草稿箱可以重新载入 JSON 到编辑器，再决定是否保存为 Mailchimp 模板。
 */
(function () {
  "use strict";

  var API_BASE = "/mailchimp/api";
  var DEFAULT_ACCOUNT = "afcc88991218"; // hung01：样例默认编辑账号
  var state = {
    draftId: "",
    saving: false,
    loading: false
  };
  var refs = {};
  var editorApi = null;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function setStatus(message) {
    var node = document.getElementById("status");
    if (node) node.textContent = message;
  }

  function toast(message, type) {
    var node = document.createElement("div");
    node.className = "mc-draft-toast" + (type === "error" ? " is-error" : "");
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () {
      node.classList.add("is-out");
      setTimeout(function () { node.remove(); }, 260);
    }, type === "error" ? 5200 : 3000);
  }

  function accountId() {
    var select = document.getElementById("account");
    return select ? select.value : "";
  }

  function draftName() {
    var input = document.getElementById("name");
    return input ? text(input.value).trim() : "";
  }

  function draftStorageKey(key) {
    return "mcDraftId:" + key;
  }

  function readLastDraftId(key) {
    try { return window.localStorage.getItem(draftStorageKey(key)) || ""; }
    catch (err) { return ""; }
  }

  function rememberDraftId(key, id) {
    try {
      if (id) window.localStorage.setItem(draftStorageKey(key), id);
      else window.localStorage.removeItem(draftStorageKey(key));
    } catch (err) { /* ignore */ }
  }

  // ---------------- 读取编辑器 API ----------------
  function findEditorApi() {
    if (editorApi) return editorApi;
    var root = document.querySelector("#editor");
    var app = root && root.__vue_app__;
    if (!app) return null;
    var start = app._container && app._container._vnode && app._container._vnode.component;
    if (!start) return null;
    var seen = [];
    var stack = [start];
    var guard = 0;
    while (stack.length && guard++ < 600) {
      var comp = stack.pop();
      if (!comp || seen.indexOf(comp) >= 0) continue;
      seen.push(comp);
      var exposed = comp.exposed || (comp.ctx && comp.ctx._ && comp.ctx._.exposed);
      if (exposed && typeof exposed.getContent === "function") {
        editorApi = exposed;
        return editorApi;
      }
      var sub = comp.subTree;
      var walk = [sub];
      while (walk.length) {
        var node = walk.pop();
        if (!node || typeof node !== "object") continue;
        if (node.component) stack.push(node.component);
        if (Array.isArray(node.children)) {
          for (var i = 0; i < node.children.length; i++) {
            if (node.children[i] && typeof node.children[i] === "object") walk.push(node.children[i]);
          }
        }
      }
    }
    return null;
  }

  async function waitEditorApi(timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 6000);
    while (Date.now() < deadline) {
      var api = findEditorApi();
      if (api) return api;
      await sleep(150);
    }
    return null;
  }

  // ---------------- 保存纯草稿 ----------------
  async function saveDraft() {
    if (state.saving) return;
    var key = accountId();
    if (!key) {
      setStatus("请先选择账号");
      toast("请先选择账号", "error");
      return;
    }
    var api = await waitEditorApi(6000);
    if (!api) {
      setStatus("草稿保存失败：没有找到编辑器实例");
      toast("没有找到编辑器实例，请刷新页面", "error");
      return;
    }
    var content;
    try {
      content = api.getContent();
    } catch (err) {
      setStatus("草稿保存失败：" + err.message);
      toast("读取编辑器内容失败：" + err.message, "error");
      return;
    }
    // 变量组件不允许挂超链接：保存前把误加到变量上的链接拆掉。
    if (window.MC_VARIABLE_SCHEMA && typeof window.MC_VARIABLE_SCHEMA.sanitizeContent === "function") {
      try {
        var sanitized = window.MC_VARIABLE_SCHEMA.sanitizeContent(content);
        if (JSON.stringify(sanitized) !== JSON.stringify(content)) {
          api.setContent(sanitized);
          content = sanitized;
          setStatus("已移除变量组件上的超链接");
          toast("已移除变量组件上的超链接", "ok");
          await sleep(60);
        }
      } catch (err) {
        setStatus("清理变量超链接失败：" + (err.message || err));
        toast("清理变量超链接失败：" + (err.message || err), "error");
        return;
      }
    }
    state.saving = true;
    var button = document.getElementById("mc-draft-save");
    if (button) {
      button.disabled = true;
      button.textContent = "保存中…";
    }
    setStatus("正在保存纯草稿…");
    try {
      if (window.MC_VARIABLE_SCHEMA) {
        var validation = window.MC_VARIABLE_SCHEMA.validateContent(content);
        if (!validation.ok) {
          var missingText = validation.missing.map(function (key) { return "{{" + key + "}}"; }).join(", ");
          throw new Error("正文存在未定义变量：" + missingText + "。请先在变量面板中定义。");
        }
      }
      var tokenHtml = "";
      if (window.MC_VARIABLE_SCHEMA && typeof window.MC_VARIABLE_SCHEMA.tokenHtml === "function") {
        setStatus("正在生成 token_html…");
        tokenHtml = await window.MC_VARIABLE_SCHEMA.tokenHtml();
      }
      var resp = await fetch(API_BASE + "/accounts/" + encodeURIComponent(key) + "/templatical-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          id: state.draftId || readLastDraftId(key) || "",
          name: draftName() || "未命名草稿",
          content: content,
          variables: window.MC_VARIABLE_SCHEMA ? window.MC_VARIABLE_SCHEMA.get() : [],
          token_html: tokenHtml
        })
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      state.draftId = data.draft.id;
      rememberDraftId(key, data.draft.id);
      setStatus("纯草稿已保存: #" + data.draft.id + "（未创建 Mailchimp 模板，可点「预览」查看示例渲染）");
      toast("已保存纯草稿 #" + data.draft.id, "ok");
      if (refs.back && refs.back.classList.contains("is-open")) loadDraftList();
    } catch (err) {
      setStatus("草稿保存失败：" + (err.message || err));
      toast("草稿保存失败：" + (err.message || err), "error");
    } finally {
      state.saving = false;
      if (button) {
        button.disabled = false;
        button.textContent = "存纯草稿";
      }
    }
  }

  // ---------------- 草稿箱 ----------------
  function buildModal() {
    var back = document.createElement("div");
    back.className = "mc-draft-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "草稿箱");
    back.innerHTML =
      '<div class="mc-draft-panel">' +
        '<div class="mc-draft-head">' +
          '<div>' +
            '<h3>草稿箱</h3>' +
            '<p>纯草稿只保存在本地，不会调用 Mailchimp 模板接口。</p>' +
          '</div>' +
          '<button type="button" class="mc-draft-close" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="mc-draft-toolbar">' +
          '<span class="mc-draft-count"></span>' +
          '<button type="button" class="mc-draft-refresh">刷新</button>' +
        '</div>' +
        '<div class="mc-draft-list"></div>' +
      '</div>';
    document.body.appendChild(back);

    refs.back = back;
    refs.list = back.querySelector(".mc-draft-list");
    refs.count = back.querySelector(".mc-draft-count");

    back.querySelector(".mc-draft-close").addEventListener("click", closeDrafts);
    back.addEventListener("click", function (event) {
      if (event.target === back) closeDrafts();
    });
    back.querySelector(".mc-draft-refresh").addEventListener("click", loadDraftList);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && refs.back && refs.back.classList.contains("is-open")) closeDrafts();
    });
  }

  function openDrafts() {
    if (!refs.back) buildModal();
    refs.back.classList.add("is-open");
    loadDraftList();
  }

  function closeDrafts() {
    if (refs.back) refs.back.classList.remove("is-open");
  }

  async function loadDraftList() {
    refs.list.innerHTML = '<div class="mc-draft-empty">加载中…</div>';
    refs.count.textContent = "";
    try {
      var resp = await fetch(API_BASE + "/templatical-drafts", {
        headers: { Accept: "application/json" }
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      renderDrafts(data.drafts || []);
    } catch (err) {
      refs.list.innerHTML = '<div class="mc-draft-empty is-error">草稿加载失败：' + escapeHtml(err.message) + '</div>';
    }
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function renderDrafts(items) {
    refs.count.textContent = items.length ? items.length + " 个草稿" : "";
    if (!items.length) {
      refs.list.innerHTML = '<div class="mc-draft-empty">还没有纯草稿，点顶部「存纯草稿」创建。</div>';
      return;
    }
    refs.list.innerHTML = items.map(function (item) {
      var current = item.id === state.draftId ? " is-current" : "";
      return '<div class="mc-draft-item' + current + '" data-id="' + escapeHtml(item.id) + '">' +
        '<div class="mc-draft-meta">' +
          '<b>' + escapeHtml(item.name || "未命名草稿") + '</b>' +
          '<span class="mc-draft-id">#' + escapeHtml(item.id) + '</span>' +
          '<span class="mc-draft-account">账号：' + escapeHtml(item.account_name || item.account || "—") + '</span>' +
          (item.version ? '<span class="mc-draft-version">v' + escapeHtml(item.version) + '</span>' : '') +
          '<span class="mc-draft-time">更新 ' + escapeHtml(item.updated_at || item.created_at || "") + '</span>' +
        '</div>' +
        '<div class="mc-draft-actions">' +
          '<button type="button" class="mc-draft-preview">预览</button>' +
          '<button type="button" class="mc-draft-load">载入</button>' +
          '<button type="button" class="mc-draft-delete">删除</button>' +
        '</div>' +
      '</div>';
    }).join("");

    refs.list.querySelectorAll(".mc-draft-item").forEach(function (row) {
      var id = row.getAttribute("data-id");
      row.querySelector(".mc-draft-preview").addEventListener("click", function () {
        if (window.MC_VARIABLE_PREVIEW) window.MC_VARIABLE_PREVIEW.openDraft(id);
      });
      row.querySelector(".mc-draft-load").addEventListener("click", function () { loadDraft(id); });
      row.querySelector(".mc-draft-delete").addEventListener("click", function () { deleteDraft(id); });
    });
  }

  function forgetDraftIdEverywhere(id) {
    try {
      var keys = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var key = window.localStorage.key(i);
        if (key && key.indexOf("mcDraftId:") === 0 && window.localStorage.getItem(key) === id) keys.push(key);
      }
      keys.forEach(function (key) { window.localStorage.removeItem(key); });
    } catch (err) { /* ignore */ }
  }

  function selectAccount(account) {
    if (!account) return false;
    var select = document.getElementById("account");
    if (!select) return false;
    var exists = Array.prototype.some.call(select.options, function (option) { return option.value === account; });
    if (!exists) return false;
    select.value = account;
    return true;
  }

  async function loadDraft(id) {
    var api = await waitEditorApi(6000);
    if (!api || typeof api.setContent !== "function") {
      toast("没有找到编辑器实例，请刷新页面", "error");
      return;
    }
    try {
      var resp = await fetch(API_BASE + "/templatical-drafts/" + encodeURIComponent(id), {
        headers: { Accept: "application/json" }
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      var draft = data.draft;
      var loadedContent = draft.content;
      if (window.MC_VARIABLE_SCHEMA && typeof window.MC_VARIABLE_SCHEMA.sanitizeContent === "function") {
        loadedContent = window.MC_VARIABLE_SCHEMA.sanitizeContent(loadedContent);
        if (JSON.stringify(loadedContent) !== JSON.stringify(draft.content)) {
          toast("已移除变量组件上的超链接", "ok");
        }
      }
      api.setContent(loadedContent);
      if (window.MC_VARIABLE_SCHEMA) {
        var draftVariables = draft.variables || [];
        window.MC_VARIABLE_SCHEMA.load(draftVariables);
        // 老草稿没有 schema 时，从正文锚点/token 兜底恢复变量定义。
        if (!draftVariables.length) window.MC_VARIABLE_SCHEMA.syncFromContent(draft.content);
        window.MC_VARIABLE_SCHEMA.refreshUsage();
      }
      var nameInput = document.getElementById("name");
      if (nameInput) nameInput.value = draft.name || nameInput.value;
      state.draftId = id;
      rememberDraftId(draft.account || accountId(), id);
      var switched = selectAccount(draft.account);
      var accountText = draft.account_name || draft.account || "";
      setStatus("已载入纯草稿 #" + id + (accountText ? "（账号：" + accountText + "）" : "") + "（未保存为 Mailchimp 模板）");
      toast(
        switched
          ? "已载入草稿 #" + id + "，账号已切换到 " + accountText
          : "已载入草稿 #" + id,
        "ok"
      );
      closeDrafts();
    } catch (err) {
      toast("载入草稿失败：" + (err.message || err), "error");
    }
  }

  async function deleteDraft(id) {
    if (!window.confirm("删除该纯草稿？此操作不可撤销。")) return;
    try {
      var resp = await fetch(API_BASE + "/templatical-drafts/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { Accept: "application/json" }
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      if (state.draftId === id) state.draftId = "";
      forgetDraftIdEverywhere(id);
      toast("草稿已删除", "ok");
      loadDraftList();
    } catch (err) {
      toast("删除草稿失败：" + (err.message || err), "error");
    }
  }

  var protectedAccounts = {};
  var accountInitDone = false;

  function loadProtectedAccounts() {
    return fetch(API_BASE + "/accounts", { headers: { Accept: "application/json" } })
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        protectedAccounts = {};
        (data.accounts || []).forEach(function (acc) {
          if (acc.protected) protectedAccounts[acc.id] = true;
        });
      })
      .catch(function () { /* ignore */ });
  }

  function syncAccountOptions() {
    var select = document.getElementById("account");
    if (!select) return false;
    var options = Array.prototype.slice.call(select.options).filter(function (option) {
      return !!option.value;
    });
    if (!options.length) return false;

    options.forEach(function (option) {
      var locked = !!protectedAccounts[option.value];
      option.disabled = locked;
      if (locked && !option.dataset.protectedLabel) {
        option.textContent = option.textContent + "（受保护）";
        option.dataset.protectedLabel = "1";
      }
    });

    var params = new URLSearchParams(window.location.search);
    if (!accountInitDone && !params.get("account")) {
      var preferred = options.find(function (option) {
        return option.value === DEFAULT_ACCOUNT && !option.disabled;
      }) || options.find(function (option) { return !option.disabled; });
      if (preferred) select.value = preferred.value;
      accountInitDone = true;
    }

    if (protectedAccounts[select.value]) {
      var fallback = options.find(function (option) { return !option.disabled; });
      select.value = fallback ? fallback.value : "";
    }
    return true;
  }

  function watchAccountOptions() {
    loadProtectedAccounts().then(function () {
      var attempts = 0;
      var timer = setInterval(function () {
        attempts++;
        syncAccountOptions();
        if (accountInitDone && attempts > 4) clearInterval(timer);
        else if (attempts > 60) clearInterval(timer);
      }, 150);
    });
  }

  function boot() {
    // 供「导入 HTML」等页面级扩展复用编辑器实例
    window.MC_TEMPLATICAL_EDITOR = {
      get: findEditorApi,
      wait: waitEditorApi
    };
    var saveButton = document.getElementById("mc-draft-save");
    if (saveButton) saveButton.addEventListener("click", saveDraft);
    var openButton = document.getElementById("mc-draft-open");
    if (openButton) openButton.addEventListener("click", openDrafts);
    watchAccountOptions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
