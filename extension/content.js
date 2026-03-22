let lastSeenMessageID = null;
let debounceTimer = null;

// When the click listener handles an analysis it sets this timestamp.
// onDOMChange checks it and skips firing for 1.5s to prevent double-analysis.
let suppressObserverUntil = 0;

// ─── Compose monitoring state ─────────────────────────────────────────────────

const COMPOSE_SELECTORS = [
  '[role="textbox"][aria-label*="Message Body"]',
  "div.Am.Al.editable",
  'div[contenteditable="true"][aria-multiline="true"]',
];

// Reply box selectors used by the compose watcher so reply windows also
// get input listeners attached (Mod 3 — compose hint while replying).
const REPLY_BOX_SELECTORS = [
  '[role="textbox"][aria-label*="Reply"]',
  '[role="textbox"][aria-label*="Message Body"]',
  "div.Am.Al.editable",
];

let composeDebounceTimer = null;
let lastComposeTriggerID = null;

// ─── Safe message sender ──────────────────────────────────────────────────────

function safeSendMessage(payload) {
  try {
    if (!chrome.runtime?.id) {
      observer.disconnect();
      return;
    }
    chrome.runtime.sendMessage(payload).catch(() => {});
  } catch (_) {
    observer.disconnect();
  }
}

// ─── DOM Extraction ──────────────────────────────────────────────────────────

function extractSender(container) {
  try {
    const emailEl = container.querySelector("[email]");
    if (emailEl) {
      return emailEl.getAttribute("name") || emailEl.getAttribute("email") || emailEl.textContent.trim();
    }
    const gdEl = container.querySelector(".gD");
    if (gdEl) return gdEl.textContent.trim();
  } catch (_) {}
  return "Unknown";
}

function extractText(container) {
  try {
    const ltr = container.querySelector('[dir="ltr"]');
    if (ltr) return ltr.innerText.trim();
  } catch (_) {}
  try {
    const aiL = container.querySelector(".a3s.aiL");
    if (aiL) return aiL.innerText.trim();
  } catch (_) {}
  try {
    const gt = container.querySelector(".ii.gt div");
    if (gt) return gt.innerText.trim();
  } catch (_) {}
  return "";
}

// ─── Own message detection ────────────────────────────────────────────────────

function getLoggedInEmail() {
  try {
    const a1 = document.querySelector('a[aria-label*="Google Account"]');
    if (a1) {
      const match = a1.getAttribute("aria-label").match(/\(([^)]+)\)/);
      if (match) return match[1].toLowerCase().trim();
    }
  } catch (_) {}

  try {
    const a2 = document.querySelector("[data-email]");
    if (a2) return a2.getAttribute("data-email").toLowerCase().trim();
  } catch (_) {}

  try {
    const a3 = document.querySelector('img[alt*="@"]');
    if (a3) return a3.getAttribute("alt").toLowerCase().trim();
  } catch (_) {}

  return null;
}

function getSenderEmail(container) {
  try {
    const el = container.querySelector("[email]");
    if (el) return (el.getAttribute("email") || "").toLowerCase().trim();
  } catch (_) {}
  return null;
}

function isOwnMessage(container) {
  const myEmail = getLoggedInEmail();
  const senderEmail = getSenderEmail(container);
  if (!myEmail || !senderEmail) return false;
  return myEmail === senderEmail;
}

// ─── Container helpers (Mod 2) ───────────────────────────────────────────────

function getMessageContainers() {
  const CONTAINER_SELECTORS = ['[role="listitem"]', ".h7", ".adn.ads"];
  for (const sel of CONTAINER_SELECTORS) {
    try {
      const found = document.querySelectorAll(sel);
      if (found && found.length > 0) return Array.from(found);
    } catch (_) {}
  }
  return [];
}

function extractCurrentThread() {
  try {
    const containers = getMessageContainers();
    if (containers.length === 0) return null;

    const messages = containers
      .map((el) => ({
        sender: extractSender(el),
        text: extractText(el),
        isOwn: isOwnMessage(el),
      }))
      .filter((m) => m.text.length > 0);

    if (messages.length === 0) return null;

    const current_message = messages[messages.length - 1];
    const history = messages.slice(0, -1).slice(-8);

    return { current_message, history };
  } catch (_) {
    return null;
  }
}

// ─── Trigger IDs ─────────────────────────────────────────────────────────────

function getTriggerID(text, sender) {
  const raw = sender + "::" + text.trim().slice(0, 50);
  return btoa(encodeURIComponent(raw));
}

function getComposeTriggerID(text) {
  const raw = "compose::" + text.trim().slice(0, 50);
  return btoa(encodeURIComponent(raw));
}

// ─── Per-message click detection (Mod 2) ────────────────────────────────────
// Analyzes whichever message was clicked, not always the last one.
// Messages above the clicked one become history.

function handleClickedMessage(target) {
  try {
    const CONTAINER_SELECTORS = ['[role="listitem"]', ".h7", ".adn.ads"];
    let clickedContainer = null;

    for (const sel of CONTAINER_SELECTORS) {
      try {
        const el = target.closest(sel);
        if (el) { clickedContainer = el; break; }
      } catch (_) {}
    }

    if (!clickedContainer) return;

    const clickedMessage = {
      sender: extractSender(clickedContainer),
      text: extractText(clickedContainer),
      isOwn: isOwnMessage(clickedContainer),
    };

    if (!clickedMessage.text) return;

    const allContainers = getMessageContainers();
    const clickedIndex = allContainers.indexOf(clickedContainer);

    const history = allContainers
      .slice(0, clickedIndex)
      .map((el) => ({
        sender: extractSender(el),
        text: extractText(el),
        isOwn: isOwnMessage(el),
      }))
      .filter((m) => m.text.length > 0)
      .slice(-8);

    const thread = { current_message: clickedMessage, history };
    const triggerID = getTriggerID(clickedMessage.text, clickedMessage.sender);

    if (triggerID === lastSeenMessageID) return;
    if (BridgeState.isDismissed(triggerID)) return;

    lastSeenMessageID = triggerID;
    suppressObserverUntil = Date.now() + 1500;

    safeSendMessage({ type: "NEW_MESSAGE", data: thread, triggerID });
  } catch (_) {}
}

// Delay 350ms to let Gmail fully expand the clicked message before reading text.
document.addEventListener(
  "click",
  (e) => {
    if (!chrome.runtime?.id) return;
    setTimeout(() => handleClickedMessage(e.target), 350);
  },
  true
);

// ─── Observer Callback ───────────────────────────────────────────────────────
// Handles thread open on navigation. Skips if click listener already fired.

function onDOMChange() {
  if (!chrome.runtime?.id) {
    observer.disconnect();
    return;
  }

  if (Date.now() < suppressObserverUntil) return;

  const thread = extractCurrentThread();
  if (!thread) return;

  const { current_message } = thread;
  if (!current_message || !current_message.text) return;

  const triggerID = getTriggerID(current_message.text, current_message.sender);

  if (triggerID === lastSeenMessageID) return;
  if (BridgeState.isDismissed(triggerID)) return;

  lastSeenMessageID = triggerID;

  safeSendMessage({ type: "NEW_MESSAGE", data: thread, triggerID });
}

// ─── MutationObserver (receive side) ─────────────────────────────────────────

const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(onDOMChange, 300);
});

observer.observe(document.body, { childList: true, subtree: true });

// ─── Compose box helpers ──────────────────────────────────────────────────────

function getComposeBox() {
  for (const sel of COMPOSE_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

// ─── Compose monitoring (Mod 3) ──────────────────────────────────────────────
// Watches both new compose windows and inline reply boxes for input events.

function onComposeChange() {
  const box = getComposeBox();
  if (!box) return;

  const text = box.innerText.trim();

  if (text.length === 0) {
    lastComposeTriggerID = null;
    return;
  }

  if (text.length < 20) return;

  const triggerID = getComposeTriggerID(text);

  if (BridgeState.isDismissed(triggerID)) return;
  if (triggerID === lastComposeTriggerID) return;

  clearTimeout(composeDebounceTimer);
  composeDebounceTimer = setTimeout(() => {
    lastComposeTriggerID = triggerID;
    safeSendMessage({
      type: "ANALYZE_COMPOSE",
      data: { current_message: { sender: "me", text }, history: [] },
      triggerID,
    });
  }, 800);
}

// Watch for both compose windows and reply boxes appearing in the DOM,
// and attach input listeners to each when found.
const composeWatcher = new MutationObserver(() => {
  const allSelectors = [...COMPOSE_SELECTORS, ...REPLY_BOX_SELECTORS];
  for (const sel of allSelectors) {
    try {
      const boxes = document.querySelectorAll(sel);
      boxes.forEach((box) => {
        if (!box.dataset.repliqWatched) {
          box.dataset.repliqWatched = "true";
          box.addEventListener("input", onComposeChange);
        }
      });
    } catch (_) {}
  }
});

composeWatcher.observe(document.body, { childList: true, subtree: true });

// ─── Reply box population (receive side) ─────────────────────────────────────

const REPLY_SELECTORS = [
  '[role="textbox"][aria-label*="Reply"]',
  '[role="textbox"][aria-label*="Message Body"]',
  "div.Am.Al.editable",
  'div[contenteditable="true"]',
];

function applyReplyToGmail(text) {
  try {
    const replyBtn = document.querySelector(
      '[data-tooltip="Reply"], [aria-label="Reply"]'
    );
    if (replyBtn) replyBtn.click();
  } catch (_) {}

  setTimeout(() => {
    let replyBox = null;
    for (const sel of REPLY_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el) { replyBox = el; break; }
      } catch (_) {}
    }

    if (!replyBox) return;

    replyBox.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);

    try {
      const range = document.createRange();
      range.selectNodeContents(replyBox);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }, 500);
}

// ─── Compose box text replacement (send side) ────────────────────────────────

function applyToComposeBox(text) {
  const box = getComposeBox();
  if (!box) return;

  box.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);

  try {
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

// ─── Incoming Messages from background.js ────────────────────────────────────

try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ANALYSIS_RESULT") {
      BridgeState.activate(message.data.trigger_id, message.data);
    }
    if (message.type === "DISMISS") {
      BridgeState.dismiss(message.triggerID);
    }
    if (message.type === "APPLY_REPLY") {
      applyReplyToGmail(message.text);
      BridgeState.dismiss(message.triggerID);
    }
    if (message.type === "APPLY_REWRITE") {
      applyToComposeBox(message.text);
      BridgeState.dismiss(message.triggerID);
      lastComposeTriggerID = null;
    }
  });
} catch (_) {
  // Context already invalidated when this script loaded
}
