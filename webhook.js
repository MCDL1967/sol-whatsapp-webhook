const express = require("express");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "sol_verify_123";

app.get("/webhook", (req, res) => {
  console.log("GET /webhook hit");
  console.log("Query:", req.query);

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("hub.mode:", mode);
  console.log("hub.verify_token:", token);
  console.log("hub.challenge:", challenge);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  console.log("POST /webhook hit");
  console.log(JSON.stringify(req.body, null, 2));
  return res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
