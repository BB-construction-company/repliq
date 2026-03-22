// Independent visibility flags for the two sections.
// Both can be true simultaneously — decode stays while compose hint appears.
let decodeVisible = false;
let composeVisible = false;

// ─── Section helpers ──────────────────────────────────────────────────────────

function hideAllSections() {
  [
    "state-loading",
    "section-decode",
    "section-divider",
    "section-compose",
    "section-compose-loading",
    "state-error",
  ].forEach((id) => {
    document.getElementById(id)?.classList.add("hidden");
  });
}

// Show divider only when decode result and compose hint are both visible.
function updateDivider() {
  const composeLoadingVisible = !document.getElementById("section-compose-loading")
    .classList.contains("hidden");
  const divider = document.getElementById("section-divider");

  if (decodeVisible && (composeVisible || composeLoadingVisible)) {
    divider.classList.remove("hidden");
  } else {
    divider.classList.add("hidden");
  }
}

// ─── Global state transitions ─────────────────────────────────────────────────

// Full reset — clears everything and shows the idle message.
function showLoading() {
  decodeVisible = false;
  composeVisible = false;
  hideAllSections();
  document.getElementById("state-loading").classList.remove("hidden");
}

// Full reset to error state (decode failure).
function showError() {
  decodeVisible = false;
  composeVisible = false;
  hideAllSections();
  document.getElementById("state-error").classList.remove("hidden");
}

// Show compose-loading indicator below decode section (if active) or alone.
function showComposeLoading() {
  document.getElementById("state-loading").classList.add("hidden");
  document.getElementById("section-compose").classList.add("hidden");
  composeVisible = false;
  document.getElementById("section-compose-loading").classList.remove("hidden");
  updateDivider();
}

// ─── Decode panel renderer ────────────────────────────────────────────────────

function renderPanel(analysis, triggerID, isOwn) {
  // Only hide the loading/error states — do not touch compose section.
  document.getElementById("state-loading").classList.add("hidden");
  document.getElementById("state-error").classList.add("hidden");
  document.getElementById("section-decode").classList.remove("hidden");
  decodeVisible = true;

  // Tone dot
  const toneDot = document.getElementById("tone-dot");
  toneDot.className = "";
  toneDot.classList.add(analysis.tone_flag);

  // Tone summary
  document.getElementById("tone-summary").textContent = isOwn
    ? analysis.tone_summary + " (your message)"
    : analysis.tone_summary;

  // Explanation — always shown
  document.getElementById("explanation").textContent = analysis.explanation;

  // Possible meanings — always shown
  const meaningsList = document.getElementById("meanings-list");
  meaningsList.innerHTML = "";
  (analysis.possible_meanings || []).forEach((item) => {
    const div = document.createElement("div");
    div.className = `meaning-item ${item.likelihood}`;
    div.textContent = item.text;
    meaningsList.appendChild(div);
  });

  // Dismiss — always shown, resets the entire panel to idle
  document.getElementById("btn-dismiss").onclick = () => {
    chrome.runtime.sendMessage({ type: "DISMISS", triggerID });
    showLoading();
  };

  // Suggested reply — hidden for own messages or when there is no suggestion
  const replySection = document.getElementById("reply-section");
  if (isOwn || !analysis.suggested_reply) {
    replySection.classList.add("hidden");
  } else {
    document.getElementById("suggested-reply").textContent = analysis.suggested_reply;
    replySection.classList.remove("hidden");
    document.getElementById("btn-apply-reply").onclick = () => {
      chrome.runtime.sendMessage({
        type: "APPLY_REPLY",
        text: analysis.suggested_reply,
        triggerID,
      });
      showLoading();
    };
  }

  updateDivider();
}

// ─── Compose hint renderer ────────────────────────────────────────────────────

function renderComposeHint(analysis, triggerID) {
  // Hide loading indicator and idle state only — decode section stays.
  document.getElementById("state-loading").classList.add("hidden");
  document.getElementById("section-compose-loading").classList.add("hidden");
  document.getElementById("section-compose").classList.remove("hidden");
  composeVisible = true;

  document.getElementById("compose-flag-reason").textContent =
    analysis.flag_reason || "Unclear phrasing detected";

  document.getElementById("compose-explanation").textContent =
    analysis.explanation || "";

  document.getElementById("compose-rewrite").textContent =
    analysis.compose_rewrite || "";

  // Dismiss only hides the compose section — decode stays intact
  document.getElementById("btn-compose-dismiss").onclick = () => {
    chrome.runtime.sendMessage({ type: "DISMISS", triggerID });
    document.getElementById("section-compose").classList.add("hidden");
    composeVisible = false;
    updateDivider();
  };

  const applyRewrite = () => {
    chrome.runtime.sendMessage({
      type: "APPLY_REWRITE",
      text: analysis.compose_rewrite,
      triggerID,
    });
    document.getElementById("section-compose").classList.add("hidden");
    composeVisible = false;
    updateDivider();
  };

  document.getElementById("btn-apply-rewrite").onclick = applyRewrite;
  document.getElementById("compose-rewrite").onclick = applyRewrite;

  updateDivider();
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  // ── Decode side ──
  if (message.type === "ANALYSIS_RESULT") {
    renderPanel(message.data, message.triggerID, message.isOwn ?? false);
  }
  if (message.type === "ANALYSIS_ERROR") {
    showError();
  }
  if (message.type === "PANEL_LOADING") {
    showLoading();
  }

  // ── Compose side ──
  // No decodeActive guard — both sections can now be visible simultaneously.
  if (message.type === "COMPOSE_LOADING") {
    showComposeLoading();
  }
  if (message.type === "COMPOSE_RESULT") {
    renderComposeHint(message.data, message.triggerID);
  }
  if (message.type === "COMPOSE_CLEAR") {
    // Only clear the compose section — never touch decode.
    document.getElementById("section-compose").classList.add("hidden");
    document.getElementById("section-compose-loading").classList.add("hidden");
    composeVisible = false;
    updateDivider();
    // If neither section is showing anything, return to idle
    if (!decodeVisible) {
      document.getElementById("state-loading").classList.remove("hidden");
    }
  }
});

// ─── On load: pull any cached result from background ─────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ type: "PANEL_READY" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.data) {
      renderPanel(response.data, response.triggerID, response.isOwn ?? false);
    }
  });
});
