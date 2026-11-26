/*
 * Templatical Handlebars 变量侧栏（样例扩展）
 *
 * 交互：
 *   1. 在正文中双击文本并出现光标后，左侧自动出现变量面板；
 *   2. 面板第一部分用于插入新锚点（新建变量）；
 *   3. 第二部分列出已定义变量，点击即可在当前光标处复用并插入锚点；
 *   4. 插入锚点或点击正文中的 merge tag chip 时，面板切换为该变量的编辑态。
 *
 * 插入实现不依赖编辑器是否仍处于 focused 状态：光标位置被记录成
 * {blockId, start, end} 文本偏移，插入时直接修改该 block 的 content HTML，
 * 再通过 setContent 重新渲染，因此用户可以先在侧栏输入变量信息。
 */
(function () {
  "use strict";

  var VARIABLE_TYPES = ["text", "number", "currency", "url", "html", "date"];
  var KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
  var BLOCKED_KEYS = ["__proto__", "constructor", "prototype"];

  var state = {
    list: [],
    caret: null,          // { blockId, start, end }
    selectedText: "",
    usage: {},
    editingKey: null,
    mode: "insert",       // insert | edit
    lockEditUntil: 0,
    variablePointerAt: 0,
    chipSelected: false,
    search: ""
  };

  var refs = {};
  var TEXT_BLOCK_TYPES = ["title", "paragraph", "heading", "text", "rich-text", "list"];
  var dragState = null;
  var dragGhost = null;
  var dropTargetEl = null;
  var lastChipMouseUpAt = 0;

  function text(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function escapeRegExp(value) {
    return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function setStatus(message) {
    var node = document.getElementById("status");
    if (node) node.textContent = message;
  }

  function setError(message) {
    if (!refs.error) return;
    refs.error.textContent = message || "";
    refs.error.style.display = message ? "block" : "none";
  }

  // ---------------------------------------------------------------- schema

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    var key = text(raw.key).trim();
    if (!KEY_RE.test(key) || BLOCKED_KEYS.indexOf(key) >= 0) return null;
    var type = VARIABLE_TYPES.indexOf(raw.type) >= 0 ? raw.type : "text";
    return {
      key: key,
      type: type,
      required: raw.required !== false,
      "default": text(raw["default"]),
      sample: text(raw.sample),
      description: text(raw.description)
    };
  }

  function normalizeList(rawList) {
    var seen = {};
    var list = [];
    (Array.isArray(rawList) ? rawList : []).forEach(function (raw) {
      var item = normalizeItem(raw);
      if (!item || seen[item.key]) return;
      seen[item.key] = true;
      list.push(item);
    });
    return list;
  }

  function findItem(key) {
    return state.list.find(function (item) { return item.key === key; }) || null;
  }

  function syncFromContent(content) {
    var source = "";
    try {
      source = JSON.stringify(content || {});
    } catch (err) {
      return 0;
    }
    var found = {};
    var spanRe = /data-merge-tag="([^"]+)"/g;
    var tokenRe = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;
    var match;
    while ((match = spanRe.exec(source))) found[match[1]] = true;
    while ((match = tokenRe.exec(source))) found[match[1]] = true;
    var added = 0;
    Object.keys(found).forEach(function (raw) {
      var key = raw.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
      if (!KEY_RE.test(key) || BLOCKED_KEYS.indexOf(key) >= 0) return;
      if (findItem(key)) return;
      state.list.push({ key: key, type: "text", required: true, "default": "", sample: "", description: "" });
      added += 1;
    });
    if (added) renderReuseList();
    return added;
  }

  function loadSchema(list) {
    state.list = normalizeList(list);
    if (state.editingKey && !findItem(state.editingKey)) setMode("insert");
    renderReuseList();
  }

  function getSchema() {
    return state.list.map(function (item) { return Object.assign({}, item); });
  }

  function upsert(item) {
    var index = state.list.findIndex(function (existing) { return existing.key === item.key; });
    if (index >= 0) state.list[index] = item;
    else state.list.push(item);
    renderReuseList();
  }

  // ------------------------------------------------------------- selection

  function isInEditor(node) {
    if (!node) return false;
    var el = node.nodeType === 3 ? node.parentElement : node;
    return !!(el && el.closest && el.closest(".ProseMirror"));
  }

  function closestChip(node) {
    if (!node) return null;
    var el = node.nodeType === 3 ? node.parentElement : node;
    return el && el.closest ? el.closest(".tpl-merge-tag-node") : null;
  }

  function blockIdOf(node) {
    if (!node) return "";
    var el = node.nodeType === 3 ? node.parentElement : node;
    var block = el && el.closest && el.closest("[data-block-id]");
    return block ? block.getAttribute("data-block-id") || "" : "";
  }

  function chipKey(chip) {
    if (!chip) return "";
    var raw = chip.getAttribute("data-merge-tag") || "";
    if (!raw) {
      var tooltip = chip.querySelector("[data-tooltip]");
      if (tooltip) raw = tooltip.getAttribute("data-tooltip") || "";
    }
    if (!raw) raw = chip.textContent || "";
    var match = raw.match(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/);
    return match ? match[1] : "";
  }

  function textOffset(root, node, offset) {
    try {
      var range = document.createRange();
      range.selectNodeContents(root);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (err) {
      return 0;
    }
  }

  function captureCaret() {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    var range = selection.getRangeAt(0);
    if (!isInEditor(range.startContainer)) return null;
    var editor = document.querySelector(".ProseMirror");
    var blockId = blockIdOf(range.startContainer);
    if (!editor || !blockId) return null;
    var start = textOffset(editor, range.startContainer, range.startOffset);
    var end = range.collapsed ? start : textOffset(editor, range.endContainer, range.endOffset);
    if (end < start) end = start;
    return { blockId: blockId, start: start, end: end };
  }

  function currentEditorApi() {
    var bridge = window.MC_TEMPLATICAL_EDITOR;
    return bridge && typeof bridge.get === "function" ? bridge.get() : null;
  }

  // -------------------------------------------------------- content insert

  function getBlockById(content, blockId) {
    var found = null;
    (function walk(node) {
      if (!node || found) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== "object") return;
      if (node.id === blockId && typeof node.content === "string") {
        found = node;
        return;
      }
      Object.keys(node).forEach(function (key) { walk(node[key]); });
    })(content);
    return found;
  }

  /**
   * 在 block content HTML 的 [start, end) 文本偏移处插入 token HTML。
   * start/end 是在正文编辑器里按纯文本长度记录的，避免依赖已关闭的 DOM 选区。
   */
  function insertTokenIntoHtml(html, start, end, tokenHtml) {
    var wrapper = '<div id="mc-var-root">' + (html || "<p></p>") + "</div>";
    var doc = new DOMParser().parseFromString(wrapper, "text/html");
    var root = doc.getElementById("mc-var-root");
    if (!root) return html;

    var textNodes = [];
    (function collect(node) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) textNodes.push(child);
        else if (child.nodeType === 1 && child.tagName !== "SCRIPT" && child.tagName !== "STYLE") collect(child);
      }
    })(root);

    var total = 0;
    var startInfo = null;
    var endInfo = null;
    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      var len = node.nodeValue.length;
      if (!startInfo && start <= total + len) startInfo = { node: node, offset: start - total };
      if (!endInfo && end <= total + len) endInfo = { node: node, offset: end - total };
      total += len;
    }

    if (!textNodes.length) {
      var paragraph = doc.createElement("p");
      paragraph.innerHTML = tokenHtml;
      root.appendChild(paragraph);
      return root.innerHTML;
    }

    if (!startInfo) {
      var last = textNodes[textNodes.length - 1];
      startInfo = { node: last, offset: last.nodeValue.length };
    }
    if (!endInfo) endInfo = startInfo;

    function clampText(info) {
      info.offset = Math.max(0, Math.min(info.offset, info.node.nodeValue.length));
      return info;
    }
    clampText(startInfo);
    clampText(endInfo);

    // merge tag chip 是原子节点：光标落在 chip 文本边界时，插入点必须放到
    // chip 外面，否则会产生嵌套的 data-merge-tag span，导出 token_html 时被吞掉。
    function chipOf(node) {
      var el = node.nodeType === 3 ? node.parentElement : node;
      if (!el || !el.closest) return null;
      var chip = el.closest("[data-merge-tag]");
      return chip && root.contains(chip) ? chip : null;
    }
    function boundaryOf(info) {
      var chip = chipOf(info.node);
      if (!chip) return { node: info.node, offset: info.offset };
      return info.offset <= 0
        ? { element: chip, before: true }
        : { element: chip, after: true };
    }

    var range = doc.createRange();
    function setStart(boundary) {
      if (boundary.element) {
        if (boundary.before) range.setStartBefore(boundary.element);
        else range.setStartAfter(boundary.element);
      } else {
        range.setStart(boundary.node, boundary.offset);
      }
    }
    function setEnd(boundary) {
      if (boundary.element) {
        if (boundary.before) range.setEndBefore(boundary.element);
        else range.setEndAfter(boundary.element);
      } else {
        range.setEnd(boundary.node, boundary.offset);
      }
    }
    setStart(boundaryOf(startInfo));
    setEnd(boundaryOf(endInfo));
    if (!range.collapsed) range.deleteContents();

    var holder = doc.createElement("span");
    holder.innerHTML = tokenHtml;
    var fragment = doc.createDocumentFragment();
    while (holder.firstChild) fragment.appendChild(holder.firstChild);
    range.insertNode(fragment);

    return root.innerHTML;
  }

  function tokenHtml(key) {
    return '<span data-merge-tag="{{' + key + '}}" data-label="{{' + key + '}}">{{' + key + '}}</span>';
  }

  function mergeTagKeyOf(el) {
    var raw = el && el.getAttribute ? (el.getAttribute("data-merge-tag") || "") : "";
    var match = raw.match(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/);
    return match ? match[1] : raw.replace(/[{}]/g, "").trim();
  }

  function stripVariableFromString(source, key, tokenRe) {
    if (source.indexOf("data-merge-tag") < 0 && source.indexOf("{{") < 0) return source;
    try {
      var doc = new DOMParser().parseFromString(
        '<div id="mc-var-strip-root">' + source + "</div>",
        "text/html"
      );
      var root = doc.getElementById("mc-var-strip-root");
      if (!root) return source;

      // 1) 删除该变量对应的 merge tag 锚点
      root.querySelectorAll("[data-merge-tag]").forEach(function (el) {
        if (mergeTagKeyOf(el) === key) el.remove();
      });

      // 2) 清理属性里的裸 token（例如 href="{{product.url}}"）
      root.querySelectorAll("*").forEach(function (el) {
        Array.prototype.slice.call(el.attributes || []).forEach(function (attr) {
          if (attr.value.indexOf("{{") < 0) return;
          var next = attr.value.replace(tokenRe, "");
          if (next === attr.value) return;
          if (next) el.setAttribute(attr.name, next);
          else el.removeAttribute(attr.name);
        });
      });

      // 3) 清理正文文本里的裸 token（手写/粘贴的情况）
      var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var textNodes = [];
      var node;
      while ((node = walker.nextNode())) textNodes.push(node);
      textNodes.forEach(function (textNode) {
        if (textNode.nodeValue.indexOf("{{") < 0) return;
        textNode.nodeValue = textNode.nodeValue.replace(tokenRe, "");
      });

      return root.innerHTML;
    } catch (err) {
      return source;
    }
  }

  /**
   * 从整个 design_json 中移除某个变量的全部锚点和裸 token。
   * 返回新的 content，不修改传入对象。
   */
  function stripVariableFromContent(content, key) {
    var tokenRe = new RegExp("\\{\\{\\s*" + escapeRegExp(key) + "\\s*\\}\\}", "g");
    function walk(value) {
      if (typeof value === "string") return stripVariableFromString(value, key, tokenRe);
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === "object") {
        var out = {};
        Object.keys(value).forEach(function (k) { out[k] = walk(value[k]); });
        return out;
      }
      return value;
    }
    return walk(content);
  }

  function parseHtmlFragment(html) {
    var doc = new DOMParser().parseFromString(
      '<div id="mc-var-fragment-root">' + (html || "<p></p>") + "</div>",
      "text/html"
    );
    return { doc: doc, root: doc.getElementById("mc-var-fragment-root") };
  }

  /** 返回 content HTML 中某个 key 的所有 chip 文本区间（用于同 block 拖动偏移修正）。 */
  function chipTextRangesInHtml(html, key) {
    var fragment = parseHtmlFragment(html);
    var root = fragment.root;
    var ranges = [];
    if (!root) return ranges;
    var total = 0;
    (function scan(node) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          total += child.nodeValue.length;
          continue;
        }
        if (child.nodeType !== 1) continue;
        if (child.hasAttribute("data-merge-tag") && mergeTagKeyOf(child) === key) {
          var len = (child.textContent || "").length;
          ranges.push({ start: total, end: total + len });
          total += len;
        } else {
          scan(child);
        }
      }
    })(root);
    return ranges;
  }

  function removeChipFromHtml(html, key, index) {
    var fragment = parseHtmlFragment(html);
    var root = fragment.root;
    if (!root) return html;
    var chips = Array.prototype.slice.call(root.querySelectorAll("[data-merge-tag]"))
      .filter(function (el) { return mergeTagKeyOf(el) === key; });
    var target = chips[index] || chips[0];
    if (target) target.remove();
    return root.innerHTML;
  }

  function htmlText(html) {
    var fragment = parseHtmlFragment(html);
    return fragment.root ? fragment.root.textContent || "" : "";
  }

  function liveChipIndex(chip, key) {
    var pm = chip.closest(".ProseMirror");
    if (!pm) return 0;
    var chips = Array.prototype.slice.call(pm.querySelectorAll(".tpl-merge-tag-node"))
      .filter(function (el) { return chipKey(el) === key; });
    var index = chips.indexOf(chip);
    return index >= 0 ? index : 0;
  }

  function chipNearPoint(x, y, pm) {
    if (!pm) return null;
    var chips = pm.querySelectorAll(".tpl-merge-tag-node");
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < chips.length; i++) {
      var rect = chips[i].getBoundingClientRect();
      var padX = 6;
      var padY = 4;
      if (x < rect.left - padX || x > rect.right + padX || y < rect.top - padY || y > rect.bottom + padY) continue;
      var dx = x < rect.left ? rect.left - x : (x > rect.right ? x - rect.right : 0);
      var dy = y < rect.top ? rect.top - y : (y > rect.bottom ? y - rect.bottom : 0);
      var distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = chips[i];
      }
    }
    return best;
  }

  function chipDropTarget(chip, x, y, ds, pm) {
    var rect = chip.getBoundingClientRect();
    var after;
    if (y < rect.top) after = false;
    else if (y > rect.bottom) after = true;
    else after = x >= rect.left + rect.width / 2;
    var chipRange = document.createRange();
    chipRange.selectNodeContents(pm);
    chipRange.setEndBefore(chip);
    return {
      blockId: ds.blockId,
      offset: chipRange.toString().length + (after ? (chip.textContent || "").length : 0)
    };
  }

  function isTextCaretRange(range, pm) {
    if (!range) return false;
    if (pm && pm.contains(range.startContainer)) return true;
    var el = range.startContainer.nodeType === 3
      ? range.startContainer.parentElement
      : range.startContainer;
    return !!(el && el.closest && el.closest(".tpl-text-content"));
  }

  function dropTargetFromPoint(x, y, ds, pm) {
    // 拖到 chip 附近（含 10px 容差）时优先吸附到 chip，避免拖动时
    // 画布轻微位移导致落点擦边失败。
    var nearChip = chipNearPoint(x, y, pm);
    if (nearChip) return chipDropTarget(nearChip, x, y, ds, pm);

    var hit = document.elementFromPoint(x, y);
    if (!hit || !hit.closest) return null;

    // 落在 chip 上：按鼠标在 chip 的左/右半边决定插到 chip 前/后。
    var chip = hit.closest(".tpl-merge-tag-node");
    if (pm && chip && pm.contains(chip)) {
      return chipDropTarget(chip, x, y, ds, pm);
    }

    // 只读画布上落在 token 上：按 token 在文本里的位置计算偏移。
    var token = hit.closest("[data-merge-tag]");
    if (token) {
      var textRoot = token.closest(".tpl-text-content");
      if (!textRoot) return null;
      var tokenRect = token.getBoundingClientRect();
      var afterToken = x >= tokenRect.left + tokenRect.width / 2;
      var tokenRange = document.createRange();
      tokenRange.selectNodeContents(textRoot);
      try {
        tokenRange.setEndBefore(token);
      } catch (err) {
        return null;
      }
      return {
        blockId: blockIdOf(token),
        offset: tokenRange.toString().length + (afterToken ? (token.textContent || "").length : 0),
        root: textRoot
      };
    }

    return null;
  }

  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      try { return document.caretRangeFromPoint(x, y); } catch (err) { /* fall through */ }
    }
    if (document.caretPositionFromPoint) {
      try {
        var position = document.caretPositionFromPoint(x, y);
        if (!position) return null;
        var range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function ensureDragGhost() {
    if (dragGhost) return;
    dragGhost = document.createElement("div");
    dragGhost.className = "mc-var-drag-ghost";
    dragGhost.textContent = dragState ? "{{" + dragState.key + "}}" : "";
    document.body.appendChild(dragGhost);
  }

  function positionDragGhost(x, y) {
    if (!dragGhost) return;
    dragGhost.style.left = x + "px";
    dragGhost.style.top = y + "px";
  }

  function clearDropTarget() {
    if (!dropTargetEl) return;
    dropTargetEl.classList.remove("mc-var-drop-target");
    dropTargetEl = null;
  }

  function updateDropTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    var block = el && el.closest ? el.closest("[data-block-id]") : null;
    if (block) {
      var inText = !!(el.closest(".ProseMirror") || el.closest(".tpl-text-content"));
      var type = text(block.getAttribute("data-block-type")).toLowerCase();
      if (!inText && TEXT_BLOCK_TYPES.indexOf(type) < 0) block = null;
    }
    if (block === dropTargetEl) return;
    clearDropTarget();
    dropTargetEl = block;
    if (dropTargetEl) dropTargetEl.classList.add("mc-var-drop-target");
  }

  function clearDragVisuals(ds) {
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
    document.body.classList.remove("mc-var-dragging");
    if (ds && ds.chip) ds.chip.classList.remove("mc-var-drag-source");
    clearDropTarget();
  }

  function cancelChipDrag() {
    if (!dragState) return;
    var ds = dragState;
    dragState = null;
    clearDragVisuals(ds);
    setStatus("已取消拖动变量 {{" + ds.key + "}}");
  }

  function beginChipDrag(event, chip) {
    var key = chipKey(chip);
    var blockId = blockIdOf(chip);
    if (!key || !blockId) return;
    dragState = {
      chip: chip,
      key: key,
      blockId: blockId,
      index: liveChipIndex(chip, key),
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
  }

  function onChipDragMove(event) {
    if (!dragState) return;
    var dx = event.clientX - dragState.startX;
    var dy = event.clientY - dragState.startY;
    if (!dragState.dragging) {
      if (Math.sqrt(dx * dx + dy * dy) < 6) return;
      dragState.dragging = true;
      dragState.chip.classList.add("mc-var-drag-source");
      ensureDragGhost();
      document.body.classList.add("mc-var-dragging");
      // 不在拖动开始时改 header 状态：长文本会让 header 换行，画布整体下移，
      // 导致拖拽落点坐标失效。
    }
    event.preventDefault();
    positionDragGhost(event.clientX, event.clientY);
    updateDropTarget(event.clientX, event.clientY);
  }

  function onChipDragEnd(event) {
    if (!dragState) return;
    var ds = dragState;
    dragState = null;
    var wasDragging = ds.dragging;
    clearDragVisuals(ds);
    lastChipMouseUpAt = Date.now();

    if (!wasDragging) {
      if (ds.chip && ds.chip.contains(event.target)) openEditFor(ds.key);
      return;
    }

    var result = moveChipToPoint(ds, event.clientX, event.clientY);
    if (result.ok) setStatus("已移动变量 {{" + ds.key + "}}");
    else setStatus("未移动变量：" + (result.error || "请拖到正文文本位置"));
  }

  /**
   * 把 chip 从源位置移动到鼠标释放位置。
   * - 同一 block：按文本偏移删除源 chip 后插入新 chip；
   * - 跨 block：从源 block 删除，插入目标 block 的文本偏移处。
   */
  function moveChipToPoint(ds, x, y) {
    var api = currentEditorApi();
    if (!api) return { ok: false, error: "没有找到编辑器实例" };
    var pm = document.querySelector(".ProseMirror");
    var targetBlockId = "";
    var targetOffset = 0;
    var targetRoot = null;

    // 拖到 chip/token 上时 caretRangeFromPoint 可能返回编辑器外层容器，
    // 这里先用鼠标下的元素做一次精确回退。
    var fallback = dropTargetFromPoint(x, y, ds, pm);
    if (fallback) {
      targetBlockId = fallback.blockId;
      targetOffset = fallback.offset;
      targetRoot = fallback.root || null;
    } else {
      var range = null;
      var nudges = [0, 6, 12, 18, -6, -12];
      for (var i = 0; i < nudges.length; i++) {
        var candidate = caretRangeFromPoint(x, y + nudges[i]);
        if (isTextCaretRange(candidate, pm)) {
          range = candidate;
          break;
        }
      }
      if (!range) return { ok: false, error: "请把变量拖到正文文本位置" };
      if (pm && pm.contains(range.startContainer)) {
        targetBlockId = ds.blockId;
        targetOffset = textOffset(pm, range.startContainer, range.startOffset);
      } else {
        var startEl = range.startContainer.nodeType === 3
          ? range.startContainer.parentElement
          : range.startContainer;
        targetRoot = startEl && startEl.closest ? startEl.closest(".tpl-text-content") : null;
        if (!targetRoot) return { ok: false, error: "请把变量拖到正文文本位置" };
        var targetBlockEl = targetRoot.closest("[data-block-id]");
        if (!targetBlockEl) return { ok: false, error: "请把变量拖到正文文本位置" };
        targetBlockId = targetBlockEl.getAttribute("data-block-id") || "";
        targetOffset = textOffset(targetRoot, range.startContainer, range.startOffset);
      }
    }

    if (!targetBlockId) return { ok: false, error: "请把变量拖到正文文本位置" };

    var content;
    try {
      content = api.getContent();
    } catch (err) {
      return { ok: false, error: "读取编辑器内容失败" };
    }
    var sourceBlock = getBlockById(content, ds.blockId);
    if (!sourceBlock || typeof sourceBlock.content !== "string") {
      return { ok: false, error: "没有找到源文本区块" };
    }

    if (targetBlockId === ds.blockId) {
      var ranges = chipTextRangesInHtml(sourceBlock.content, ds.key);
      var sourceRange = ranges[ds.index] || ranges[0];
      if (!sourceRange) return { ok: false, error: "没有找到被拖动的变量" };
      var newOffset = targetOffset;
      var sourceLength = sourceRange.end - sourceRange.start;
      if (targetOffset >= sourceRange.end) newOffset -= sourceLength;
      else if (targetOffset > sourceRange.start) newOffset = sourceRange.start;
      if (newOffset === sourceRange.start) return { ok: false, error: "变量位置没有变化" };

      var stripped = removeChipFromHtml(sourceBlock.content, ds.key, ds.index);
      sourceBlock.content = insertTokenIntoHtml(stripped, newOffset, newOffset, tokenHtml(ds.key));
    } else {
      var targetBlock = getBlockById(content, targetBlockId);
      if (!targetBlock || typeof targetBlock.content !== "string") {
        return { ok: false, error: "目标区块不是文本区块" };
      }
      if (targetRoot) {
        var contentText = htmlText(targetBlock.content);
        var viewText = targetRoot.textContent || "";
        if (contentText !== viewText) {
          return { ok: false, error: "该位置暂不支持放置变量，请拖到文本内容中" };
        }
        targetOffset = Math.max(0, Math.min(targetOffset, contentText.length));
      }
      sourceBlock.content = removeChipFromHtml(sourceBlock.content, ds.key, ds.index);
      targetBlock.content = insertTokenIntoHtml(targetBlock.content, targetOffset, targetOffset, tokenHtml(ds.key));
    }

    try {
      // 拖拽落点可能位于链接内；变量不允许带链接，写入前统一拆掉。
      api.setContent(sanitizeContent(content));
    } catch (err) {
      return { ok: false, error: "写入编辑器失败" };
    }
    state.caret = null;
    state.selectedText = "";
    refreshUsage();
    updateCursorHint();
    setTimeout(function () { revealMergeTag(ds.key, targetBlockId); }, 80);
    return { ok: true };
  }

  function preventChipNativeDrag(event) {
    var target = event.target;
    if (target && target.closest && target.closest(".tpl-merge-tag-node")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function insertAtCaret(key) {
    var caret = state.caret;
    var api = currentEditorApi();
    if (!caret || !caret.blockId) {
      return { ok: false, error: "请先在正文文本中双击，出现光标后再插入。" };
    }
    if (!api) {
      return { ok: false, error: "没有找到编辑器实例，请刷新页面重试。" };
    }
    var content;
    try {
      content = api.getContent();
    } catch (err) {
      return { ok: false, error: "读取编辑器内容失败：" + (err.message || err) };
    }
    var block = getBlockById(content, caret.blockId);
    if (!block) {
      return { ok: false, error: "光标所在区块已变化，请重新点击正文后再插入。" };
    }
    block.content = insertTokenIntoHtml(block.content, caret.start, caret.end, tokenHtml(key));
    // 插入点可能落在已有超链接里；变量不允许带链接，写入前统一拆掉。
    api.setContent(sanitizeContent(content));

    var blockId = caret.blockId;
    state.caret = null;
    state.selectedText = "";
    setTimeout(function () { revealMergeTag(key, blockId); }, 80);
    return { ok: true };
  }

  /**
   * setContent 会把正在编辑的区块切回只读视图；按 token 找回目标区块并重新
   * 进入编辑态，让插入后的 chip 立即可见。
   */
  function revealMergeTag(key, blockId) {
    var token = "{{" + key + "}}";
    var scope = document.querySelector("[data-testid=canvas-wrapper]") || document;
    var nodes = scope.querySelectorAll("[data-merge-tag]");
    var fallback = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var raw = (el.getAttribute("data-merge-tag") || "").replace(/\s+/g, "");
      if (raw !== token) continue;
      var block = el.closest("[data-block-id]");
      if (!blockId || (block && block.getAttribute("data-block-id") === blockId)) {
        dispatchBlockEdit(el);
        highlightAnchors(key);
        return true;
      }
      fallback = fallback || el;
    }
    if (fallback) {
      dispatchBlockEdit(fallback);
      highlightAnchors(key);
      return true;
    }
    return false;
  }

  function dispatchBlockEdit(el) {
    el.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 2
    }));
  }

  // ------------------------------------------------------------- usage/scan

  function addKey(counts, raw) {
    var key = text(raw).replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
    if (!KEY_RE.test(key) || BLOCKED_KEYS.indexOf(key) >= 0) return;
    counts[key] = (counts[key] || 0) + 1;
  }

  function scanString(value, counts) {
    var source = text(value);
    if (!source) return;
    if (source.indexOf("data-merge-tag") >= 0) {
      try {
        var doc = new DOMParser().parseFromString("<div>" + source + "</div>", "text/html");
        doc.querySelectorAll("[data-merge-tag]").forEach(function (el) {
          addKey(counts, el.getAttribute("data-merge-tag"));
          el.remove();
        });
        source = doc.body.textContent || "";
      } catch (err) { /* fall through */ }
    }
    var tokenRe = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;
    var match;
    while ((match = tokenRe.exec(source))) addKey(counts, match[1]);
  }

  function scanKeys(content) {
    var counts = {};
    (function walk(value) {
      if (typeof value === "string") {
        scanString(value, counts);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        Object.keys(value).forEach(function (key) { walk(value[key]); });
      }
    })(content || {});
    return counts;
  }

  function refreshUsage() {
    var api = currentEditorApi();
    if (!api) return;
    try {
      state.usage = scanKeys(api.getContent());
    } catch (err) {
      return;
    }
    renderReuseList();
    updateEditUsage();
    highlightAnchors(state.editingKey || "");
  }

  function validateContent(content) {
    var usage = scanKeys(content || {});
    var defined = {};
    state.list.forEach(function (item) { defined[item.key] = true; });
    var missing = Object.keys(usage).filter(function (key) { return !defined[key]; });
    return { ok: missing.length === 0, missing: missing, usage: usage };
  }

  // ----------------------------------------------------------- token_html

  var notifyTimer = null;

  function notify(message) {
    setStatus(message);
    var node = document.getElementById("mc-var-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "mc-var-toast";
      node.className = "mc-var-toast";
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("is-open");
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(function () {
      node.classList.remove("is-open");
    }, 3200);
  }

  function selectionContainsChip() {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return false;
    var range = selection.getRangeAt(0);
    var pm = document.querySelector(".ProseMirror");
    if (!pm) return false;
    if (!pm.contains(range.startContainer) && !pm.contains(range.commonAncestorContainer)) return false;
    var chips = pm.querySelectorAll(".tpl-merge-tag-node");
    for (var i = 0; i < chips.length; i++) {
      try {
        if (range.intersectsNode(chips[i])) return true;
      } catch (err) { /* ignore */ }
      if (chips[i].contains(range.startContainer) || chips[i].contains(range.endContainer)) return true;
    }
    return false;
  }

  /**
   * 变量组件不允许挂超链接：把包含 {{token}} 的 <a> 拆掉，保留内部文本/锚点。
   * root 可以是 Document 或 Element。
   */
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

  /** 清理 design_json 中变量组件上的超链接，返回新的 content。 */
  function sanitizeContent(content) {
    function walk(value) {
      if (typeof value === "string") {
        if (value.indexOf("<a") < 0) return value;
        if (value.indexOf("data-merge-tag") < 0 && value.indexOf("{{") < 0) return value;
        try {
          var doc = new DOMParser().parseFromString(
            '<div id="mc-var-sanitize-root">' + value + "</div>",
            "text/html"
          );
          var root = doc.getElementById("mc-var-sanitize-root");
          if (!root) return value;
          unlinkTokenAnchors(root);
          return root.innerHTML;
        } catch (err) {
          return value;
        }
      }
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === "object") {
        var out = {};
        Object.keys(value).forEach(function (key) { out[key] = walk(value[key]); });
        return out;
      }
      return value;
    }
    return walk(content);
  }

  function normalizeTokenHtml(html) {
    if (!html) return "";
    try {
      var doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("[data-merge-tag]").forEach(function (el) {
        var token = el.getAttribute("data-merge-tag") || el.textContent || "";
        el.replaceWith(doc.createTextNode(token));
      });
      unlinkTokenAnchors(doc);
      var doctype = /^<!doctype/i.test(html) ? "<!doctype html>\n" : "";
      return doctype + doc.documentElement.outerHTML;
    } catch (err) {
      return html;
    }
  }

  function captureTokenHtml() {
    return new Promise(function (resolve) {
      var button = document.getElementById("download");
      if (!button || typeof URL.createObjectURL !== "function") {
        resolve("");
        return;
      }
      var originalCreate = URL.createObjectURL;
      var originalClick = HTMLAnchorElement.prototype.click;
      var capturedBlob = null;
      var finished = false;

      function restore() {
        URL.createObjectURL = originalCreate;
        HTMLAnchorElement.prototype.click = originalClick;
      }
      function finish(value) {
        if (finished) return;
        finished = true;
        restore();
        resolve(value || "");
      }

      URL.createObjectURL = function (blob) {
        capturedBlob = blob;
        return originalCreate.call(URL, blob);
      };
      HTMLAnchorElement.prototype.click = function () { /* suppress download */ };

      var started = Date.now();
      var timer = setInterval(function () {
        if (capturedBlob) {
          clearInterval(timer);
          Promise.resolve()
            .then(function () { return capturedBlob.text(); })
            .then(function (value) { finish(normalizeTokenHtml(value)); })
            .catch(function () { finish(""); });
        } else if (Date.now() - started > 15000) {
          clearInterval(timer);
          finish("");
        }
      }, 50);

      try {
        button.click();
      } catch (err) {
        clearInterval(timer);
        finish("");
      }
    });
  }

  // --------------------------------------------------------------- dock UI

  function buildDock() {
    if (refs.dock) return;
    var dock = document.createElement("aside");
    dock.className = "mc-var-dock";
    dock.setAttribute("role", "complementary");
    dock.setAttribute("aria-label", "Handlebars 变量");
    dock.innerHTML =
      '<div class="mc-var-dock-head">' +
        '<div class="mc-var-dock-head-text">' +
          '<div class="mc-var-dock-title">Handlebars 变量</div>' +
          '<div class="mc-var-dock-mode" id="mc-var-mode-label">插入锚点</div>' +
        '</div>' +
        '<button type="button" class="mc-var-dock-close" aria-label="收起">×</button>' +
      '</div>' +
      '<div class="mc-var-dock-body">' +
        '<div class="mc-var-cursor-hint" id="mc-var-cursor-hint"></div>' +
        '<section class="mc-var-sec" id="mc-var-form-sec">' +
          '<div class="mc-var-sec-head">' +
            '<h4 id="mc-var-form-title"><span class="mc-var-sec-num">1</span> 插入新锚点</h4>' +
            '<button type="button" class="mc-var-back-insert" hidden>返回插入</button>' +
          '</div>' +
          '<div class="mc-var-form">' +
            '<div class="mc-var-row">' +
              '<div class="mc-var-field">' +
                '<label for="mc-var-key">变量 key</label>' +
                '<input id="mc-var-key" type="text" placeholder="例如 product.name" autocomplete="off">' +
              '</div>' +
              '<div class="mc-var-field">' +
                '<label for="mc-var-type">类型</label>' +
                '<select id="mc-var-type">' +
                  '<option value="text">text</option>' +
                  '<option value="number">number</option>' +
                  '<option value="currency">currency</option>' +
                  '<option value="url">url</option>' +
                  '<option value="html">html</option>' +
                  '<option value="date">date</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
            '<div class="mc-var-row">' +
              '<div class="mc-var-field">' +
                '<label for="mc-var-sample">示例值</label>' +
                '<input id="mc-var-sample" type="text" placeholder="用于预览，例如 XPENG G9L">' +
              '</div>' +
              '<div class="mc-var-field">' +
                '<label for="mc-var-default">默认值</label>' +
                '<input id="mc-var-default" type="text" placeholder="可选">' +
              '</div>' +
            '</div>' +
            '<div class="mc-var-row">' +
              '<div class="mc-var-field">' +
                '<label for="mc-var-description">描述</label>' +
                '<input id="mc-var-description" type="text" placeholder="可选，给运营看的说明">' +
              '</div>' +
            '</div>' +
            '<div class="mc-var-row mc-var-required-row">' +
              '<label class="mc-var-required"><input id="mc-var-required" type="checkbox" checked> 必填</label>' +
            '</div>' +
            '<div class="mc-var-error" id="mc-var-error"></div>' +
            '<div class="mc-var-form-actions mc-var-insert-actions">' +
              '<button type="button" class="mc-var-save-only">仅保存定义</button>' +
              '<button type="button" class="mc-var-insert">插入锚点</button>' +
            '</div>' +
            '<div class="mc-var-form-actions mc-var-edit-actions" hidden>' +
              '<button type="button" class="mc-var-delete-current">删除变量</button>' +
              '<button type="button" class="mc-var-save-edit">保存修改</button>' +
            '</div>' +
          '</div>' +
          '<div class="mc-var-edit-usage" id="mc-var-edit-usage" hidden></div>' +
        '</section>' +
        '<section class="mc-var-sec" id="mc-var-reuse-sec">' +
          '<div class="mc-var-sec-head">' +
            '<h4><span class="mc-var-sec-num">2</span> 复用已有变量</h4>' +
            '<button type="button" class="mc-var-sync">从正文同步</button>' +
          '</div>' +
          '<input id="mc-var-search" class="mc-var-search" type="text" placeholder="搜索 key / 示例值 / 描述" autocomplete="off">' +
          '<div class="mc-var-reuse-list" id="mc-var-list"></div>' +
        '</section>' +
      '</div>' +
      '<div class="mc-var-dock-foot">发送前由服务端 Handlebars 渲染；schema 会随「存纯草稿」一起保存。正文中的变量 chip 可直接拖拽到其他文本位置。</div>';

    refs.dock = dock;
    refs.modeLabel = dock.querySelector("#mc-var-mode-label");
    refs.hint = dock.querySelector("#mc-var-cursor-hint");
    refs.formTitle = dock.querySelector("#mc-var-form-title");
    refs.backInsert = dock.querySelector(".mc-var-back-insert");
    refs.key = dock.querySelector("#mc-var-key");
    refs.type = dock.querySelector("#mc-var-type");
    refs.sample = dock.querySelector("#mc-var-sample");
    refs.default = dock.querySelector("#mc-var-default");
    refs.description = dock.querySelector("#mc-var-description");
    refs.required = dock.querySelector("#mc-var-required");
    refs.error = dock.querySelector("#mc-var-error");
    refs.list = dock.querySelector("#mc-var-list");
    refs.search = dock.querySelector("#mc-var-search");
    refs.reuse = dock.querySelector("#mc-var-reuse-sec");
    refs.insertActions = dock.querySelector(".mc-var-insert-actions");
    refs.editActions = dock.querySelector(".mc-var-edit-actions");
    refs.insertBtn = dock.querySelector(".mc-var-insert");
    refs.editUsage = dock.querySelector("#mc-var-edit-usage");

    dock.querySelector(".mc-var-dock-close").addEventListener("click", hideDock);
    dock.querySelector(".mc-var-insert").addEventListener("click", insertNew);
    dock.querySelector(".mc-var-save-only").addEventListener("click", saveOnly);
    dock.querySelector(".mc-var-save-edit").addEventListener("click", saveEdit);
    dock.querySelector(".mc-var-delete-current").addEventListener("click", deleteCurrent);
    dock.querySelector(".mc-var-sync").addEventListener("click", syncCurrentContent);
    refs.backInsert.addEventListener("click", function () {
      setMode("insert");
      if (state.caret && state.caret.blockId) showDock();
      else hideDock();
    });
    refs.search.addEventListener("input", function () {
      state.search = refs.search.value;
      renderReuseList();
    });
    refs.key.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && state.mode === "insert") {
        event.preventDefault();
        insertNew();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && refs.dock && refs.dock.classList.contains("is-open")) hideDock();
    });

    // 右侧栏在切换 tab / 切换区块时会重渲染；面板需要跟着重新挂到原生的
    // 滚动容器底部，并保持原有的变量编辑状态。
    new MutationObserver(function () {
      if (!refs.dock) return;
      var host = rightSidebarHost();
      if (!host) return;
      var changed = refs.dock.parentElement !== host;
      if (changed) host.appendChild(refs.dock);
      if (changed && refs.dock.classList.contains("is-open")) {
        setTimeout(scrollDockIntoView, 30);
      }
    }).observe(document.body, { childList: true, subtree: true });

    ensureDockPlacement();
    renderReuseList();
  }

  function rightSidebarHost() {
    var sidebar = document.querySelector(".tpl-right-sidebar");
    if (!sidebar) return null;
    var children = Array.prototype.slice.call(sidebar.children);
    for (var i = 0; i < children.length; i++) {
      var overflow = getComputedStyle(children[i]).overflowY;
      if (overflow === "auto" || overflow === "scroll") return children[i];
    }
    return children[children.length - 1] || sidebar;
  }

  function ensureDockPlacement() {
    if (!refs.dock) return false;
    var host = rightSidebarHost();
    if (!host) return false;
    if (refs.dock.parentElement !== host) host.appendChild(refs.dock);
    // 面板已嵌入右侧栏，不再使用 fixed 定位和左覆盖尺寸。
    refs.dock.style.top = "";
    refs.dock.style.left = "";
    refs.dock.style.right = "";
    refs.dock.style.bottom = "";
    refs.dock.style.width = "";
    refs.dock.classList.add("is-compact");
    return true;
  }

  function scrollDockIntoView() {
    if (!refs.dock || !refs.dock.classList.contains("is-open")) return;
    var host = refs.dock.parentElement;
    if (!host) return;
    if (host.scrollHeight <= host.clientHeight + 2) return;
    var hostRect = host.getBoundingClientRect();
    var dockRect = refs.dock.getBoundingClientRect();
    var target = host.scrollTop + (dockRect.top - hostRect.top) - 4;
    try {
      host.scrollTo({ top: target, behavior: "smooth" });
    } catch (err) {
      host.scrollTop = target;
    }
  }

  function showDock() {
    if (!refs.dock) buildDock();
    // 插入态必须有光标；编辑态由变量选中/插入动作触发。没有上下文就不显示。
    if (state.mode === "insert" && !(state.caret && state.caret.blockId)) return false;
    if (!ensureDockPlacement()) {
      setStatus("右侧设置栏尚未就绪，请稍后重试");
      return false;
    }
    var wasOpen = refs.dock.classList.contains("is-open");
    refs.dock.classList.add("is-open");
    if (!wasOpen) {
      refreshUsage();
      setTimeout(scrollDockIntoView, 30);
    }
    updateCursorHint();
    return true;
  }

  function hideDock() {
    if (refs.dock) refs.dock.classList.remove("is-open");
    // 侧栏隐藏后不再保留旧光标，避免下次通过入口误插到旧位置。
    state.caret = null;
    state.selectedText = "";
    highlightAnchors("");
  }

  function setMode(mode, key) {
    if (!refs.dock) buildDock();
    state.mode = mode;
    setError("");
    if (mode === "edit") {
      var item = findItem(key);
      if (!item) {
        item = { key: key, type: "text", required: true, "default": "", sample: "", description: "" };
        state.list.push(item);
      }
      state.editingKey = key;
      state.caret = null;
      state.selectedText = "";
      state.lockEditUntil = Date.now() + 600;
      setChipSelected(true);
      fillForm(item);
      refs.key.readOnly = true;
      refs.formTitle.innerHTML = '<span class="mc-var-sec-num">✎</span> 编辑变量 <code>' + escapeHtml(key) + '</code>';
      refs.modeLabel.textContent = "编辑变量";
      refs.reuse.hidden = true;
      refs.insertActions.hidden = true;
      refs.editActions.hidden = false;
      refs.backInsert.hidden = false;
      refs.hint.hidden = true;
      refs.editUsage.hidden = false;
      updateEditUsage();
      highlightAnchors(key);
    } else {
      state.editingKey = null;
      state.lockEditUntil = 0;
      resetForm();
      refs.key.readOnly = false;
      refs.formTitle.innerHTML = '<span class="mc-var-sec-num">1</span> 插入新锚点';
      refs.modeLabel.textContent = "插入锚点";
      refs.reuse.hidden = false;
      refs.insertActions.hidden = false;
      refs.editActions.hidden = true;
      refs.backInsert.hidden = true;
      refs.hint.hidden = false;
      refs.editUsage.hidden = true;
      highlightAnchors("");
      updateCursorHint();
      renderReuseList();
    }
  }

  function fillForm(item) {
    refs.key.value = item.key;
    refs.type.value = item.type;
    refs.sample.value = item.sample;
    refs.default.value = item["default"];
    refs.description.value = item.description;
    refs.required.checked = item.required;
  }

  function resetForm() {
    refs.key.value = "";
    refs.type.value = "text";
    refs.sample.value = "";
    refs.default.value = "";
    refs.description.value = "";
    refs.required.checked = true;
    setError("");
  }

  function readForm() {
    var key = text(refs.key.value).trim();
    if (!key) {
      setError("请填写变量 key");
      return null;
    }
    if (!KEY_RE.test(key)) {
      setError("key 只能包含字母、数字、下划线和点，且不能以数字开头");
      return null;
    }
    if (BLOCKED_KEYS.indexOf(key) >= 0 || key.indexOf("..") >= 0) {
      setError("不允许使用该 key");
      return null;
    }
    return {
      key: key,
      type: refs.type.value,
      required: refs.required.checked,
      "default": text(refs.default.value).trim(),
      sample: text(refs.sample.value).trim(),
      description: text(refs.description.value).trim()
    };
  }

  function updateCursorHint() {
    if (!refs.hint) return false;
    var hasCaret = !!(state.caret && state.caret.blockId);
    if (state.mode === "edit") {
      refs.hint.hidden = true;
      refs.hint.textContent = "";
      return hasCaret;
    }
    if (hasCaret) {
      refs.hint.hidden = false;
      refs.hint.classList.remove("is-warn");
      refs.hint.textContent = state.selectedText
        ? "已选中文本，插入会替换选区：" + state.selectedText.slice(0, 42)
        : "已捕获光标，插入会落在当前文本位置。";
    } else {
      refs.hint.hidden = true;
      refs.hint.textContent = "";
    }
    if (refs.insertBtn) refs.insertBtn.disabled = !hasCaret;
    return hasCaret;
  }

  function updateEditUsage() {
    if (!refs.editUsage) return;
    var key = state.editingKey;
    if (!key) return;
    var count = state.usage[key] || 0;
    refs.editUsage.textContent = count
      ? "正文中有 " + count + " 个锚点使用该变量。修改只会更新变量定义，不改动已有锚点。"
      : "正文中还没有该变量的锚点。";
  }

  function setChipSelected(selected) {
    state.chipSelected = !!selected;
    document.body.classList.toggle("mc-var-chip-selected", !!selected);
  }

  function highlightAnchors(key) {
    var scope = document.querySelector("[data-testid=canvas-wrapper]") || document;
    scope.querySelectorAll(".tpl-merge-tag-node").forEach(function (chip) {
      var match = !!key && chipKey(chip) === key;
      chip.classList.toggle("mc-var-anchor-active", match);
    });
  }

  function renderReuseList() {
    if (!refs.list) return;
    var keyword = text(state.search).trim().toLowerCase();
    var items = state.list.filter(function (item) {
      if (!keyword) return true;
      return [item.key, item.sample, item.description, item.type].join(" ").toLowerCase().indexOf(keyword) >= 0;
    });

    if (!state.list.length) {
      refs.list.innerHTML = '<div class="mc-var-empty">还没有变量。在上方新建锚点，或从正文同步。</div>';
      return;
    }
    if (!items.length) {
      refs.list.innerHTML = '<div class="mc-var-empty">没有匹配 “' + escapeHtml(state.search) + '” 的变量。</div>';
      return;
    }

    refs.list.innerHTML = items.map(function (item) {
      return '<div class="mc-var-reuse-item" data-key="' + escapeHtml(item.key) + '">' +
        '<div class="mc-var-reuse-main">' +
          '<code>{{' + escapeHtml(item.key) + '}}</code>' +
          '<span class="mc-var-chip">' + escapeHtml(item.type) + '</span>' +
          (state.usage[item.key] ? '<span class="mc-var-usage">×' + state.usage[item.key] + '</span>' : "") +
          (item.required ? '<span class="mc-var-chip is-required">required</span>' : "") +
          (item.sample ? '<span class="mc-var-meta">sample: ' + escapeHtml(item.sample) + '</span>' : "") +
        '</div>' +
        '<div class="mc-var-reuse-actions">' +
          '<button type="button" class="mc-var-reuse-insert">插入</button>' +
          '<button type="button" class="mc-var-reuse-edit">编辑</button>' +
        '</div>' +
      '</div>';
    }).join("");

    refs.list.querySelectorAll(".mc-var-reuse-item").forEach(function (row) {
      var key = row.getAttribute("data-key");
      row.addEventListener("click", function () { reuseVariable(key); });
      row.querySelector(".mc-var-reuse-insert").addEventListener("click", function (event) {
        event.stopPropagation();
        reuseVariable(key);
      });
      row.querySelector(".mc-var-reuse-edit").addEventListener("click", function (event) {
        event.stopPropagation();
        setMode("edit", key);
        showDock();
      });
    });
  }

  // -------------------------------------------------------------- actions

  function insertNew() {
    var item = readForm();
    if (!item) return;
    var result = insertAtCaret(item.key);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    upsert(item);
    setStatus("已插入变量 {{" + item.key + "}}");
    refreshUsage();
    setMode("edit", item.key);
    showDock();
  }

  function reuseVariable(key) {
    var item = findItem(key);
    if (!item) return;
    var result = insertAtCaret(key);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus("已复用变量 {{" + key + "}}");
    refreshUsage();
    setMode("edit", key);
    showDock();
  }

  function saveOnly() {
    var item = readForm();
    if (!item) return;
    upsert(item);
    setStatus("已保存变量定义 {{" + item.key + "}}");
    resetForm();
    refreshUsage();
    if (!(state.caret && state.caret.blockId)) hideDock();
  }

  function saveEdit() {
    if (!state.editingKey) return;
    var item = readForm();
    if (!item) return;
    item.key = state.editingKey;
    upsert(item);
    setStatus("已保存变量 {{" + item.key + "}}");
    refreshUsage();
    setMode("edit", item.key);
  }

  function deleteCurrent() {
    var key = state.editingKey;
    if (!key) return;
    var api = currentEditorApi();
    var content = null;
    if (api) {
      try { content = api.getContent(); } catch (err) { content = null; }
    }
    var usage = content ? scanKeys(content) : (state.usage || {});
    var count = usage[key] || 0;

    var message = count
      ? "变量 {{" + key + "}} 在正文中有 " + count + " 处引用。\n\n删除会同时移除这些锚点，并删除变量定义。确认删除？"
      : "变量 {{" + key + "}} 在正文中没有引用。\n\n确认删除变量定义？";
    if (!window.confirm(message)) return;

    if (count > 0 && !content) {
      setError("没有找到编辑器实例，无法移除正文锚点，请刷新页面后重试。");
      return;
    }

    if (count > 0 && content && api) {
      var next = stripVariableFromContent(content, key);
      try {
        api.setContent(next);
      } catch (err) {
        setError("移除正文锚点失败：" + (err.message || err));
        return;
      }
      state.usage = scanKeys(next);
    }

    state.list = state.list.filter(function (item) { return item.key !== key; });
    state.editingKey = null;
    setStatus(count
      ? "已删除变量 {{" + key + "}}，并移除 " + count + " 处锚点"
      : "已删除变量定义 {{" + key + "}}");
    setMode("insert");
    refreshUsage();
    hideDock();
    setChipSelected(false);
  }

  async function syncCurrentContent() {
    try {
      var bridge = window.MC_TEMPLATICAL_EDITOR;
      var api = bridge ? await bridge.wait(5000) : null;
      if (!api) throw new Error("没有找到编辑器实例");
      var added = syncFromContent(api.getContent());
      refreshUsage();
      setStatus(added ? "从正文同步了 " + added + " 个变量" : "正文没有新的变量");
    } catch (err) {
      setError("同步失败：" + (err.message || err));
    }
  }

  function openEditFor(key) {
    if (!key || !KEY_RE.test(key) || BLOCKED_KEYS.indexOf(key) >= 0) return;
    setChipSelected(true);
    setMode("edit", key);
    showDock();
  }

  // -------------------------------------------------------------- listeners

  function onSelectionChange() {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    var range = selection.getRangeAt(0);
    if (!isInEditor(range.startContainer)) return;
    var editor = document.querySelector(".ProseMirror");
    if (!editor) return;
    // 只有真正处于聚焦状态的块编辑器才更新光标；面板输入框获得焦点、
    // 或编辑器 DOM 被侧栏重绘触发 selectionchange 时不应覆盖已记录的光标。
    var focused = editor.classList.contains("ProseMirror-focused") ||
      (document.activeElement && editor.contains(document.activeElement));
    if (!focused) return;

    var chip = closestChip(range.startContainer);
    if (chip) {
      setChipSelected(true);
      var key = chipKey(chip);
      if (key) openEditFor(key);
      return;
    }

    var caret = captureCaret();
    if (!caret) {
      setChipSelected(selectionContainsChip());
      return;
    }
    state.caret = caret;
    state.selectedText = selection.toString();
    var hasChip = selectionContainsChip();
    if (state.mode === "edit") {
      // 刚插入/选中 chip 后，revealMergeTag 会重新打开块编辑并触发一次
      // selectionchange；这段时间内保持变量编辑面板，避免立刻跳回插入态。
      if (Date.now() < state.lockEditUntil) {
        setChipSelected(true);
        return;
      }
      setMode("insert");
    }
    setChipSelected(hasChip);
    updateCursorHint();
    showDock();
  }

  function onFocusIn(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest(".ProseMirror")) {
      // 块编辑器刚获得焦点时，selectionchange 可能稍晚才到；稍等再决定是否显示。
      setTimeout(function () {
        if (state.caret && state.caret.blockId) showDock();
      }, 40);
    }
  }

  var focusOutTimer = null;

  // 点击侧栏/编辑器/变量之外时隐藏；面板自身交互和编辑器内点击不隐藏。
  function onDocumentPointerDown(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var isVariable = !!(
      target.closest(".tpl-merge-tag-node") ||
      target.closest("[data-merge-tag]")
    );
    // 变量点击引发的 focusout 不应把刚打开的编辑面板关掉。
    state.variablePointerAt = isVariable ? Date.now() : 0;

    if (!refs.dock || !refs.dock.classList.contains("is-open")) return;
    if (refs.dock.contains(target)) return;
    var sidebar = document.querySelector(".tpl-right-sidebar");
    if (sidebar && sidebar.contains(target)) return;
    if (target.closest(".ProseMirror")) return;
    if (isVariable) return;
    var active = document.activeElement;
    var pmFocused = document.querySelector(".ProseMirror-focused") ||
      (active && active.closest && active.closest(".ProseMirror"));
    if (pmFocused) return; // 等 focusout 判断焦点最终落到哪里
    hideDock();
  }

  // 焦点离开编辑器且没有落到面板上时隐藏；鼠标仍停在面板上则保留。
  function onDocumentFocusOut() {
    if (!refs.dock || !refs.dock.classList.contains("is-open")) return;
    if (focusOutTimer) clearTimeout(focusOutTimer);
    focusOutTimer = setTimeout(function () {
      focusOutTimer = null;
      if (!refs.dock || !refs.dock.classList.contains("is-open")) return;
      var active = document.activeElement;
      if (active && (refs.dock.contains(active) || (active.closest && active.closest(".ProseMirror")))) return;
      if (document.querySelector(".ProseMirror-focused")) return;
      if (refs.dock.matches && refs.dock.matches(":hover")) return;
      var sidebar = document.querySelector(".tpl-right-sidebar");
      if (sidebar && sidebar.matches && sidebar.matches(":hover")) return;
      // 刚点击变量 token/chip 时产生的 focusout 不关闭编辑面板。
      if (Date.now() - state.variablePointerAt < 600) return;
      hideDock();
    }, 160);
  }

  function onChipPointer(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var chip = target.closest(".tpl-merge-tag-node");
    if (chip && chip.closest(".ProseMirror")) {
      if (target.closest(".tpl-merge-tag-delete")) {
        if (event.type === "click") setTimeout(refreshUsage, 80);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setChipSelected(true);
      if (event.type === "mousedown") {
        beginChipDrag(event, chip);
      } else if (event.type === "click") {
        // 鼠标点击时由 mouseup 处理；这里只兜底键盘触发。
        if (Date.now() - lastChipMouseUpAt > 120) {
          var chipKeyValue = chipKey(chip);
          if (chipKeyValue) openEditFor(chipKeyValue);
        }
      }
      return;
    }
    // 只读画布里的 token 也带 data-merge-tag；点击时直接打开变量编辑面板。
    if (event.type !== "click") return;
    var token = target.closest("[data-merge-tag]");
    if (token && token.closest("[data-testid=canvas-wrapper]")) {
      var key = chipKey(token);
      if (key) openEditFor(key);
    }
  }

  function bindRailEntry(button) {
    if (!button || button.dataset.mcVariableBound === "1") return;
    button.dataset.mcVariableBound = "1";
    button.addEventListener("click", function () {
      if (!state.caret || !state.caret.blockId) {
        setStatus("请先在正文文本中双击，出现光标后再使用变量");
        return;
      }
      if (state.mode === "edit") setMode("insert");
      showDock();
    });
  }

  function createFallbackEntry() {
    var controls = document.querySelector("header .controls");
    if (!controls || document.getElementById("mc-variables-open")) return;
    var button = document.createElement("button");
    button.id = "mc-variables-open";
    button.type = "button";
    button.className = "mc-var-header-btn";
    button.textContent = "变量";
    button.title = "打开 Handlebars 变量侧栏";
    controls.appendChild(button);
    bindRailEntry(button);
  }

  function installSidebarEntry() {
    var rail = document.querySelector(".tpl-sidebar-rail");
    if (!rail) {
      createFallbackEntry();
      return;
    }
    var list = rail.querySelector(":scope > div");
    if (!list) return;
    var fallback = document.getElementById("mc-variables-open");
    if (fallback) fallback.remove();
    var existing = rail.querySelector(".mc-var-rail-entry");
    if (existing) {
      bindRailEntry(existing);
      updateRailWidth(rail);
      return;
    }

    var divider = document.createElement("div");
    divider.className = "mc-var-rail-divider";
    divider.setAttribute("aria-hidden", "true");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "tpl:flex tpl:h-10 tpl:w-full tpl:shrink-0 tpl:items-center tpl:gap-3 tpl:rounded-[var(--tpl-radius-sm)] tpl:border-none tpl:bg-transparent tpl:px-3 tpl:text-[var(--tpl-text-muted)] tpl:transition-all tpl:duration-[120ms] tpl:ease-[cubic-bezier(0.16,1,0.3,1)] tpl:hover:bg-[var(--tpl-primary-light)] tpl:hover:text-[var(--tpl-primary)] mc-var-rail-entry";
    button.setAttribute("aria-label", "Handlebars 变量");
    button.setAttribute("title", "Handlebars 变量");
    button.innerHTML =
      '<div class="tpl:flex tpl:shrink-0 tpl:items-center tpl:justify-center tpl:transition-transform tpl:duration-[120ms] tpl:ease-[cubic-bezier(0.16,1,0.3,1)] tpl:hover:scale-105">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"></path>' +
          '<path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path>' +
        '</svg>' +
      '</div>' +
      '<span class="mc-var-rail-label">变量</span>';
    list.appendChild(divider);
    list.appendChild(button);
    bindRailEntry(button);
    updateRailWidth(rail);
  }

  function updateRailWidth(rail) {
    if (!rail) return;
    rail.classList.toggle("mc-var-rail-wide", rail.getBoundingClientRect().width > 70);
  }

  function watchRail() {
    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        installSidebarEntry();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    var rail = document.querySelector(".tpl-sidebar-rail");
    if (rail && typeof ResizeObserver !== "undefined") {
      new ResizeObserver(function () { updateRailWidth(rail); }).observe(rail);
    }
    installSidebarEntry();
  }

  function blockLinkOnChip(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (!target.closest('[aria-label="Add Link"], [aria-label="Insert Link"]')) return;
    // DOM selection 可能拿不到 chip 的 NodeSelection；变量编辑面板打开时也视为选中变量。
    if (!selectionContainsChip() && state.mode !== "edit") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    notify("变量组件不支持超链接，请只选中文本后再添加链接");
  }

  function blockLinkShortcut(event) {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (text(event.key).toLowerCase() !== "k") return;
    if (!selectionContainsChip() && state.mode !== "edit") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    notify("变量组件不支持超链接，请只选中文本后再添加链接");
  }

  function boot() {
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("mousedown", onChipPointer, true);
    document.addEventListener("click", onChipPointer, true);
    document.addEventListener("mousedown", onDocumentPointerDown, true);
    document.addEventListener("focusout", onDocumentFocusOut);
    document.addEventListener("mousemove", onChipDragMove, true);
    document.addEventListener("mouseup", onChipDragEnd, true);
    document.addEventListener("dragstart", preventChipNativeDrag, true);
    document.addEventListener("mousedown", blockLinkOnChip, true);
    document.addEventListener("click", blockLinkOnChip, true);
    document.addEventListener("keydown", blockLinkShortcut, true);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && dragState) cancelChipDrag();
    });
    window.addEventListener("blur", cancelChipDrag);
    watchRail();
  }

  window.MC_VARIABLE_SCHEMA = {
    get: getSchema,
    load: loadSchema,
    syncFromContent: function (content) { return syncFromContent(content); },
    validateContent: validateContent,
    tokenHtml: captureTokenHtml,
    sanitizeContent: sanitizeContent,
    refreshUsage: refreshUsage,
    clear: function () {
      state.list = [];
      state.usage = {};
      state.caret = null;
      state.selectedText = "";
      if (refs.dock) setMode("insert");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
