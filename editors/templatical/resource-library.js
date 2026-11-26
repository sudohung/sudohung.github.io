/*
 * Templatical 资源库模块（样例二次开发）
 *
 * 作用：
 *   1. 在 Templatical 页面提供一个「资源库」入口（顶部按钮 + 图片设置面板内按钮）；
 *   2. 资源来自模拟资源库文件 mailchimp-demo/resources/library.txt，每行一个 URL；
 *   3. 选择资源后写入当前 Image 区块的 Image URL，未选中图片区块时自动插入一个 Image 区块。
 *
 * 说明：Templatical 是构建产物，这里通过 DOM 适配层接入，不修改其打包文件。
 */
(function () {
  "use strict";

  var API_BASE = "/mailchimp/api/resources";
  var IMAGE_BLOCK_SELECTOR = 'button[aria-label="Insert Image block"]';

  var state = {
    resources: [],
    selectedUrl: null,
    keyword: "",
    loaded: false,
    loading: false,
    libraryFile: "",
    lastError: ""
  };

  var refs = {};

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function prettyName(name) {
    return text(name)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
  }

  function toast(message, type) {
    var node = document.createElement("div");
    node.className = "mc-rl-toast" + (type === "error" ? " is-error" : "");
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () {
      node.classList.add("is-out");
      setTimeout(function () { node.remove(); }, 260);
    }, type === "error" ? 5200 : 3000);
  }

  // ---------------- 数据 ----------------
  function loadResources(force) {
    if (state.loading) return Promise.resolve();
    if (state.loaded && !force) return Promise.resolve();
    state.loading = true;
    state.lastError = "";
    renderStatus("加载中…");
    return fetch(API_BASE + "?t=" + Date.now(), { headers: { Accept: "application/json" } })
      .then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error((data && data.error) || "接口返回异常");
        state.resources = data.resources || [];
        state.libraryFile = data.library_file || "";
        state.loaded = true;
        renderStatus("");
        renderGrid();
      })
      .catch(function (err) {
        state.lastError = err.message || String(err);
        renderStatus("资源库加载失败：" + state.lastError);
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function filteredResources() {
    var keyword = state.keyword.trim().toLowerCase();
    if (!keyword) return state.resources;
    return state.resources.filter(function (item) {
      return text(item.name).toLowerCase().indexOf(keyword) >= 0 ||
        text(item.url).toLowerCase().indexOf(keyword) >= 0;
    });
  }

  // ---------------- 弹窗 ----------------
  function buildModal() {
    var back = document.createElement("div");
    back.className = "mc-rl-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "资源库");
    back.innerHTML =
      '<div class="mc-rl-panel">' +
        '<div class="mc-rl-head">' +
          '<div>' +
            '<h3>资源库</h3>' +
            '<p>选择图片应用到当前 Image 区块，或 Hero / Section 的背景图；也可手动添加资源链接（会写回 library.txt）。</p>' +
          '</div>' +
          '<button type="button" class="mc-rl-close" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="mc-rl-toolbar">' +
          '<input type="search" class="mc-rl-search" placeholder="搜索资源名称或 URL">' +
          '<button type="button" class="mc-rl-refresh">刷新</button>' +
          '<span class="mc-rl-count"></span>' +
        '</div>' +
        '<div class="mc-rl-manual">' +
          '<span class="mc-rl-manual-label">添加资源</span>' +
          '<input type="url" class="mc-rl-manual-input" placeholder="粘贴图片 URL，添加到资源库，例如 https://cdn.example.com/banner.png">' +
          '<button type="button" class="mc-rl-manual-apply">添加到资源库</button>' +
        '</div>' +
        '<div class="mc-rl-manual-error"></div>' +
        '<div class="mc-rl-status"></div>' +
        '<div class="mc-rl-grid"></div>' +
        '<div class="mc-rl-foot">' +
          '<div class="mc-rl-selected">未选择资源</div>' +
          '<div class="mc-rl-foot-actions">' +
            '<button type="button" class="mc-rl-copy" disabled>复制 URL</button>' +
            '<button type="button" class="mc-rl-apply" disabled>插入到编辑器</button>' +
          '</div>' +
        '</div>' +
        '<div class="mc-rl-source"></div>' +
      '</div>';
    document.body.appendChild(back);

    refs.back = back;
    refs.panel = back.querySelector(".mc-rl-panel");
    refs.search = back.querySelector(".mc-rl-search");
    refs.grid = back.querySelector(".mc-rl-grid");
    refs.status = back.querySelector(".mc-rl-status");
    refs.count = back.querySelector(".mc-rl-count");
    refs.selected = back.querySelector(".mc-rl-selected");
    refs.copy = back.querySelector(".mc-rl-copy");
    refs.apply = back.querySelector(".mc-rl-apply");
    refs.source = back.querySelector(".mc-rl-source");
    refs.manualInput = back.querySelector(".mc-rl-manual-input");
    refs.manualApply = back.querySelector(".mc-rl-manual-apply");
    refs.manualError = back.querySelector(".mc-rl-manual-error");

    back.querySelector(".mc-rl-close").addEventListener("click", closeModal);
    back.addEventListener("click", function (event) {
      if (event.target === back) closeModal();
    });
    back.querySelector(".mc-rl-refresh").addEventListener("click", function () {
      loadResources(true);
    });
    refs.search.addEventListener("input", function () {
      state.keyword = refs.search.value || "";
      renderGrid();
    });
    refs.copy.addEventListener("click", copySelected);
    refs.apply.addEventListener("click", applySelected);
    refs.manualApply.addEventListener("click", addManualUrl);
    refs.manualInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        addManualUrl();
      }
    });
    refs.manualInput.addEventListener("input", function () {
      setManualError("");
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && refs.back && refs.back.classList.contains("is-open")) closeModal();
    });
  }

  function openModal(options) {
    if (!refs.back) buildModal();
    refs.back.classList.add("is-open");
    refs.search.value = state.keyword;
    state.selectedUrl = null;
    setManualError("");
    renderGrid();
    loadResources(false);
    var focusManual = !!(options && options.focusManual);
    setTimeout(function () {
      if (focusManual) refs.manualInput.focus();
      else refs.search.focus();
    }, 30);
  }

  function setManualError(message) {
    if (!refs.manualError) return;
    refs.manualError.textContent = message || "";
    refs.manualError.style.display = message ? "block" : "none";
  }

  function closeModal() {
    if (refs.back) refs.back.classList.remove("is-open");
  }

  function renderStatus(message) {
    if (!refs.status) return;
    refs.status.textContent = message || "";
    refs.status.style.display = message ? "block" : "none";
  }

  function renderGrid() {
    if (!refs.grid) return;
    var items = filteredResources();
    refs.count.textContent = state.resources.length
      ? items.length + " / " + state.resources.length + " 个资源"
      : "";
    if (!items.length) {
      refs.grid.innerHTML = '<div class="mc-rl-empty">' +
        (state.loading ? "加载中…" : (state.lastError ? "资源库加载失败，请点「刷新」重试。" : "没有匹配的资源。")) +
        '</div>';
      updateSelected();
      return;
    }
    refs.grid.innerHTML = items.map(function (item, index) {
      var active = item.url === state.selectedUrl ? " is-selected" : "";
      var thumb = item.kind === "image"
        ? '<img loading="lazy" src="' + escapeAttr(item.url) + '" alt="">'
        : '<span class="mc-rl-file">FILE</span>';
      return '<button type="button" class="mc-rl-card' + active + '" data-index="' + index + '" title="' + escapeAttr(item.url) + '">' +
        '<span class="mc-rl-thumb">' + thumb + '</span>' +
        '<span class="mc-rl-name">' + escapeHtml(item.name) + '</span>' +
        '</button>';
    }).join("");
    refs.grid.querySelectorAll(".mc-rl-card").forEach(function (card) {
      var item = items[Number(card.getAttribute("data-index"))];
      card.addEventListener("click", function () {
        state.selectedUrl = item.url;
        renderGrid();
      });
      card.addEventListener("dblclick", function () {
        state.selectedUrl = item.url;
        applySelected();
      });
    });
    updateSelected();
    renderSource();
  }

  function updateSelected() {
    if (!refs.selected) return;
    var item = state.resources.find(function (res) { return res.url === state.selectedUrl; });
    if (!item) {
      refs.selected.textContent = "未选择资源";
      refs.copy.disabled = true;
      refs.apply.disabled = true;
      return;
    }
    refs.selected.innerHTML = '<b>' + escapeHtml(item.name) + '</b><span>' + escapeHtml(item.url) + '</span>';
    refs.copy.disabled = false;
    refs.apply.disabled = false;
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function copySelected() {
    if (!state.selectedUrl) return;
    var url = state.selectedUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast("已复制资源 URL", "ok");
      }).catch(function () {
        fallbackCopy(url);
      });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(url) {
    var area = document.createElement("textarea");
    area.value = url;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); toast("已复制资源 URL", "ok"); }
    catch (err) { toast("复制失败：" + err.message, "error"); }
    area.remove();
  }

  // ---------------- 写入编辑器 ----------------
  function panelTitle(field) {
    var aside = field.closest('aside[data-testid="block-toolbar"]') || field.closest("aside");
    var title = aside ? aside.querySelector("h3") : null;
    return title ? text(title.textContent).trim().toLowerCase() : "";
  }

  /**
   * 当前可写入图片的目标：
   *   - 选中的是 Image 区块 -> data-locale-path="src"
   *   - 选中的是 Hero / Section -> data-locale-path="backgroundImage"
   */
  function currentImageTarget() {
    var src = document.querySelector('[data-locale-path="src"]');
    if (src && panelTitle(src) === "image") return { field: src, kind: "image" };
    var background = document.querySelector('[data-locale-path="backgroundImage"]');
    if (background) return { field: background, kind: "background" };
    return null;
  }

  function targetInput(target) {
    if (!target) return null;
    return target.field.querySelector('input[type="url"], input[type="text"]') ||
      target.field.querySelector("input");
  }

  async function ensureImageTarget(timeoutMs) {
    var target = currentImageTarget();
    if (target) return target;
    var insert = document.querySelector(IMAGE_BLOCK_SELECTOR);
    if (insert) insert.click();
    var deadline = Date.now() + (timeoutMs || 5000);
    while (Date.now() < deadline) {
      await sleep(120);
      target = currentImageTarget();
      if (target) return target;
    }
    return null;
  }

  function setNativeValue(input, value) {
    var proto = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function flash(input) {
    input.classList.add("mc-rl-flash");
    setTimeout(function () { input.classList.remove("mc-rl-flash"); }, 1200);
  }

  function normalizeManualUrl(raw) {
    var value = text(raw).trim();
    if (!value) return { error: "请先粘贴图片链接" };
    if (/^data:image\//i.test(value)) return { url: value };
    if (!/^https?:\/\//i.test(value)) {
      return { error: "链接需要以 http:// 或 https:// 开头" };
    }
    try {
      return { url: new URL(value).toString() };
    } catch (err) {
      return { error: "链接格式不正确：" + err.message };
    }
  }

  function nameFromUrl(url) {
    try {
      var path = new URL(url).pathname || "";
      return decodeURIComponent(path.split("/").pop() || "image");
    } catch (err) {
      return "image";
    }
  }

  async function insertUrl(url, item, applyButton, resetLabel) {
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.textContent = "写入中…";
    }
    try {
      var target = await ensureImageTarget(5000);
      if (!target) {
        toast("没有找到图片设置面板，请先插入一个 Image 区块", "error");
        return false;
      }
      var input = targetInput(target);
      if (!input) {
        toast("没有找到图片 URL 输入框", "error");
        return false;
      }
      setNativeValue(input, url);
      if (target.kind === "image") {
        var altField = document.querySelector('[data-locale-path="alt"] input');
        if (altField && !text(altField.value).trim()) {
          var alt = item ? prettyName(item.name) : prettyName(nameFromUrl(url));
          if (alt) setNativeValue(altField, alt);
        }
      }
      input.scrollIntoView({ block: "center", behavior: "smooth" });
      flash(input);
      closeModal();
      toast((target.kind === "background" ? "已设置背景图：" : "已插入资源：") + (item ? item.name : url), "ok");
      return true;
    } catch (err) {
      toast("插入失败：" + (err.message || err), "error");
      return false;
    } finally {
      if (applyButton) {
        applyButton.disabled = false;
        applyButton.textContent = resetLabel || "插入到编辑器";
      }
    }
  }

  async function applySelected() {
    if (!state.selectedUrl) return;
    var url = state.selectedUrl;
    var item = state.resources.find(function (res) { return res.url === url; });
    await insertUrl(url, item, refs.apply, "插入到编辑器");
  }

  async function addManualUrl() {
    var result = normalizeManualUrl(refs.manualInput.value);
    if (result.error) {
      setManualError(result.error);
      refs.manualInput.focus();
      return;
    }
    setManualError("");
    refs.manualApply.disabled = true;
    refs.manualApply.textContent = "添加中…";
    try {
      var resp = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url: result.url })
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      state.loaded = true;
      state.libraryFile = data.library_file || state.libraryFile;
      if (data.resource) {
        var exists = state.resources.some(function (item) { return item.url === data.resource.url; });
        if (!exists) state.resources.unshift(data.resource);
        state.selectedUrl = data.resource.url;
      }
      state.keyword = "";
      refs.search.value = "";
      renderGrid();
      var selectedCard = refs.grid.querySelector(".mc-rl-card.is-selected");
      if (selectedCard) selectedCard.scrollIntoView({ block: "nearest" });
      refs.manualInput.value = "";
      toast(data.duplicated ? "资源已存在，已为你选中" : "已添加到资源库，点「插入到编辑器」应用", "ok");
    } catch (err) {
      setManualError("添加失败：" + (err.message || err));
    } finally {
      refs.manualApply.disabled = false;
      refs.manualApply.textContent = "添加到资源库";
    }
  }

  // ---------------- 入口注入 ----------------
  function bindHeaderEntry() {
    var button = document.getElementById("mc-rl-open");
    if (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        openModal();
      });
    }
  }

  function buildInlineButton() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "mc-rl-inline";
    button.title = "从系统资源库选择图片";
    button.textContent = "资源库";
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openModal();
    });
    return button;
  }

  function injectIntoFieldHeader(field) {
    var header = field.firstElementChild;
    if (!header) return;
    var right = header.lastElementChild;
    if (!right || right.querySelector(".mc-rl-inline")) return;
    right.insertBefore(buildInlineButton(), right.firstChild);
  }

  function injectBackgroundEntry(target) {
    var field = target.field;
    var aside = field.closest('aside[data-testid="block-toolbar"]') || field.closest("aside");
    if (!aside) return;
    if (aside.querySelector(".mc-rl-bg-entry")) return;
    var header = aside.querySelector(":scope > fieldset > div") || aside.firstElementChild;
    if (!header) return;
    var entry = document.createElement("div");
    entry.className = "mc-rl-bg-entry";
    var label = document.createElement("span");
    label.textContent = "背景图";
    var button = buildInlineButton();
    entry.appendChild(label);
    entry.appendChild(button);
    header.insertAdjacentElement("afterend", entry);
  }

  function cleanupBackgroundEntry(target) {
    document.querySelectorAll(".mc-rl-bg-entry").forEach(function (node) {
      var aside = node.closest("aside");
      if (!target || target.kind !== "background" || !aside || !aside.contains(target.field)) {
        node.remove();
      }
    });
  }

  function injectPanelEntry() {
    var target = currentImageTarget();
    cleanupBackgroundEntry(target);
    if (!target) return;
    injectIntoFieldHeader(target.field);
    if (target.kind === "background") injectBackgroundEntry(target);
  }

  function watchEditor() {
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        injectPanelEntry();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function renderSource() {
    if (!refs.source) return;
    if (!state.libraryFile) {
      refs.source.textContent = "";
      return;
    }
    refs.source.textContent = "模拟资源库文件：" + state.libraryFile;
  }

  function boot() {
    bindHeaderEntry();
    watchEditor();
    injectPanelEntry();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
