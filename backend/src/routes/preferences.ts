import { Router, Request, Response } from "express";
import { adminDb, adminAuth } from "../firebase.js";

const router = Router();

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("users").doc(decoded.uid).get();

    if (!snap.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const data = snap.data();
    res.json({ preferences: data?.preferences });
  } catch (_err) {
    res.status(401).json({ error: "Unauthorized" });
  }
});

export default router;
