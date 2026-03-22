import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, deleteUser } from "firebase/auth";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { getUserDocument, saveUserPreferences } from "../firebase/preferences";
import styles from "./ProfilePage.module.css";

const TABS = ["Preferences", "Visibility", "Account"];

export default function ProfilePage() {
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [activeTab, setActiveTab] = useState("Preferences");
  const [loading, setLoading] = useState(true);

  // Preferences tab state
  const [preferences, setPreferences] = useState(null);
  const [savedPreferences, setSavedPreferences] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Visibility tab state
  const [visibility, setVisibility] = useState({
    hintsEnabled: true,
    senderReason: "none",
  });
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilitySaved, setVisibilitySaved] = useState(false);

  // Account tab state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Per-section input values
  const [inputs, setInputs] = useState({ receiving: "", sending: "", ambiguous: "" });

  useEffect(() => {
    if (!user) return;
    getUserDocument(user.uid).then((data) => {
      if (data) {
        setPreferences(data.preferences);
        setSavedPreferences(data.preferences);
        if (data.visibility) setVisibility(data.visibility);
      }
      setLoading(false);
    });
  }, [user]);

  // ── Preferences helpers ────────────────────────────────────────────────────

  function removeTag(section, index) {
    setPreferences((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }));
  }

  function addTag(section) {
    const value = inputs[section].trim();
    if (!value) return;
    if (preferences[section].includes(value)) {
      setInputs((prev) => ({ ...prev, [section]: "" }));
      return;
    }
    setPreferences((prev) => ({
      ...prev,
      [section]: [...prev[section], value],
    }));
    setInputs((prev) => ({ ...prev, [section]: "" }));
  }

  function handleInputKeyDown(section, e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(section);
    }
  }

  async function handleSavePreferences() {
    setSaving(true);
    try {
      await saveUserPreferences(user.uid, preferences);
      setSavedPreferences(preferences);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setPreferences(savedPreferences);
    setInputs({ receiving: "", sending: "", ambiguous: "" });
  }

  // ── Visibility helpers ─────────────────────────────────────────────────────

  async function handleSaveVisibility() {
    setSavingVisibility(true);
    try {
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, { visibility });
      setVisibilitySaved(true);
      setTimeout(() => setVisibilitySaved(false), 2000);
    } finally {
      setSavingVisibility(false);
    }
  }

  // ── Account helpers ────────────────────────────────────────────────────────

  async function handleSignOut() {
    await signOut(auth);
    navigate("/login");
  }

  async function handleDeleteAccount() {
    await deleteDoc(doc(db, "users", user.uid));
    await deleteUser(user);
    navigate("/login");
  }

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.logo}>Repliq</h1>
          <p className={styles.headerSub}>Communication preferences</p>
        </header>

        <nav className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === "Preferences" && preferences && (
          <PreferencesTab
            preferences={preferences}
            inputs={inputs}
            setInputs={setInputs}
            removeTag={removeTag}
            addTag={addTag}
            handleInputKeyDown={handleInputKeyDown}
            saving={saving}
            saveSuccess={saveSuccess}
            onSave={handleSavePreferences}
            onDiscard={handleDiscard}
          />
        )}

        {activeTab === "Visibility" && (
          <VisibilityTab
            visibility={visibility}
            setVisibility={setVisibility}
            saving={savingVisibility}
            saved={visibilitySaved}
            onSave={handleSaveVisibility}
          />
        )}

        {activeTab === "Account" && (
          <AccountTab
            email={user?.email}
            showDeleteConfirm={showDeleteConfirm}
            setShowDeleteConfirm={setShowDeleteConfirm}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </div>
    </div>
  );
}

// ── Preferences Tab ────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    key: "receiving",
    title: "How I prefer to receive messages",
    subtitle: "Affects how the extension decodes incoming emails",
  },
  {
    key: "sending",
    title: "How I prefer to send messages",
    subtitle: "Affects suggestions shown while composing",
  },
  {
    key: "ambiguous",
    title: "When a message feels ambiguous",
    subtitle: "Affects interpretations shown for unclear messages",
  },
];

function PreferencesTab({
  preferences,
  inputs,
  setInputs,
  removeTag,
  addTag,
  handleInputKeyDown,
  saving,
  saveSuccess,
  onSave,
  onDiscard,
}) {
  return (
    <div className={styles.tabContent}>
      {SECTIONS.map(({ key, title, subtitle }) => (
        <section key={key} className={styles.section}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <p className={styles.sectionSubtitle}>{subtitle}</p>
          <div className={styles.tags}>
            {preferences[key].map((tag, i) => (
              <span key={i} className={styles.tag}>
                {tag}
                <button
                  className={styles.tagRemove}
                  onClick={() => removeTag(key, i)}
                  aria-label={`Remove "${tag}"`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className={styles.addRow}>
            <input
              className={styles.addInput}
              type="text"
              placeholder="Add a preference…"
              value={inputs[key]}
              onChange={(e) =>
                setInputs((prev) => ({ ...prev, [key]: e.target.value }))
              }
              onKeyDown={(e) => handleInputKeyDown(key, e)}
            />
            <button
              className={styles.addBtn}
              onClick={() => addTag(key)}
            >
              Add
            </button>
          </div>
        </section>
      ))}

      <div className={styles.saveBar}>
        <button className={styles.discardBtn} onClick={onDiscard} disabled={saving}>
          Discard changes
        </button>
        <button className={styles.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : saveSuccess ? "Saved" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

// ── Visibility Tab ─────────────────────────────────────────────────────────────

function VisibilityTab({ visibility, setVisibility, saving, saved, onSave }) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.visibilityRow}>
        <div className={styles.visibilityInfo}>
          <p className={styles.visibilityLabel}>Preference hints</p>
          <p className={styles.visibilityDesc}>
            Allow the extension to adapt hints based on your preferences
          </p>
        </div>
        <div className={styles.pillToggle}>
          <button
            className={`${styles.pill} ${visibility.hintsEnabled ? styles.pillActive : ""}`}
            onClick={() => setVisibility((v) => ({ ...v, hintsEnabled: true }))}
          >
            On
          </button>
          <button
            className={`${styles.pill} ${!visibility.hintsEnabled ? styles.pillActive : ""}`}
            onClick={() => setVisibility((v) => ({ ...v, hintsEnabled: false }))}
          >
            Off
          </button>
        </div>
      </div>

      <div className={styles.visibilityRow}>
        <div className={styles.visibilityInfo}>
          <p className={styles.visibilityLabel}>What senders are told</p>
          <p className={styles.visibilityDesc}>
            If hints are on, what reason appears in the sender suggestion
          </p>
        </div>
        <div className={styles.pillToggle}>
          <button
            className={`${styles.pill} ${visibility.senderReason === "none" ? styles.pillActive : ""}`}
            onClick={() => setVisibility((v) => ({ ...v, senderReason: "none" }))}
          >
            No reason
          </button>
          <button
            className={`${styles.pill} ${visibility.senderReason === "general_clarity" ? styles.pillActive : ""}`}
            onClick={() =>
              setVisibility((v) => ({ ...v, senderReason: "general_clarity" }))
            }
          >
            General clarity
          </button>
        </div>
      </div>

      <div className={styles.saveBar}>
        <button className={styles.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save visibility settings"}
        </button>
      </div>
    </div>
  );
}

// ── Account Tab ────────────────────────────────────────────────────────────────

function AccountTab({
  email,
  showDeleteConfirm,
  setShowDeleteConfirm,
  onSignOut,
  onDeleteAccount,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.accountEmail}>
        <span className={styles.accountEmailLabel}>Signed in as</span>
        <span className={styles.accountEmailValue}>{email}</span>
      </div>

      <div className={styles.accountActions}>
        <div className={styles.accountAction}>
          <div>
            <p className={styles.actionTitle}>Sign out</p>
            <p className={styles.actionDesc}>Sign out of your Repliq account</p>
          </div>
          <button className={styles.secondaryBtn} onClick={onSignOut}>
            Sign out
          </button>
        </div>

        <div className={styles.accountAction}>
          <div>
            <p className={styles.actionTitle}>Delete account</p>
            <p className={styles.actionDesc}>
              Permanently delete your preferences and account data
            </p>
          </div>
          <button
            className={styles.dangerBtn}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete account
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard}>
            <p className={styles.confirmText}>
              Are you sure? This will permanently delete your preferences and
              cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button className={styles.dangerBtn} onClick={onDeleteAccount}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
