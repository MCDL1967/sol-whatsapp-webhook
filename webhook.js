const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "sol_verify_123";
const VF_API_KEY = process.env.VF_API_KEY;
const VF_PROJECT_ID = process.env.VF_PROJECT_ID;
const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;

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

    const userID = message.from;         // sender's phone number
    const userText = message.text.body;  // what they typed

    console.log(`Inbound from ${userID}: ${userText}`);

    // ---- CALL VOICEFLOW ----
    const vfResponse = await axios.post(
      `https://general-runtime.voiceflow.com/state/user/${userID}/interact`,
      {
        action: { type: "text", payload: userText }
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
      .filter(t => t.type === "text")
      .map(t => t.payload?.message)
      .filter(Boolean);

    if (replies.length === 0) {
      console.log("No text reply from Voiceflow");
      return;
    }

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
      console.log(`Sent to ${userID}: ${reply}`);
    }

  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
