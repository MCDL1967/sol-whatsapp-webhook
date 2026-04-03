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

function detectRestartCommand(text) {
  const t = normalizeText(text);

  const restartPhrases = ["start over", "restart"];

  return restartPhrases.includes(t);
}

function detectMenuCommand(text) {
  const t = normalizeText(text);

  const menuPhrases = ["menu", "main menu", "menu principal", "menú", "menu please"];

  return menuPhrases.includes(t);
}

function detectExitCommand(text) {
  const t = normalizeText(text);

  const exitPhrases = ["exit", "goodbye", "bye", "adios", "hasta luego", "chau"];

  return exitPhrases.includes(t);
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
    case "complaint":
    case "info":
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

function shouldClearActiveRequest(currentRequest, newIntent, userText) {
  if (!currentRequest) return false;
  if (newIntent) return false;
  if (isLikelyContinuation(userText)) return false;

  const t = normalizeText(userText);

  const topicShiftHints = [
    "ruleta",
    "roulette",
    "poker",
    "blackjack",
    "casino",
    "gaming",
    "instalaciones",
    "facilities",
    "property",
    "dossier",
    "habitaciones",
    "rooms",
    "spa",
    "transporte",
    "transport",
    "system prompt",
    "prompt",
    "objetivo",
    "who are you",
    "quien eres"
  ];

  return topicShiftHints.some((hint) => t.includes(hint));
}

function getSafetyFallbackMessage(text) {
  const t = normalizeText(text);

  const gamingHints = [
    "ruleta",
    "roulette",
    "rulet",
    "roulet",
    "roulete",
    "poker",
    "powker",
    "blackjack",
    "bj",
    "slots",
    "slot",
    "casino",
    "juegos",
    "games"
  ];

  const spanishSignals =
    /[áéíóúñ¿¡]/i.test(text || "") ||
    ["hola", "gracias", "ruleta", "poker", "juegos", "ingles", "espanol", "español"].some((w) =>
      t.includes(normalizeText(w))
    );

  if (gamingHints.some((hint) => t.includes(hint))) {
    return spanishSignals
      ? "No capté bien esa consulta, pero con gusto te ayudo con juegos de casino. Puedes escribir el nombre del juego otra vez, por ejemplo: ruleta, póker o blackjack."
      : "I didn’t quite catch that, but I’d be happy to help with casino games. Please type the game name again, for example: roulette, poker, or blackjack.";
  }

  return spanishSignals
    ? "Lo siento, no capté bien tu mensaje. Puedo ayudarte con juegos, reservaciones, información general o quejas. ¿Qué te gustaría consultar?"
    : "Sorry, I didn’t quite catch that. I can help with games, reservations, general information, or complaints. What would you like to explore?";
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
    const restartCommand = detectRestartCommand(userText);
    const menuCommand = detectMenuCommand(userText);
    const exitCommand = detectExitCommand(userText);
    const greetingReentry = isGreetingReentry(userText);
    const detectedIntent = detectIntent(userText);

    // ---- REQUEST CONTROL ----
    if (restartCommand) {
      updateSession(userID, {
        active_request: null,
        state: "idle"
      });

      console.log(`[REQUEST RESET] user=${userID} reason=restart_command`);
    } else if (menuCommand) {
      updateSession(userID, {
        active_request: null
      });

      console.log(`[REQUEST RESET] user=${userID} reason=menu_command`);
    } else if (exitCommand) {
      updateSession(userID, {
        active_request: null,
        state: "idle"
      });

      console.log(`[REQUEST RESET] user=${userID} reason=exit_command`);
    } else {
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
        } else if (shouldClearActiveRequest(currentSession.active_request, detectedIntent, userText)) {
          const previousType = currentSession.active_request.type;

          updateSession(userID, { active_request: null });

          console.log(
            `[REQUEST CLEARED] user=${userID} from=${previousType} reason=non_continuation_unmatched_topic`
          );
        } else {
          console.log(
            `[REQUEST CONTINUING] user=${userID} type=${currentSession.active_request.type} status=${currentSession.active_request.status}`
          );
        }
      }
    }

    const forceLaunch =
      restartCommand ||
      (session.state === "idle" &&
        greetingReentry &&
        !languageCommand &&
        !menuCommand &&
        !exitCommand &&
        !detectedIntent);

    let forwardedText = userText;

    if (menuCommand) {
      forwardedText = "main menu";
    } else if (languageCommand === "en") {
      forwardedText = "english";
    } else if (languageCommand === "es") {
      forwardedText = "español";
    } else if (exitCommand) {
      forwardedText = "goodbye";
    }

    const vfUrl = `https://general-runtime.voiceflow.com/state/user/${userID}/interact`;
    const vfHeaders = {
      Authorization: VF_API_KEY,
      versionID: "production",
      "Content-Type": "application/json"
    };

    let traces = [];

    if (forceLaunch) {
      console.log(
        `[VOICEFLOW REQUEST] user=${userID} session_id=${sessions[userID].session_id} action=launch${
          languageCommand ? ` language=${languageCommand}` : ""
        }${menuCommand ? ` menu_command=true` : ""}${exitCommand ? ` exit_command=true` : ""}`
      );

      const vfResponse = await axios.post(
        vfUrl,
        {
          action: { type: "launch" },
          config: {
            session_id: sessions[userID].session_id
          }
        },
        {
          headers: vfHeaders
        }
      );

      traces = vfResponse.data;
    } else {
      const shouldPrimeIdleSession = session.state === "idle";

      if (shouldPrimeIdleSession) {
        console.log(
          `[VOICEFLOW PRIME] user=${userID} session_id=${sessions[userID].session_id} action=launch_then_text`
        );

        await axios.post(
          vfUrl,
          {
            action: { type: "launch" },
            config: {
              session_id: sessions[userID].session_id
            }
          },
          {
            headers: vfHeaders
          }
        );
      }

      console.log(
        `[VOICEFLOW REQUEST] user=${userID} session_id=${sessions[userID].session_id} action=text${
          languageCommand ? ` language=${languageCommand}` : ""
        }${menuCommand ? ` menu_command=true` : ""}${
          detectedIntent ? ` detected_intent=${detectedIntent}` : ""
        }${exitCommand ? ` exit_command=true` : ""} payload="${forwardedText}"`
      );

      const vfResponse = await axios.post(
        vfUrl,
        {
          action: {
            type: "text",
            payload: forwardedText
          },
          config: {
            session_id: sessions[userID].session_id
          }
        },
        {
          headers: vfHeaders
        }
      );

      traces = vfResponse.data;
    }

    // ---- EXTRACT TEXT REPLIES FROM VOICEFLOW ----
    const replies = traces
      .filter((t) => t.type === "text")
      .map((t) => t.payload?.message)
      .filter(Boolean);

    if (replies.length === 0) {
      const fallbackReply = getSafetyFallbackMessage(userText);

      console.log(
        `[VOICEFLOW] No text reply for user=${userID} session_id=${sessions[userID].session_id} action=no_text_reply -> sending middleware fallback`
      );

      await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: fallbackReply }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      updateSession(
        userID,
        exitCommand ? { state: "idle", active_request: null } : { state: "active" }
      );

      console.log(
        `[OUTBOUND FALLBACK] user=${userID} session_id=${sessions[userID].session_id} reply="${fallbackReply}"`
      );

      return;
    }

    updateSession(
      userID,
      exitCommand ? { state: "idle", active_request: null } : { state: "active" }
    );

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
