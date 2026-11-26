/*
 * Templatical 预览：用保存下来的 token_html + variable schema 的 sample/default
 * 渲染出最终 HTML，并在 iframe 中展示。
 *
 * - 当前编辑内容：现场生成 token_html 后调用 /templatical-preview
 * - 草稿箱：读取草稿保存的 token_html 后渲染
 */
(function () {
  "use strict";

  var API_BASE = "/mailchimp/api";
  var refs = {};
  var lastHtml = "";
  var busy = false;

  function text(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function setStatus(message) {
    var node = document.getElementById("status");
    if (node) node.textContent = message;
  }

  function toast(message) {
    var node = document.createElement("div");
    node.className = "mc-preview-toast is-error";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () {
      node.classList.add("is-out");
      setTimeout(function () { node.remove(); }, 260);
    }, 5000);
  }

  function build() {
    if (refs.back) return;
    var back = document.createElement("div");
    back.className = "mc-preview-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "邮件预览");
    back.innerHTML =
      '<div class="mc-preview-panel">' +
        '<div class="mc-preview-head">' +
          '<div>' +
            '<div class="mc-preview-title" id="mc-preview-title">邮件预览</div>' +
            '<div class="mc-preview-sub" id="mc-preview-sub"></div>' +
          '</div>' +
          '<div class="mc-preview-actions">' +
            '<button type="button" class="mc-preview-download">下载渲染 HTML</button>' +
            '<button type="button" class="mc-preview-close" aria-label="关闭">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="mc-preview-warning" id="mc-preview-warning" hidden></div>' +
        '<iframe class="mc-preview-frame" id="mc-preview-frame" title="邮件预览" sandbox="allow-same-origin"></iframe>' +
        '<div class="mc-preview-data" id="mc-preview-data" hidden></div>' +
      '</div>';
    document.body.appendChild(back);

    refs.back = back;
    refs.title = back.querySelector("#mc-preview-title");
    refs.sub = back.querySelector("#mc-preview-sub");
    refs.warning = back.querySelector("#mc-preview-warning");
    refs.frame = back.querySelector("#mc-preview-frame");
    refs.data = back.querySelector("#mc-preview-data");
    refs.download = back.querySelector(".mc-preview-download");

    back.querySelector(".mc-preview-close").addEventListener("click", close);
    back.addEventListener("click", function (event) {
      if (event.target === back) close();
    });
    refs.download.addEventListener("click", download);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && refs.back && refs.back.classList.contains("is-open")) close();
    });
  }

  function open(data, meta) {
    build();
    lastHtml = data.html || "";
    refs.title.textContent = meta.title || "邮件预览";
    refs.sub.textContent = meta.subtitle || "";

    var warnings = [];
    if (data.missing && data.missing.length) {
      warnings.push("缺少示例值：" + data.missing.map(function (key) { return "{{" + key + "}}"; }).join(", "));
    }
    if (data.unknown && data.unknown.length) {
      warnings.push("正文存在未定义变量：" + data.unknown.map(function (key) { return "{{" + key + "}}"; }).join(", "));
    }
    refs.warning.hidden = !warnings.length;
    refs.warning.textContent = warnings.join("；");

    refs.frame.srcdoc = lastHtml || "<!doctype html><html><body></body></html>";
    refs.data.hidden = false;
    var used = data.used || {};
    var keys = Object.keys(used);
    refs.data.innerHTML = keys.length
      ? '<b>预览数据</b> ' + keys.map(function (key) {
          return '<code>' + escapeHtml(key) + '=' + escapeHtml(used[key]) + '</code>';
        }).join(" ")
      : '<span>没有可展示的示例数据</span>';

    refs.back.classList.add("is-open");
  }

  function close() {
    if (refs.back) refs.back.classList.remove("is-open");
  }

  function download() {
    if (!lastHtml) return;
    var blob = new Blob([lastHtml], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "templatical-preview.html";
    anchor.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function previewCurrent() {
    if (busy) return;
    busy = true;
    try {
      var bridge = window.MC_TEMPLATICAL_EDITOR;
      var api = bridge ? await bridge.wait(6000) : null;
      if (!api) throw new Error("没有找到编辑器实例");
      var schema = window.MC_VARIABLE_SCHEMA;
      var content = api.getContent();
      if (schema && typeof schema.validateContent === "function") {
        var validation = schema.validateContent(content);
        if (!validation.ok) {
          throw new Error("正文存在未定义变量：" + validation.missing.map(function (key) {
            return "{{" + key + "}}";
          }).join(", "));
        }
      }
      setStatus("正在生成 token_html…");
      var tokenHtml = schema && typeof schema.tokenHtml === "function" ? await schema.tokenHtml() : "";
      if (!tokenHtml) throw new Error("token_html 生成失败，请确认编辑器已加载完成");
      setStatus("正在渲染预览…");
      var resp = await fetch(API_BASE + "/templatical-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          token_html: tokenHtml,
          variables: schema ? schema.get() : []
        })
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      open(data, {
        title: "当前编辑内容 · 示例渲染",
        subtitle: "token_html + variables（sample / default）"
      });
      setStatus("预览已生成（示例数据）");
    } catch (err) {
      setStatus("预览失败：" + (err.message || err));
      toast("预览失败：" + (err.message || err));
    } finally {
      busy = false;
    }
  }

  async function previewDraft(id) {
    if (busy || !id) return;
    busy = true;
    try {
      setStatus("正在加载草稿预览…");
      var resp = await fetch(API_BASE + "/templatical-drafts/" + encodeURIComponent(id) + "/preview", {
        headers: { Accept: "application/json" }
      });
      var data = await resp.json();
      if (!resp.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("HTTP " + resp.status));
      }
      open(data, {
        title: (data.name || "草稿") + " · 示例渲染",
        subtitle: "草稿 #" + id + (data.account_name ? " · 账号 " + data.account_name : "")
      });
      setStatus("草稿预览已生成（示例数据）");
    } catch (err) {
      setStatus("预览失败：" + (err.message || err));
      toast("预览失败：" + (err.message || err));
    } finally {
      busy = false;
    }
  }

  function boot() {
    var button = document.getElementById("mc-preview-open");
    if (button) button.addEventListener("click", previewCurrent);
    window.MC_VARIABLE_PREVIEW = {
      openCurrent: previewCurrent,
      openDraft: previewDraft
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
