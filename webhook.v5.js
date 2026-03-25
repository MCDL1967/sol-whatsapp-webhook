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
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const sessions = {};

// ---- SESSION HELPERS ----
function generateSessionId() {
  return crypto.randomUUID();
}

function createNewSession(userID, now) {
  return {
    session_id: generateSessionId(),
    user_id: userID,
    state: "idle",
    active_request: null,
    created_at: now,
    last_seen: now
  };
}

function getOrCreateSession(userID) {
  const now = Date.now();
  const existing = sessions[userID];

  if (!existing) {
    const newSession = createNewSession(userID, now);
    sessions[userID] = newSession;
    console.log(`[SESSION CREATED] user=${userID} session_id=${newSession.session_id}`);
    return newSession;
  }

  const expired = now - existing.last_seen > SESSION_TIMEOUT_MS;

  if (expired) {
    const newSession = createNewSession(userID, now);
    sessions[userID] = newSession;
    console.log(
      `[SESSION EXPIRED → NEW SESSION] user=${userID} old_session=${existing.session_id} new_session=${newSession.session_id}`
    );
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

function getSessionSummary(session) {
  return {
    session_id: session.session_id,
    user_id: session.user_id,
    state: session.state,
    active_request: session.active_request,
    created_at: session.created_at,
    last_seen: session.last_seen
  };
}

// ---- TEXT NORMALIZATION ----
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmojiOnly(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;

  const withoutEmojiLike = trimmed
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f]/gu, "")
    .trim();

  return withoutEmojiLike.length === 0;
}

function detectLanguageCommand(text) {
  const t = normalizeText(text);

  const englishCommands = ["english", "ingles"];
  const spanishCommands = ["espanol", "espanol por favor", "espanol porfa", "spanish"];

  if (englishCommands.includes(t)) return "en";
  if (spanishCommands.includes(t)) return "es";

  return null;
}

function isGreetingReentry(text) {
  const t = normalizeText(text);

  const greetings = [
    "hi",
    "hello",
    "hola",
    "hello sol",
    "hola sol",
    "hey",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches"
  ];

  return greetings.includes(t) || isEmojiOnly(text);
}

// ---- INTENT DETECTION ----
function detectIntent(text) {
  const t = normalizeText(text);

  const reservationKeywords = [
    "reserva",
    "reservar",
    "reservacion",
    "book",
    "booking",
    "table",
    "restaurant reservation",
    "restaurant booking"
  ];

  const complaintKeywords = [
    "queja",
    "complaint",
    "problema",
    "problem",
    "billing",
    "bill",
    "cargo",
    "charge",
    "mal servicio",
    "wrong charge"
  ];

  const infoKeywords = [
    "info",
    "informacion",
    "horario",
    "hours",
    "location",
    "ubicacion",
    "where",
    "donde"
  ];

  if (reservationKeywords.some((k) => t.includes(k))) {
    return "reservation";
  }

  if (complaintKeywords.some((k) => t.includes(k))) {
    return "complaint";
  }

  if (infoKeywords.some((k) => t.includes(k))) {
    return "info";
  }

  return null;
}

function isExplicitReset(text) {
  const t = normalizeText(text);

  const resetPhrases = [
    "olvida eso",
    "olvidalo",
    "cancel that",
    "never mind",
    "start over",
    "restart",
    "menu",
    "main menu",
    "otra cosa",
    "another question",
    "cambiar tema",
    "change topic",
    "idioma",
    "language"
  ];

  return resetPhrases.some((phrase) => t.includes(phrase));
}

function isLikelyContinuation(text) {
  const t = normalizeText(text);

  if (/^\d+$/.test(t)) return true;
  if (/^\d+[.)-]?$/.test(t)) return true;

  const shortReplies = [
    "si",
    "no",
    "ok",
    "okay",
    "dale",
    "va",
    "yes",
    "yeah",
    "yep",
    "nop",
    "2",
    "3",
    "4",
    "5"
  ];

  return shortReplies.includes(t);
}

function initialStatusForType(type) {
  switch (type) {
    case "reservation":
      return "inquiry";
    case "complaint":
      return "inquiry";
    case "info":
      return "inquiry";
    default:
      return "inquiry";
  }
}

function shouldSwitchIntent(currentRequest, newIntent, userText) {
  if (!currentRequest || !newIntent) return false;
  if (currentRequest.type === newIntent) return false;
  if (isLikelyContinuation(userText)) return false;

  return true;
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
  res.sendStatus(200); // acknowledge Meta immediately

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || message.type !== "text") return;

    const userID = message.from;
    const userText = message.text.body;

    const session = getOrCreateSession(userID);

    console.log(`[INBOUND] user=${userID} session_id=${session.session_id} text="${userText}"`);
    console.log(`[SESSION BEFORE]`, getSessionSummary(session));

    const languageCommand = detectLanguageCommand(userText);
    const explicitReset = isExplicitReset(userText);
    const greetingReentry = isGreetingReentry(userText);

    // Force flow entry on:
    // 1. new/idle session
    // 2. reset commands
    // 3. explicit language commands
    // 4. greeting-style reentry while no active request exists
    const forceLaunch =
      session.state === "idle" ||
      explicitReset ||
      languageCommand !== null ||
      (greetingReentry && !session.active_request);

    // ---- REQUEST CONTROL ----
    if (explicitReset || languageCommand !== null) {
      updateSession(userID, {
        active_request: null,
        state: "idle"
      });

      console.log(
        `[REQUEST RESET] user=${userID} reason=${
          languageCommand ? `language_command:${languageCommand}` : "explicit_reset_phrase"
        }`
      );
    } else {
      const detectedIntent = detectIntent(userText);
      const currentSession = sessions[userID];

      if (!currentSession.active_request) {
        if (detectedIntent) {
          const newRequest = {
            type: detectedIntent,
            status: initialStatusForType(detectedIntent)
          };

          updateSession(userID, { active_request: newRequest });

          console.log(
            `[REQUEST DETECTED] user=${userID} type=${newRequest.type} status=${newRequest.status}`
          );
        }
      } else {
        if (shouldSwitchIntent(currentSession.active_request, detectedIntent, userText)) {
          const previousType = currentSession.active_request.type;
          const newRequest = {
            type: detectedIntent,
            status: initialStatusForType(detectedIntent)
          };

          updateSession(userID, { active_request: newRequest });

          console.log(
            `[REQUEST SWITCH] user=${userID} from=${previousType} to=${newRequest.type} status=${newRequest.status}`
          );
        } else {
          console.log(
            `[REQUEST CONTINUING] user=${userID} type=${currentSession.active_request.type} status=${currentSession.active_request.status}`
          );
        }
      }
    }

    const vfAction = forceLaunch
      ? { type: "launch" }
      : {
          type: "text",
          payload: userText
        };

    console.log(
      `[VOICEFLOW REQUEST] user=${userID} session_id=${sessions[userID].session_id} action=${vfAction.type}${
        languageCommand ? ` language=${languageCommand}` : ""
      }`
    );

    // ---- CALL VOICEFLOW ----
    const vfResponse = await axios.post(
      `https://general-runtime.voiceflow.com/state/user/${userID}/interact`,
      {
        action: vfAction,
        config: {
          session_id: sessions[userID].session_id
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

    // ---- EXTRACT TEXT REPLIES FROM VOICEFLOW ----
    const traces = vfResponse.data;
    const replies = traces
      .filter((t) => t.type === "text")
      .map((t) => t.payload?.message)
      .filter(Boolean);

    if (replies.length === 0) {
      console.log(
        `[VOICEFLOW] No text reply for user=${userID} session_id=${sessions[userID].session_id} action=${vfAction.type}`
      );
      return;
    }

    updateSession(userID, { state: "active" });

    console.log(`[SESSION AFTER]`, getSessionSummary(sessions[userID]));

    // ---- SEND REPLY BACK VIA WHATSAPP ----
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

      console.log(
        `[OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${reply}"`
      );
    }
  } catch (err) {
    console.error("[ERROR]", err.response?.data || err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
