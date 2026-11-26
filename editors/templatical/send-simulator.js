/*
 * Templatical 发送模拟
 *
 * 选择已保存的模板快照/纯草稿 → 填写变量 → 渲染 token_html → 模拟发送。
 * 发送只在本地生成 email_send_snapshot（server 的 templatical_sends.json），
 * 不调用 Mailchimp 或任何真实邮件供应商。
 */
(function () {
  "use strict";

  var API = "/mailchimp/api";
  var state = {
    source: "draft",
    templates: [],
    drafts: [],
    selected: null,
    detail: null,
    html: "",
    requestSeq: 0,
    busy: false
  };
  var refs = {};

  function text(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function setStatus(message, type) {
    if (!refs.status) return;
    refs.status.textContent = message || "";
    refs.status.className = "ss-status" + (type ? " is-" + type : "");
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, options);
    var data = {};
    try { data = await response.json(); } catch (err) { data = {}; }
    if (!response.ok || !data || data.ok === false) {
      var error = new Error((data && data.error) || ("HTTP " + response.status));
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function normalizeSnapshot(item) {
    return {
      kind: "snapshot",
      id: text(item.template_id),
      templateId: text(item.template_id),
      name: text(item.name) || "未命名模板",
      account: text(item.account),
      accountName: text(item.account_name) || text(item.account),
      variableCount: Number(item.variable_count) || 0,
      tokenBytes: Number(item.token_html_bytes) || 0,
      hasToken: !!item.has_token_html,
      version: Number(item.version) || 0,
      savedAt: text(item.saved_at)
    };
  }

  function normalizeDraft(item) {
    return {
      kind: "draft",
      id: text(item.id),
      name: text(item.name) || "未命名草稿",
      account: text(item.account),
      accountName: text(item.account_name) || text(item.account),
      variableCount: Number(item.variable_count) || 0,
      tokenBytes: Number(item.token_html_bytes) || 0,
      hasToken: !!item.has_token_html || (Number(item.token_html_bytes) || 0) > 0,
      version: Number(item.version) || 0,
      savedAt: text(item.updated_at) || text(item.created_at)
    };
  }

  function currentItems() {
    return state.source === "snapshot" ? state.templates : state.drafts;
  }

  function sourceLabel(kind) {
    return kind === "snapshot" ? "模板快照" : "纯草稿";
  }

  function markTabs() {
    refs.tabs.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-source") === state.source);
    });
  }

  function renderList() {
    if (!refs.list) return;
    var items = currentItems();
    if (!items.length) {
      refs.list.innerHTML = '<div class="ss-note">还没有' + escapeHtml(sourceLabel(state.source)) + "记录。</div>";
      return;
    }
    refs.list.innerHTML = items.map(function (item) {
      var active = state.selected && state.selected.kind === item.kind && state.selected.id === item.id;
      var badges = [
        '<span class="ss-pill ' + (item.hasToken ? "ok" : "warn") + '">' +
          (item.hasToken ? "token_html" : "无 token_html") + "</span>"
      ];
      if (item.variableCount) badges.push('<span class="ss-pill primary">' + item.variableCount + " 变量</span>");
      if (item.version) badges.push('<span class="ss-pill">v' + item.version + "</span>");
      return (
        '<button type="button" class="ss-item' + (active ? " is-active" : "") + (item.hasToken ? "" : " is-disabled") + '"' +
          ' data-kind="' + escapeHtml(item.kind) + '" data-id="' + escapeHtml(item.id) + '"' +
          (item.hasToken ? "" : " disabled title=\"该记录没有 token_html，请先在编辑器中重新保存\"") + ">" +
          '<div class="ss-item-name">' + escapeHtml(item.name) + "</div>" +
          '<div class="ss-item-meta">' + escapeHtml(item.accountName) + " · " +
            escapeHtml(item.savedAt || "—") + "</div>" +
          '<div class="ss-item-badges">' + badges.join("") + "</div>" +
        "</button>"
      );
    }).join("");

    refs.list.querySelectorAll(".ss-item:not([disabled])").forEach(function (button) {
      button.addEventListener("click", function () {
        var items = currentItems();
        var item = items.find(function (entry) {
          return entry.kind === button.getAttribute("data-kind") && entry.id === button.getAttribute("data-id");
        });
        if (item) selectItem(item);
      });
    });
  }

  function markActive() {
    if (!refs.list) return;
    refs.list.querySelectorAll(".ss-item").forEach(function (button) {
      var active = state.selected &&
        button.getAttribute("data-kind") === state.selected.kind &&
        button.getAttribute("data-id") === state.selected.id;
      button.classList.toggle("is-active", !!active);
    });
  }

  function clearSelection(message, isError) {
    state.selected = null;
    state.detail = null;
    state.html = "";
    if (refs.content) refs.content.hidden = true;
    if (refs.empty) {
      refs.empty.hidden = false;
      refs.empty.classList.toggle("is-error", !!isError);
      refs.empty.innerHTML =
        '<div class="ss-empty-title">' + (isError ? "暂时无法发送" : "请选择左侧记录") + "</div>" +
        '<div class="ss-empty-desc">' + escapeHtml(message || "选择模板快照或纯草稿后，在这里填写变量值、渲染并模拟发送。") + "</div>";
    }
    if (refs.result) refs.result.hidden = true;
    if (refs.sendInfo) refs.sendInfo.textContent = "";
    if (refs.warning) refs.warning.hidden = true;
    setStatus("");
    markActive();
  }

  function renderSelected() {
    var item = state.selected;
    if (!item || !state.detail) return;
    if (refs.empty) refs.empty.hidden = true;
    if (refs.content) refs.content.hidden = false;
    refs.name.textContent = item.name;
    refs.meta.textContent = sourceLabel(item.kind) + " · " + item.accountName +
      (item.version ? " · v" + item.version : "") +
      " · " + item.variableCount + " 个变量" +
      (item.tokenBytes ? " · token_html " + item.tokenBytes + " bytes" : "");
    var badges = [];
    badges.push('<span class="ss-pill ok">token_html</span>');
    if (item.version) badges.push('<span class="ss-pill">v' + item.version + "</span>");
    if (item.variableCount) badges.push('<span class="ss-pill primary">' + item.variableCount + " 变量</span>");
    refs.badges.innerHTML = badges.join("");
    renderForm();
  }

  function variableValue(variable) {
    return text(variable.sample || variable["default"] || "");
  }

  function renderForm() {
    var variables = (state.detail && state.detail.variables) || [];
    if (!variables.length) {
      refs.form.innerHTML = '<div class="ss-note">该模板没有定义变量，可以直接渲染 / 模拟发送。</div>';
      return;
    }
    refs.form.innerHTML = variables.map(function (variable) {
      var key = text(variable.key);
      var type = text(variable.type) || "text";
      var required = variable.required !== false;
      var value = variableValue(variable);
      var input = type === "html"
        ? '<textarea data-key="' + escapeHtml(key) + '" data-type="html" placeholder="HTML 内容">' +
            escapeHtml(value) + "</textarea>"
        : '<input type="text" data-key="' + escapeHtml(key) + '" data-type="' + escapeHtml(type) + '" value="' +
            escapeHtml(value) + '" placeholder="请输入 ' + escapeHtml(key) + '">';
      return (
        '<label class="ss-field" data-field-key="' + escapeHtml(key) + '">' +
          '<span class="ss-field-label">' +
            "<code>{{" + escapeHtml(key) + "}}</code>" +
            '<span class="ss-field-type">' + escapeHtml(type) + "</span>" +
            (required ? '<span class="ss-field-required">required</span>' : "") +
          "</span>" +
          (variable.description ? '<span class="ss-field-desc">' + escapeHtml(variable.description) + "</span>" : "") +
          input +
        "</label>"
      );
    }).join("");

    refs.form.querySelectorAll("[data-key]").forEach(function (field) {
      field.addEventListener("input", function () {
        var wrap = field.closest(".ss-field");
        if (wrap) wrap.classList.remove("is-missing");
        setStatus("");
      });
    });
  }

  function collectValues() {
    var values = {};
    if (!refs.form) return values;
    refs.form.querySelectorAll("[data-key]").forEach(function (field) {
      values[field.getAttribute("data-key")] = field.value;
    });
    return values;
  }

  function missingRequired(values) {
    var variables = (state.detail && state.detail.variables) || [];
    return variables.filter(function (variable) {
      if (variable.required === false) return false;
      var value = values[variable.key];
      if (value == null) value = variableValue(variable);
      return !text(value).trim();
    }).map(function (variable) { return variable.key; });
  }

  function applyMissing(keys) {
    if (!refs.form || !keys || !keys.length) return;
    refs.form.querySelectorAll(".ss-field").forEach(function (field) {
      field.classList.remove("is-missing");
    });
    var first = null;
    keys.forEach(function (key) {
      refs.form.querySelectorAll(".ss-field").forEach(function (field) {
        if (field.getAttribute("data-field-key") !== key) return;
        field.classList.add("is-missing");
        if (!first) first = field.querySelector("[data-key]");
      });
    });
    if (first) first.focus();
  }

  function fillSamples() {
    if (!state.detail) return;
    var variables = state.detail.variables || [];
    variables.forEach(function (variable) {
      refs.form.querySelectorAll("[data-key]").forEach(function (field) {
        if (field.getAttribute("data-key") !== variable.key) return;
        field.value = variableValue(variable);
        var wrap = field.closest(".ss-field");
        if (wrap) wrap.classList.remove("is-missing");
      });
    });
    setStatus("已用示例值 / 默认值填充。");
  }

  function setBusy(busy) {
    state.busy = busy;
    if (refs.render) refs.render.disabled = busy;
    if (refs.send) refs.send.disabled = busy;
  }

  function showResultTab(tab) {
    if (!refs.frame || !refs.html) return;
    var preview = tab !== "html";
    refs.frame.hidden = !preview;
    refs.html.hidden = preview;
    refs.resultTabs.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-tab") === tab);
    });
  }

  function showResult(data, meta) {
    meta = meta || {};
    var html = data.html || "";
    state.html = html;
    refs.result.hidden = false;
    refs.frame.srcdoc = html || "<!doctype html><html><body></body></html>";
    refs.html.textContent = html;
    showResultTab("preview");

    var warnings = [];
    (data.missing || []).forEach(function (key) {
      warnings.push("缺少必填值：" + "{{" + key + "}}");
    });
    (data.unknown || []).forEach(function (key) {
      warnings.push("正文存在未定义变量：" + "{{" + key + "}}");
    });
    (meta.requiredMissing || []).forEach(function (key) {
      warnings.push("必填变量为空：" + "{{" + key + "}}");
    });
    warnings = warnings.filter(function (message, index, list) {
      return list.indexOf(message) === index;
    });

    if (meta.sent) {
      refs.warning.hidden = false;
      refs.warning.className = "ss-warning is-ok";
      refs.warning.textContent = "模拟发送成功，未真实投递；最终 HTML 已生成。";
    } else if (warnings.length) {
      refs.warning.hidden = false;
      refs.warning.className = "ss-warning";
      refs.warning.textContent = warnings.join("；");
    } else {
      refs.warning.hidden = true;
      refs.warning.textContent = "";
    }

    if (meta.sent) {
      refs.sendInfo.innerHTML =
        "模拟发送 <b>" + escapeHtml(data.id || "") + "</b><br>" +
        "message id: " + escapeHtml(data.provider_message_id || "") + "<br>" +
        escapeHtml(data.sent_at || "");
      setStatus("模拟发送成功（未真实投递），最终 HTML 已生成。", "ok");
    } else {
      refs.sendInfo.textContent = "";
      setStatus("渲染完成；可查看预览或继续模拟发送。", "ok");
    }
  }

  async function selectItem(item) {
    if (!item || !item.hasToken) {
      clearSelection("该记录没有 token_html，请先在 Templatical 编辑器中重新保存一次。", true);
      return;
    }
    var seq = ++state.requestSeq;
    state.selected = item;
    markActive();
    setStatus("正在加载记录…");
    if (refs.empty) refs.empty.hidden = true;
    if (refs.content) refs.content.hidden = true;

    try {
      var detail;
      if (item.kind === "snapshot") {
        var snapshotData = await fetchJson(
          API + "/accounts/" + encodeURIComponent(item.account) +
          "/templatical-templates/" + encodeURIComponent(item.templateId)
        );
        detail = snapshotData.item;
      } else {
        var draftData = await fetchJson(API + "/templatical-drafts/" + encodeURIComponent(item.id));
        detail = draftData.draft;
      }
      if (seq !== state.requestSeq) return;
      if (!detail || !text(detail.token_html).trim()) {
        throw new Error("该记录没有 token_html，请先在编辑器中重新保存");
      }
      state.detail = detail;
      state.html = "";
      if (refs.result) refs.result.hidden = true;
      if (refs.sendInfo) refs.sendInfo.textContent = "";
      if (refs.warning) refs.warning.hidden = true;
      renderSelected();
      setStatus("已加载，请填写变量值。");
    } catch (err) {
      if (seq !== state.requestSeq) return;
      clearSelection("加载失败：" + (err.message || err), true);
    }
  }

  async function renderPreview() {
    if (state.busy || !state.detail) return;
    var values = collectValues();
    var requiredMissing = missingRequired(values);
    applyMissing(requiredMissing);
    setBusy(true);
    setStatus("正在渲染 token_html…");
    try {
      var data = await fetchJson(API + "/templatical-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          token_html: state.detail.token_html,
          variables: state.detail.variables || [],
          values: values
        })
      });
      showResult(data, { sent: false, requiredMissing: requiredMissing });
    } catch (err) {
      setStatus("渲染失败：" + (err.message || err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function simulateSend() {
    if (state.busy || !state.detail || !state.selected) return;
    var values = collectValues();
    var requiredMissing = missingRequired(values);
    applyMissing(requiredMissing);
    if (requiredMissing.length) {
      setStatus("请先填写必填变量：" + requiredMissing.map(function (key) { return "{{" + key + "}}"; }).join(", "), "error");
      return;
    }
    var item = state.selected;
    setBusy(true);
    setStatus("正在模拟发送（不会真实投递）…");
    try {
      var data = await fetchJson(API + "/templatical-send-simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          source: item.kind,
          id: item.kind === "snapshot" ? item.templateId : item.id,
          account: item.account,
          values: values
        })
      });
      showResult(data, { sent: true, requiredMissing: [] });
    } catch (err) {
      var errorData = err.data || {};
      if (errorData.missing && errorData.missing.length) applyMissing(errorData.missing);
      if (errorData.html) {
        showResult(errorData, { sent: false, requiredMissing: errorData.missing || [] });
      }
      setStatus("模拟发送失败：" + (err.message || err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadLists() {
    if (!refs.list) return;
    refs.list.innerHTML = '<div class="ss-note">加载中…</div>';
    setStatus("");
    try {
      var results = await Promise.all([
        fetchJson(API + "/templatical-templates"),
        fetchJson(API + "/templatical-drafts")
      ]);
      state.templates = (results[0].templates || []).map(normalizeSnapshot);
      state.drafts = (results[1].drafts || []).map(normalizeDraft);

      var snapshotAvailable = state.templates.some(function (item) { return item.hasToken; });
      var draftAvailable = state.drafts.some(function (item) { return item.hasToken; });
      if (!snapshotAvailable && draftAvailable) state.source = "draft";
      else if (snapshotAvailable) state.source = "snapshot";
      else state.source = draftAvailable ? "draft" : "snapshot";

      markTabs();
      renderList();

      var items = currentItems();
      var first = items.find(function (item) { return item.hasToken; });
      if (first) {
        await selectItem(first);
      } else {
        clearSelection("当前分类下没有带 token_html 的记录。请先在 Templatical 中保存草稿或模板。", true);
      }
    } catch (err) {
      refs.list.innerHTML = '<div class="ss-note">加载失败：' + escapeHtml(err.message || err) + "</div>";
      clearSelection("加载记录失败：" + (err.message || err), true);
    }
  }

  async function switchSource(source) {
    if (state.source === source) return;
    state.source = source;
    markTabs();
    renderList();
    var items = currentItems();
    var current = state.selected && items.find(function (item) {
      return item.kind === state.selected.kind && item.id === state.selected.id;
    });
    if (current && current.hasToken) {
      markActive();
      return;
    }
    var first = items.find(function (item) { return item.hasToken; });
    if (first) await selectItem(first);
    else clearSelection("该分类下没有带 token_html 的记录。请先在 Templatical 中重新保存。", true);
  }

  function boot() {
    refs.list = document.getElementById("ss-list");
    refs.refresh = document.getElementById("ss-refresh");
    refs.empty = document.getElementById("ss-empty");
    refs.content = document.getElementById("ss-content");
    refs.name = document.getElementById("ss-name");
    refs.meta = document.getElementById("ss-meta");
    refs.badges = document.getElementById("ss-badges");
    refs.form = document.getElementById("ss-form");
    refs.warning = document.getElementById("ss-warning");
    refs.status = document.getElementById("ss-status");
    refs.render = document.getElementById("ss-render");
    refs.send = document.getElementById("ss-send");
    refs.fill = document.getElementById("ss-fill");
    refs.result = document.getElementById("ss-result");
    refs.frame = document.getElementById("ss-frame");
    refs.html = document.getElementById("ss-html");
    refs.sendInfo = document.getElementById("ss-send-info");
    refs.tabs = Array.prototype.slice.call(document.querySelectorAll(".ss-tab"));
    refs.resultTabs = Array.prototype.slice.call(document.querySelectorAll(".ss-result-tab"));

    refs.tabs.forEach(function (button) {
      button.addEventListener("click", function () {
        switchSource(button.getAttribute("data-source"));
      });
    });
    refs.refresh.addEventListener("click", loadLists);
    refs.fill.addEventListener("click", fillSamples);
    refs.render.addEventListener("click", renderPreview);
    refs.send.addEventListener("click", simulateSend);
    refs.resultTabs.forEach(function (button) {
      button.addEventListener("click", function () {
        showResultTab(button.getAttribute("data-tab"));
      });
    });

    loadLists();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
