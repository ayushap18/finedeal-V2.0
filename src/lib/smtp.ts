import * as net from "net";
import * as tls from "tls";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let _envCache: Record<string, string> | null = null;
function getEnvLocal(key: string): string {
  if (!_envCache) {
    _envCache = {};
    const envPath = join(process.cwd(), ".env.local");
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("#")) {
          const eq = t.indexOf("=");
          if (eq > 0) _envCache[t.substring(0, eq)] = t.substring(eq + 1);
        }
      }
    }
  }
  return _envCache[key] || process.env[key] || "";
}

interface SmtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Read a line (ending with \r\n) from the socket.
 * Resolves with the full response (may be multiline for EHLO).
 */
function readResponse(
  sock: net.Socket | tls.TLSSocket,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP read timeout"));
    }, timeout);

    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      // SMTP multiline responses have "XXX-" prefix; final line has "XXX "
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].length >= 4 && lines[i][3] === " ") {
          cleanup();
          resolve(buf);
          return;
        }
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      if (buf) resolve(buf);
      else reject(new Error("Connection closed"));
    };

    function cleanup() {
      clearTimeout(timer);
      sock.removeListener("data", onData);
      sock.removeListener("error", onError);
      sock.removeListener("close", onClose);
    }

    sock.on("data", onData);
    sock.on("error", onError);
    sock.on("close", onClose);
  });
}

function sendCommand(
  sock: net.Socket | tls.TLSSocket,
  cmd: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    sock.write(cmd + "\r\n", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function expectCode(response: string, code: number): void {
  const first = response.split("\r\n")[0] || response;
  if (!first.startsWith(String(code))) {
    throw new Error(`Expected ${code}, got: ${first.trim()}`);
  }
}

function upgradeTls(
  sock: net.Socket,
  host: string,
  timeout: number
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("TLS upgrade timeout"));
    }, timeout);

    const tlsSock = tls.connect(
      { socket: sock, host, servername: host },
      () => {
        clearTimeout(timer);
        resolve(tlsSock);
      }
    );
    tlsSock.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Send an email via SMTP.
 * Supports both:
 *   - Port 465 (implicit TLS/SSL) - direct TLS connection
 *   - Port 587 (STARTTLS) - plain connect then upgrade to TLS
 */
export async function sendSmtpEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<SmtpResult> {
  const host = getEnvLocal("SMTP_HOST") || "server.dnspark.in";
  const port = parseInt(getEnvLocal("SMTP_PORT") || "465", 10);
  const user = getEnvLocal("SMTP_USER");
  const pass = getEnvLocal("SMTP_PASS");
  const useImplicitTls = getEnvLocal("SMTP_SECURE") === "true" || port === 465;

  if (!user || !pass) {
    return { success: false, error: "SMTP credentials not configured" };
  }

  const TIMEOUT = 15_000;
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@codecatalysts.tech>`;

  let plainSock: net.Socket | null = null;
  let tlsSock: tls.TLSSocket | null = null;

  try {
    let activeSock: net.Socket | tls.TLSSocket;

    if (useImplicitTls) {
      // Port 465: Direct TLS connection (no STARTTLS needed)
      tlsSock = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP TLS connect timeout")), TIMEOUT);
        const s = tls.connect({ host, port, rejectUnauthorized: false }, () => {
          clearTimeout(timer);
          resolve(s);
        });
        s.on("error", (err) => { clearTimeout(timer); reject(err); });
      });
      activeSock = tlsSock;
    } else {
      // Port 587: Plain connection + STARTTLS upgrade
      plainSock = await new Promise<net.Socket>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP connect timeout")), TIMEOUT);
        const s = net.createConnection({ host, port }, () => { clearTimeout(timer); resolve(s); });
        s.on("error", (err) => { clearTimeout(timer); reject(err); });
      });
      activeSock = plainSock;
    }

    // Read 220 greeting
    const greeting = await readResponse(activeSock, TIMEOUT);
    expectCode(greeting, 220);

    // EHLO
    await sendCommand(activeSock, "EHLO finedeal.app");
    const ehlo1 = await readResponse(activeSock, TIMEOUT);
    expectCode(ehlo1, 250);

    // STARTTLS (only for port 587)
    if (!useImplicitTls && plainSock) {
      await sendCommand(plainSock, "STARTTLS");
      const starttlsResp = await readResponse(plainSock, TIMEOUT);
      expectCode(starttlsResp, 220);
      tlsSock = await upgradeTls(plainSock, host, TIMEOUT);
      activeSock = tlsSock;

      // Re-EHLO over TLS
      await sendCommand(activeSock, "EHLO finedeal.app");
      const ehlo2 = await readResponse(activeSock, TIMEOUT);
      expectCode(ehlo2, 250);
    }

    // AUTH LOGIN
    await sendCommand(activeSock, "AUTH LOGIN");
    const authResp = await readResponse(activeSock, TIMEOUT);
    expectCode(authResp, 334);

    await sendCommand(activeSock, Buffer.from(user).toString("base64"));
    const userResp = await readResponse(activeSock, TIMEOUT);
    expectCode(userResp, 334);

    await sendCommand(activeSock, Buffer.from(pass).toString("base64"));
    const passResp = await readResponse(activeSock, TIMEOUT);
    expectCode(passResp, 235);

    // MAIL FROM
    await sendCommand(activeSock, `MAIL FROM:<${user}>`);
    const fromResp = await readResponse(activeSock, TIMEOUT);
    expectCode(fromResp, 250);

    // RCPT TO
    await sendCommand(activeSock, `RCPT TO:<${to}>`);
    const rcptResp = await readResponse(activeSock, TIMEOUT);
    expectCode(rcptResp, 250);

    // DATA
    await sendCommand(activeSock, "DATA");
    const dataResp = await readResponse(activeSock, TIMEOUT);
    expectCode(dataResp, 354);

    // Email content
    const date = new Date().toUTCString();
    const emailContent = [
      `From: FineDeal <${user}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      `Date: ${date}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
      `.`,
    ].join("\r\n");

    await sendCommand(activeSock, emailContent);
    const endResp = await readResponse(activeSock, TIMEOUT);
    expectCode(endResp, 250);

    // QUIT
    await sendCommand(activeSock, "QUIT").catch(() => {});

    return { success: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  } finally {
    if (tlsSock) {
      tlsSock.destroy();
    } else if (plainSock) {
      plainSock.destroy();
    }
  }
}
