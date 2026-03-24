const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

app.use(express.json());

const VERIFY_TOKEN = "sol_verify_123";
const VF_API_KEY = process.env.VF_API_KEY;
const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;

// ---- SESSION CONTROL CONFIG ----
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const sessions = {};

// ---- SESSION HELPERS ----
function generateSessionId() {
  return crypto.randomUUID();
}

function getOrCreateSession(userID) {
  const now = Date.now();
  const existing = sessions[userID];

  if (!existing) {
    const newSession = {
      session_id: generateSessionId(),
      user_id: userID,
      state: "idle",
      active_request: null,
      created_at: now,
      last_seen: now
    };

    sessions[userID] = newSession;
    console.log(`[SESSION CREATED] user=${userID} session_id=${newSession.session_id}`);
    return newSession;
  }

  const expired = now - existing.last_seen > SESSION_TIMEOUT_MS;

  if (expired) {
    const newSession = {
      session_id: generateSessionId(),
      user_id: userID,
      state: "idle",
      active_request: null,
      created_at: now,
      last_seen: now
    };

    sessions[userID] = newSession;
    console.log(`[SESSION EXPIRED → NEW SESSION] user=${userID}`);
    return newSession;
  }

  existing.last_seen = now;
  return existing;
}

function updateSession(userID, updates = {}) {
  if (!sessions[userID]) return;
  sessions[userID] = {
    ...sessions[userID],
    ...updates,
    last_seen: Date.now()
  };
}

// ---- INTENT DETECTION (V2 SIMPLE) ----
function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("reserva") || t.includes("book") || t.includes("reservar")) {
    return "reservation";
  }

  if (t.includes("problema") || t.includes("queja") || t.includes("complaint")) {
    return "complaint";
  }

  if (t.includes("info") || t.includes("horario") || t.includes("hours")) {
    return "info";
  }

  return null;
}

// ---- WEBHOOK VERIFICATION ----
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ---- INBOUND MESSAGE HANDLER ----
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || message.type !== "text") return;

    const userID = message.from;
    const userText = message.text.body;

    const session = getOrCreateSession(userID);

    console.log(`[INBOUND] user=${userID} session_id=${session.session_id} text="${userText}"`);
    console.log(`[SESSION BEFORE]`, session);

    // ---- REQUEST DETECTION ----
    if (!session.active_request) {
      const intent = detectIntent(userText);

      if (intent) {
        const newRequest = {
          type: intent,
          status: "inquiry"
        };

        updateSession(userID, { active_request: newRequest });

        console.log(`[REQUEST DETECTED] user=${userID} type=${intent}`);
      }
    }

    // ---- CALL VOICEFLOW ----
    const vfResponse = await axios.post(
      `https://general-runtime.voiceflow.com/state/user/${userID}/interact`,
      {
        action: {
          type: "text",
          payload: userText
        }
      },
      {
        headers: {
          Authorization: VF_API_KEY,
          versionID: "production",
          "Content-Type": "application/json"
        }
      }
    );

    // ---- EXTRACT REPLIES ----
    const traces = vfResponse.data;
    const replies = traces
      .filter((t) => t.type === "text")
      .map((t) => t.payload?.message)
      .filter(Boolean);

    if (replies.length === 0) return;

    updateSession(userID, { state: "active" });

    console.log(`[SESSION AFTER]`, sessions[userID]);

    // ---- SEND TO WHATSAPP ----
    for (const reply of replies) {
      await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: reply }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log(`[OUTBOUND] user=${userID} reply="${reply}"`);
    }
  } catch (err) {
    console.error("[ERROR]", err.response?.data || err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
