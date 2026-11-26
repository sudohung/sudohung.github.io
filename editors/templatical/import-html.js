/*
 * Templatical HTML 导入扩展（样例）
 *
 * 入口：编辑器顶部「导入 HTML」
 * 能力：粘贴/上传 HTML 邮件 -> @templatical/import-html 转换为 TemplateContent
 *      -> 通过编辑器 exposed setContent() 直接载入画布
 */
(function () {
  "use strict";

  var BUNDLE_URL = "/editors/templatical/import-html.bundle.js";
  var refs = {};
  var converterPromise = null;
  var loadedFileName = "";

  function text(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function loadConverter() {
    if (window.TemplaticalImportHtml && typeof window.TemplaticalImportHtml.convertHtmlTemplate === "function") {
      return Promise.resolve(window.TemplaticalImportHtml);
    }
    if (converterPromise) return converterPromise;
    converterPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = BUNDLE_URL;
      script.onload = function () {
        if (window.TemplaticalImportHtml && typeof window.TemplaticalImportHtml.convertHtmlTemplate === "function") {
          resolve(window.TemplaticalImportHtml);
        } else {
          reject(new Error("转换器脚本已加载，但没有暴露 convertHtmlTemplate"));
        }
      };
      script.onerror = function () {
        reject(new Error("转换器脚本加载失败：" + BUNDLE_URL));
      };
      document.head.appendChild(script);
    });
    return converterPromise;
  }

  function setError(message) {
    refs.error.textContent = message || "";
    refs.error.style.display = message ? "block" : "none";
  }

  function setBusy(busy, label) {
    refs.convert.disabled = !!busy;
    refs.convert.textContent = busy ? (label || "转换中…") : "转换并载入";
  }

  function buildModal() {
    var back = document.createElement("div");
    back.className = "mc-import-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "导入 HTML");
    back.innerHTML =
      '<div class="mc-import-panel">' +
        '<div class="mc-import-head">' +
          '<div>' +
            '<h3>导入 HTML → Templatical</h3>' +
            '<p>使用 <span class="mc-import-code">@templatical/import-html</span> 把 HTML 邮件转换成 Templatical 区块，再载入编辑器。</p>' +
          '</div>' +
          '<button type="button" class="mc-import-close" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="mc-import-toolbar">' +
          '<label class="mc-import-file">选择 HTML 文件<input type="file" accept=".html,.htm,text/html" class="mc-import-file-input"></label>' +
          '<label class="mc-import-locale-label">默认语言' +
            '<select class="mc-import-locale">' +
              '<option value="en">en</option><option value="nl">nl</option><option value="de">de</option>' +
              '<option value="fr">fr</option><option value="es">es</option><option value="pt">pt</option>' +
              '<option value="it">it</option><option value="ja">ja</option><option value="ko">ko</option>' +
            '</select>' +
          '</label>' +
          '<span class="mc-import-file-name"></span>' +
        '</div>' +
        '<textarea class="mc-import-textarea" spellcheck="false" placeholder="粘贴 HTML 邮件源码，或选择 .html 文件…"></textarea>' +
        '<div class="mc-import-error"></div>' +
        '<div class="mc-import-report" style="display:none">' +
          '<div class="mc-import-summary"></div>' +
          '<div class="mc-import-warnings"></div>' +
          '<div class="mc-import-entries"></div>' +
        '</div>' +
        '<div class="mc-import-hint">注意：转换并载入会覆盖当前画布内容，建议先「存纯草稿」。</div>' +
        '<div class="mc-import-actions">' +
          '<button type="button" class="mc-import-cancel">关闭</button>' +
          '<button type="button" class="mc-import-convert">转换并载入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);

    refs.back = back;
    refs.textarea = back.querySelector(".mc-import-textarea");
    refs.file = back.querySelector(".mc-import-file-input");
    refs.fileName = back.querySelector(".mc-import-file-name");
    refs.locale = back.querySelector(".mc-import-locale");
    refs.error = back.querySelector(".mc-import-error");
    refs.report = back.querySelector(".mc-import-report");
    refs.summary = back.querySelector(".mc-import-summary");
    refs.warnings = back.querySelector(".mc-import-warnings");
    refs.entries = back.querySelector(".mc-import-entries");
    refs.convert = back.querySelector(".mc-import-convert");

    back.querySelector(".mc-import-close").addEventListener("click", closeModal);
    back.querySelector(".mc-import-cancel").addEventListener("click", closeModal);
    back.addEventListener("click", function (event) {
      if (event.target === back) closeModal();
    });
    refs.convert.addEventListener("click", convertAndLoad);
    refs.file.addEventListener("change", onFileChange);
    refs.textarea.addEventListener("input", function () { setError(""); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && refs.back && refs.back.classList.contains("is-open")) closeModal();
    });
  }

  function openModal() {
    if (!refs.back) buildModal();
    refs.back.classList.add("is-open");
    setError("");
    refs.report.style.display = "none";
    refs.textarea.focus();
    loadConverter().catch(function () { /* 转换时再提示 */ });
  }

  function closeModal() {
    if (refs.back) refs.back.classList.remove("is-open");
  }

  function onFileChange() {
    var file = refs.file.files && refs.file.files[0];
    if (!file) return;
    loadedFileName = file.name || "";
    refs.fileName.textContent = loadedFileName;
    var reader = new FileReader();
    reader.onload = function () {
      refs.textarea.value = text(reader.result);
      setError("");
    };
    reader.onerror = function () {
      setError("读取文件失败：" + (reader.error && reader.error.message ? reader.error.message : "unknown"));
    };
    reader.readAsText(file, "utf-8");
  }

  function extractTitle(html) {
    try {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var title = doc.querySelector("title");
      return title ? text(title.textContent).trim() : "";
    } catch (err) {
      return "";
    }
  }

  function statusClass(status) {
    if (status === "converted") return "is-ok";
    if (status === "approximated") return "is-warn";
    if (status === "html-fallback") return "is-fallback";
    return "is-skip";
  }

  function renderReport(report, html) {
    var summary = report.summary || {};
    refs.summary.innerHTML =
      '<span class="mc-import-pill is-ok">converted ' + text(summary.converted || 0) + '</span>' +
      '<span class="mc-import-pill is-warn">approximated ' + text(summary.approximated || 0) + '</span>' +
      '<span class="mc-import-pill is-fallback">html-fallback ' + text(summary.htmlFallback || 0) + '</span>' +
      '<span class="mc-import-pill is-skip">skipped ' + text(summary.skipped || 0) + '</span>' +
      '<span class="mc-import-total">total ' + text(summary.total || 0) + '</span>';

    var warnings = report.warnings || [];
    refs.warnings.innerHTML = warnings.length
      ? '<div class="mc-import-section-title">Warnings</div>' +
        warnings.slice(0, 12).map(function (w) {
          return '<div class="mc-import-warning">' + escapeHtml(w) + '</div>';
        }).join("") +
        (warnings.length > 12 ? '<div class="mc-import-more">… 还有 ' + (warnings.length - 12) + ' 条</div>' : "")
      : "";

    var issues = (report.entries || []).filter(function (entry) { return entry.status !== "converted"; });
    if (!issues.length) {
      refs.entries.innerHTML = '<div class="mc-import-section-title">Elements</div>' +
        '<div class="mc-import-allok">所有元素均完整转换</div>';
    } else {
      refs.entries.innerHTML = '<div class="mc-import-section-title">需要关注（' + issues.length + '）</div>' +
        issues.slice(0, 30).map(function (entry) {
          return '<div class="mc-import-entry">' +
            '<span class="mc-import-tag">' + escapeHtml(entry.sourceTag || "?") + '</span>' +
            '<span class="mc-import-arrow">→</span>' +
            '<span class="mc-import-block">' + escapeHtml(entry.templaticalBlockType || "—") + '</span>' +
            '<span class="mc-import-status ' + statusClass(entry.status) + '">' + escapeHtml(entry.status) + '</span>' +
            (entry.note ? '<span class="mc-import-note">' + escapeHtml(entry.note) + '</span>' : "") +
          '</div>';
        }).join("") +
        (issues.length > 30 ? '<div class="mc-import-more">… 还有 ' + (issues.length - 30) + ' 条</div>' : "");
    }
    refs.report.style.display = "block";

    var title = extractTitle(html);
    var nameInput = document.getElementById("name");
    if (nameInput) {
      var currentName = text(nameInput.value).trim();
      if (!currentName || currentName.indexOf("Templatical 自定义模板") === 0) {
        nameInput.value = title || loadedFileName.replace(/\.html?$/i, "") || "Imported HTML Template";
      }
    }
  }

  async function convertAndLoad() {
    var html = text(refs.textarea.value).trim();
    if (!html) {
      setError("请先粘贴 HTML，或选择一个 .html 文件");
      return;
    }
    setError("");
    setBusy(true, "加载转换器…");
    try {
      var converter = await loadConverter();
      setBusy(true, "转换中…");
      var result = converter.convertHtmlTemplate(html, { defaultLocale: refs.locale.value || "en" });
      if (!result || !result.content || !Array.isArray(result.content.blocks)) {
        throw new Error("转换结果不是有效的 TemplateContent");
      }
      var bridge = window.MC_TEMPLATICAL_EDITOR;
      var editor = bridge ? await bridge.wait(6000) : null;
      if (!editor || typeof editor.setContent !== "function") {
        throw new Error("没有找到 Templatical 编辑器实例，请刷新页面重试");
      }
      editor.setContent(result.content);
      if (window.MC_VARIABLE_SCHEMA) {
        window.MC_VARIABLE_SCHEMA.load([]);
        window.MC_VARIABLE_SCHEMA.syncFromContent(result.content);
      }
      renderReport(result.report || { summary: {}, entries: [], warnings: [] }, html);
      var status = document.getElementById("status");
      if (status) {
        status.textContent = "已导入 HTML：converted " +
          text((result.report && result.report.summary && result.report.summary.converted) || 0) +
          " / total " + text((result.report && result.report.summary && result.report.summary.total) || 0);
      }
    } catch (error) {
      setError("转换失败：" + (error && error.message ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  function boot() {
    var button = document.getElementById("mc-import-open");
    if (button) button.addEventListener("click", openModal);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
