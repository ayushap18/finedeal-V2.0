import { corsJson, handleOptions } from "@/lib/api-helpers";
import { registerUser } from "@/lib/users";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getBotToken(): string {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (t.startsWith("TELEGRAM_BOT_TOKEN=")) return t.substring("TELEGRAM_BOT_TOKEN=".length);
    }
  }
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

let lastUpdateId = 0;

async function sendMsg(chatId: number | string, text: string) {
  const token = getBotToken();
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function GET() {
  const token = getBotToken();
  if (!token) return corsJson({ error: "No bot token" });

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&limit=20&timeout=1`);
    const data = await res.json();
    const processed: string[] = [];

    if (data.ok && data.result?.length > 0) {
      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg?.text || !msg?.chat?.id) continue;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const firstName = msg.chat.first_name || "there";
        const username = msg.chat.username || "";

        // Auto-register user
        registerUser({ telegram_chat_id: String(chatId), telegram_username: username });

        if (text === "/start") {
          await sendMsg(chatId,
            `👋 <b>Welcome to FineDeal, ${firstName}!</b>\n\n` +
            `I help you find the best prices across 9 Indian e-commerce sites.\n\n` +
            `📋 <b>Your Chat ID:</b> <code>${chatId}</code>\n\n` +
            `<b>Commands:</b>\n` +
            `/search <product> - Search prices\n` +
            `/id - Your Chat ID\n` +
            `/status - Bot status\n` +
            `/help - All commands`
          );
          processed.push(`Welcome ${firstName}`);
        } else if (text === "/id") {
          await sendMsg(chatId, `📋 Chat ID: <code>${chatId}</code>`);
          processed.push(`ID to ${firstName}`);
        } else if (text === "/status") {
          await sendMsg(chatId, `✅ <b>FineDeal Bot Active</b>\n\nChat ID: <code>${chatId}</code>\nSites: 9\nAlerts: Ready`);
          processed.push(`Status to ${firstName}`);
        } else if (text === "/help") {
          await sendMsg(chatId,
            `📖 <b>FineDeal Bot</b>\n\n` +
            `/search <product> - Search prices across 9 sites\n` +
            `/id - Your Chat ID\n` +
            `/status - Bot status\n` +
            `/help - This message\n\n` +
            `Just type any product name and I'll search for prices!\n\n` +
            `Chat ID: <code>${chatId}</code>`
          );
          processed.push(`Help to ${firstName}`);
        } else if (text.startsWith("/search ")) {
          const query = text.substring(8).trim();
          await sendMsg(chatId, `🔍 Searching "<b>${query}</b>" across 9 sites...`);
          try {
            const r = await fetch("http://localhost:3000/api/scraper", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, platforms: ["amazon","flipkart","croma","myntra","ajio","snapdeal","tatacliq","nykaa","vijaysales"] }),
            });
            const d = await r.json();
            const prices = (d.results||[]).filter((x:{price:number|null})=>x.price).sort((a:{price:number},b:{price:number})=>a.price-b.price);
            const fails = (d.results||[]).filter((x:{price:number|null})=>!x.price);
            let msg = `📊 <b>Results: "${query}"</b>\n⏱ ${((d.duration_ms||0)/1000).toFixed(1)}s\n\n`;
            if (prices.length) {
              msg += prices.map((r:{platform:string;price:number},i:number)=>`${i===0?"🏆":"💰"} <b>${r.platform}</b>: ₹${r.price.toLocaleString("en-IN")}${i===0?" ← BEST":""}`).join("\n");
            }
            if (fails.length) msg += "\n\n" + fails.map((r:{platform:string})=>`❌ ${r.platform}`).join("\n");
            msg += `\n\n${prices.length}/${(d.results||[]).length} sites found`;
            await sendMsg(chatId, msg);
          } catch { await sendMsg(chatId, "❌ Search failed"); }
          processed.push(`Search "${query}" for ${firstName}`);
        } else {
          // Handle greetings
          const greetings = ["hi", "hello", "hey", "hlo", "hii", "namaste", "yo", "sup"];
          const isGreeting = greetings.some(g => text.toLowerCase().startsWith(g));

          if (isGreeting) {
            await sendMsg(chatId,
              `Hey ${firstName}! 👋\n\n` +
              `I'm your FineDeal price comparison bot!\n\n` +
              `🔍 Just type any product name and I'll find the best prices across 9 sites.\n\n` +
              `Examples:\n` +
              `• iPhone 16 Pro Max\n` +
              `• Samsung Galaxy S24 Ultra\n` +
              `• Nike Air Max 270\n` +
              `• MacBook Air M3\n` +
              `• Sony WH-1000XM5\n\n` +
              `Or use /search <product> for a detailed search!`
            );
            processed.push(`Greeted ${firstName}`);
          } else {
            // Treat as product search
            const searchQuery = text;
            await sendMsg(chatId, `🔍 Searching "${searchQuery}" across 9 sites...`);
            try {
              const r = await fetch("http://localhost:3000/api/scraper", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: searchQuery, platforms: ["amazon","flipkart","snapdeal","tatacliq","nykaa"] }),
              });
              const d = await r.json();
              const prices = (d.results||[]).filter((x:{price:number|null})=>x.price && x.price > 0).sort((a:{price:number},b:{price:number})=>a.price-b.price);
              let msg = `📊 Results for "${searchQuery}"\n⏱ ${((d.duration_ms||0)/1000).toFixed(1)}s\n\n`;
              if (prices.length > 0) {
                msg += prices.map((r:{platform:string;price:number},i:number)=>`${i===0?"🏆":"💰"} ${r.platform}: ₹${r.price.toLocaleString("en-IN")}${i===0?" ← BEST":""}`).join("\n");
                msg += `\n\n✅ ${prices.length} sites found prices`;
              } else {
                msg += "❌ No prices found for this product.\nTry a more specific name like:\n• iPhone 16 Pro Max 256GB\n• Samsung Galaxy S24 Ultra";
              }
              await sendMsg(chatId, msg);
            } catch { await sendMsg(chatId, "❌ Search failed. Try again in a moment."); }
            processed.push(`Searched "${searchQuery}" for ${firstName}`);
          }
        }
      }
    }

    // Acknowledge processed updates
    if (lastUpdateId > 0) {
      await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&limit=0`).catch(() => {});
    }

    return corsJson({ ok: true, processed, lastUpdateId });
  } catch (e) {
    return corsJson({ error: e instanceof Error ? e.message : "Poll failed" });
  }
}

export async function OPTIONS() {
  return handleOptions();
}
