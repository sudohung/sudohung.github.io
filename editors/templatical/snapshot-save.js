/*
 * 保存快照增强：拦截 Templatical 自己的「保存为 Mailchimp 模板」请求，
 * 把同一份导出 HTML 作为 token_html 一并写入 templatical_templates 快照。
 *
 * 这样快照同时具备：
 *   - content：设计态（保留锚点）
 *   - variables：变量 schema
 *   - token_html：发送态（锚点已归一化）
 *   - version：快照版本
 */
(function () {
  "use strict";

  if (typeof window.fetch !== "function") return;
  var originalFetch = window.fetch;
  var htmlByAccount = {};

  function accountFrom(url, pattern) {
    var match = text(url).match(pattern);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function parseJsonBody(init) {
    if (!init || typeof init.body !== "string") return null;
    try { return JSON.parse(init.body); } catch (err) { return null; }
  }

  function unlinkTokenAnchors(root) {
    var anchors = Array.prototype.slice.call(root.querySelectorAll("a"));
    anchors.forEach(function (anchorEl) {
      var hasChip = !!anchorEl.querySelector("[data-merge-tag]");
      var hasToken = /\{\{\s*[A-Za-z_][A-Za-z0-9_.]*\s*\}\}/.test(anchorEl.textContent || "");
      if (!hasChip && !hasToken) return;
      var parent = anchorEl.parentNode;
      if (!parent) return;
      while (anchorEl.firstChild) parent.insertBefore(anchorEl.firstChild, anchorEl);
      parent.removeChild(anchorEl);
    });
  }

  // 如果导出 HTML 里仍然残留 chip，保存前统一归一化成 {{key}}。
  function normalizeTokenHtml(html) {
    if (!html) return "";
    try {
      var doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("[data-merge-tag]").forEach(function (el) {
        var token = el.getAttribute("data-merge-tag") || el.textContent || "";
        el.replaceWith(doc.createTextNode(token));
      });
      // 变量组件不允许挂超链接：把包含 token 的 <a> 拆掉。
      unlinkTokenAnchors(doc);
      var doctype = /^<!doctype/i.test(html) ? "<!doctype html>\n" : "";
      return doctype + doc.documentElement.outerHTML;
    } catch (err) {
      return html;
    }
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();

    if (method !== "GET" && init && typeof init.body === "string") {
      try {
        // 1) 捕获即将发往 Mailchimp /templates 的导出 HTML
        if (/\/accounts\/[^/?#]+\/templates(?:\/[^/?#]+)?$/.test(url) &&
            (method === "POST" || method === "PATCH")) {
          var templatePayload = parseJsonBody(init);
          if (templatePayload && typeof templatePayload.html === "string" && templatePayload.html) {
            var templateAccount = accountFrom(url, /\/accounts\/([^/?#]+)\/templates/);
            var normalizedHtml = normalizeTokenHtml(templatePayload.html);
            if (templateAccount) htmlByAccount[templateAccount] = normalizedHtml;
            // 同步修正发给 Mailchimp 的模板 HTML，避免变量 token 被包在链接里。
            if (normalizedHtml !== templatePayload.html) {
              templatePayload.html = normalizedHtml;
              init = Object.assign({}, init, { body: JSON.stringify(templatePayload) });
            }
          }
        }

        // 2) 紧接着的 Templatical 快照请求，补上 variables + token_html
        if (/\/accounts\/[^/?#]+\/templatical-templates\/[^/?#]+$/.test(url) && method === "POST") {
          var snapshotAccount = accountFrom(url, /\/accounts\/([^/?#]+)\/templatical-templates\//);
          var captured = snapshotAccount ? htmlByAccount[snapshotAccount] : "";
          var snapshotPayload = parseJsonBody(init) || {};
          var snapshotChanged = false;
          if (window.MC_VARIABLE_SCHEMA && typeof window.MC_VARIABLE_SCHEMA.sanitizeContent === "function" && snapshotPayload.content) {
            var sanitizedContent = window.MC_VARIABLE_SCHEMA.sanitizeContent(snapshotPayload.content);
            if (JSON.stringify(sanitizedContent) !== JSON.stringify(snapshotPayload.content)) {
              snapshotPayload.content = sanitizedContent;
              snapshotChanged = true;
            }
          }
          if (captured) {
            if (!snapshotPayload.token_html) snapshotPayload.token_html = captured;
            if (!Array.isArray(snapshotPayload.variables) && window.MC_VARIABLE_SCHEMA) {
              snapshotPayload.variables = window.MC_VARIABLE_SCHEMA.get();
            }
            snapshotChanged = true;
            delete htmlByAccount[snapshotAccount];
          }
          if (snapshotChanged) {
            init = Object.assign({}, init, { body: JSON.stringify(snapshotPayload) });
          }
        }
      } catch (err) {
        // 任何解析失败都按原请求透传，不能阻塞模板保存
      }
    }

    return originalFetch.call(this, input, init);
  };
})();
