const BACKEND_URL = "http://localhost:3000";

const DEFAULT_PREFERENCES = {
  receiving: [
    "Be explicit about urgency",
    "Say directly if something is wrong",
  ],
  sending: [],
  ambiguous: ["Show me possible interpretations"],
};

// Track the last Gmail tab that sent a message so DISMISS/APPLY_REPLY
// can be forwarded back to the correct tab.
let lastTabId = null;

// Cache the most recent analysis so the panel can pull it when it opens.
// Without this, any message sent before the panel page is loaded is lost.
let lastAnalysis = null;

// ─── Open side panel when extension icon is clicked ──────────────────────────
// Wrapped in onInstalled so chrome.sidePanel is guaranteed to be initialized
// before this runs. Calling it at the top level races the API init on cold start.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

// ─── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NEW_MESSAGE") {
    handleNewMessage(message, sender);
  }

  // Panel just opened — send back the cached result immediately if we have one
  if (message.type === "PANEL_READY") {
    sendResponse(lastAnalysis);
    return true;
  }

  if (message.type === "DISMISS") {
    if (lastTabId !== null) {
      chrome.tabs.sendMessage(lastTabId, {
        type: "DISMISS",
        triggerID: message.triggerID,
      });
    }
  }

  if (message.type === "APPLY_REPLY") {
    if (lastTabId !== null) {
      chrome.tabs.sendMessage(lastTabId, {
        type: "APPLY_REPLY",
        text: message.text,
        triggerID: message.triggerID,
      });
    }
  }

  if (message.type === "ANALYZE_COMPOSE") {
    handleComposeAnalysis(message, sender);
  }

  if (message.type === "APPLY_REWRITE") {
    if (lastTabId !== null) {
      chrome.tabs.sendMessage(lastTabId, {
        type: "APPLY_REWRITE",
        text: message.text,
        triggerID: message.triggerID,
      });
    }
  }

  if (message.type === "SAVE_TOKEN") {
    (async () => {
      await chrome.storage.local.set({ firebaseToken: message.token });
      await fetchAndCachePreferences(message.token);
      sendResponse({ success: true });
    })();
    return true;
  }
});

// ─── Fetch and cache preferences from backend ─────────────────────────────────

async function fetchAndCachePreferences(token) {
  try {
    const response = await fetch(`${BACKEND_URL}/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    await chrome.storage.local.set({ userPreferences: data.preferences });
    console.log("[Repliq] Preferences cached from Firestore");
  } catch (err) {
    console.error("[Repliq] Failed to fetch preferences:", err.message);
  }
}

// ─── Core analysis flow ──────────────────────────────────────────────────────

async function handleNewMessage(message, sender) {
  lastTabId = sender.tab.id;
  lastAnalysis = null; // clear stale result while new one is loading

  // Try to auto-open the side panel — works when triggered by user clicking
  // an email (user gesture chain). Silently ignored if Chrome blocks it.
  try {
    await chrome.sidePanel.open({ tabId: sender.tab.id });
  } catch (_) {}

  // Tell any already-open panel to show the loading state
  chrome.runtime.sendMessage({ type: "PANEL_LOADING" }).catch(() => {});

  try {
    const stored = await chrome.storage.local.get("userPreferences");
    const preferences = stored.userPreferences ?? DEFAULT_PREFERENCES;

    const payload = {
      current_message: message.data.current_message,
      history: message.data.history,
      user_preferences: preferences,
      mode: "decode",
      trigger_id: message.triggerID,
    };

    const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    // Extract isOwn so panel can suppress the suggested reply section
    const isOwn = message.data.current_message.isOwn ?? false;

    // Cache so the panel can pull it on PANEL_READY
    lastAnalysis = { data: result, triggerID: message.triggerID, isOwn };

    // Broadcast to any already-open panel
    chrome.runtime.sendMessage({
      type: "ANALYSIS_RESULT",
      data: result,
      triggerID: message.triggerID,
      isOwn,
    }).catch(() => {});

    // Keep content.js BridgeState in sync
    chrome.tabs.sendMessage(sender.tab.id, {
      type: "ANALYSIS_RESULT",
      data: result,
      isOwn,
    });
  } catch (err) {
    console.error("[Bridge] Failed to analyze message:", err.message);
    chrome.runtime.sendMessage({ type: "ANALYSIS_ERROR" }).catch(() => {});
  }
}

// ─── Compose analysis flow ────────────────────────────────────────────────────

async function handleComposeAnalysis(message, sender) {
  lastTabId = sender.tab.id;

  chrome.runtime.sendMessage({ type: "COMPOSE_LOADING" }).catch(() => {});

  try {
    const stored = await chrome.storage.local.get("userPreferences");
    const preferences = stored.userPreferences ?? DEFAULT_PREFERENCES;

    const payload = {
      current_message: message.data.current_message,
      history: message.data.history,
      user_preferences: preferences,
      mode: "compose",
      trigger_id: message.triggerID,
    };

    const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    // No issues found — return panel to idle silently
    if (!result.compose_rewrite) {
      chrome.runtime.sendMessage({ type: "COMPOSE_CLEAR" }).catch(() => {});
      return;
    }

    chrome.runtime.sendMessage({
      type: "COMPOSE_RESULT",
      data: result,
      triggerID: message.triggerID,
    }).catch(() => {});

  } catch (err) {
    console.error("[Repliq] Compose analysis failed:", err.message);
    // On error, clear silently — compose hints should never show an error state
    chrome.runtime.sendMessage({ type: "COMPOSE_CLEAR" }).catch(() => {});
  }
}
