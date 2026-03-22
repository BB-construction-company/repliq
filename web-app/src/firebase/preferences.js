import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

export async function createUserDocument(uid, email) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    email,
    createdAt: serverTimestamp(),
    preferences: {
      receiving: [
        "Be explicit about urgency",
        "Say directly if something is wrong",
      ],
      sending: [
        "Suggest clearer phrasing for vague sentences",
        "Tell me when urgency is implied but not stated",
      ],
      ambiguous: [
        "Show me possible interpretations",
        "Suggest a reply that checks in directly",
      ],
    },
    visibility: {
      hintsEnabled: true,
      senderReason: "none",
    },
  });
}

export async function getUserPreferences(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().preferences;
}

export async function saveUserPreferences(uid, preferences) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { preferences });
}

export async function getUserDocument(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}
