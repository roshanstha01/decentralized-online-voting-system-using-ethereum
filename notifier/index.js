require("dotenv").config();
const Web3 = require("web3");
const nodemailer = require("nodemailer");

// ✅ Use ABI from your React contracts folder (your project does NOT have /build/contracts)
const ElectionABI = require("../client/src/contracts/Election.json").abi;

// ---------- ENV VALIDATION ----------
const required = [
  "RPC_WS",
  "CONTRACT_ADDRESS",
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_SECURE",
  "EMAIL_USER",
  "EMAIL_PASS",
];

for (const k of required) {
  if (!process.env[k] || String(process.env[k]).trim() === "") {
    console.error(`Missing ${k} in notifier/.env`);
    process.exit(1);
  }
}

console.log("RPC_WS =", process.env.RPC_WS);
console.log("CONTRACT_ADDRESS =", process.env.CONTRACT_ADDRESS);

// ---------- WEB3 WS PROVIDER (with auto-reconnect) ----------
const wsProvider = new Web3.providers.WebsocketProvider(process.env.RPC_WS, {
  reconnect: {
    auto: true,
    delay: 2000,
    maxAttempts: 999999,
    onTimeout: true,
  },
});

wsProvider.on("connect", () => console.log("✅ WS connected"));
wsProvider.on("error", (e) => console.log("❌ WS error:", e.message || e));
wsProvider.on("end", (e) => console.log("⚠️ WS closed:", e?.message || e));

const web3 = new Web3(wsProvider);
const election = new web3.eth.Contract(ElectionABI, process.env.CONTRACT_ADDRESS);

// ---------- EMAIL TRANSPORT ----------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: String(process.env.EMAIL_SECURE).toLowerCase() === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function fromAddress() {
  const fromName = process.env.FROM_NAME || "DigiVote";
  return `"${fromName}" <${process.env.EMAIL_USER}>`;
}

// ---------- HELPERS ----------
async function getAllVoters() {
  const count = Number(await election.methods.voterCount().call());
  const voters = [];

  for (let i = 0; i < count; i++) {
    const addr = await election.methods.voters(i).call();
    const v = await election.methods.voterDetails(addr).call();

    if (v.isRegistered && v.email && String(v.email).includes("@")) {
      voters.push({
        address: addr,
        name: v.name || "Voter",
        email: v.email,
        verified: v.isVerified,
        hasVoted: v.hasVoted,
      });
    }
  }
  return voters;
}

async function sendToAll(subject, textBuilder) {
  const voters = await getAllVoters();
  console.log(`📨 Sending "${subject}" to ${voters.length} voters...`);

  for (const v of voters) {
    try {
      await transporter.sendMail({
        from: fromAddress(),
        to: v.email,
        subject,
        text: textBuilder(v),
      });
      console.log("✅ Sent:", v.email);
    } catch (e) {
      console.log("❌ Failed:", v.email, e.message || e);
    }
  }

  console.log("✅ Done sending emails.");
}

// ---------- MAIN ----------
async function main() {
  console.log("Notifier running...");

  await transporter.verify();
  console.log("✅ SMTP ready.");

  // ✅ INITIAL PRINT (safe)
  try {
    const voters0 = await getAllVoters();
    console.log("👥 Voters found:", voters0.length);
    console.log("📧 Emails:", voters0.map((v) => v.email));
  } catch (e) {
    console.error("❌ Could not read voters. ABI/address mismatch likely.");
    console.error("Details:", e.message || e);
    console.error(
      "Fix: update CONTRACT_ADDRESS in notifier/.env to match client/src/contracts/Election.json (same networkId)."
    );
    process.exit(1);
  }

  // ✅ AUTO-REFRESH every 20 seconds
  setInterval(async () => {
    try {
      const votersNow = await getAllVoters();
      console.log(
        `🔄 AutoRefresh -> voters=${votersNow.length} (${new Date().toLocaleTimeString()})`
      );
    } catch (e) {
      console.log("Refresh error:", e.message || e);
    }
  }, 20000);

  // Listen ElectionStarted
  election.events
    .ElectionStarted({})
    .on("connected", (subId) =>
      console.log("📡 Listening ElectionStarted:", subId)
    )
    .on("data", async (evt) => {
      console.log("📢 Event: ElectionStarted", evt?.transactionHash || "");
      await sendToAll("Election Started", (v) => {
        return `Hello ${v.name},

Election has STARTED. Please open DigiVote and cast your vote.

Thanks,
DigiVote`;
      });
    })
    .on("error", (e) => console.log("Start listener error:", e.message || e));

  // Listen ElectionEnded
  election.events
    .ElectionEnded({})
    .on("connected", (subId) =>
      console.log("📡 Listening ElectionEnded:", subId)
    )
    .on("data", async (evt) => {
      console.log("📢 Event: ElectionEnded", evt?.transactionHash || "");
      await sendToAll("Election Ended (Result Published)", (v) => {
        return `Hello ${v.name},

Election has ENDED. Results are published in DigiVote.

Thanks,
DigiVote`;
      });
    })
    .on("error", (e) => console.log("End listener error:", e.message || e));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});