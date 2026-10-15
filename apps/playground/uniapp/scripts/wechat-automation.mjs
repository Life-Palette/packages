import { setTimeout as delay } from "node:timers/promises";

export async function connectWechat(endpoint = process.env.WECHAT_AUTOMATION_ENDPOINT || "ws://127.0.0.1:9420") {
async function connect() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      return await new Promise((resolve, reject) => {
        const connection = new WebSocket(endpoint);
        connection.addEventListener("open", () => resolve(connection), {
          once: true,
        });
        connection.addEventListener("error", reject, { once: true });
      });
    } catch {
      await delay(1000);
    }
  }
  throw new Error(
    `Cannot connect to ${endpoint}. Start IDE with: cli auto --project dist/build/mp-weixin --auto-port 9420`
  );
}
const socket = await connect();
const pending = new Map();
let sequence = 0;
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  const request = pending.get(message.id);
  if (!request) {
    return;
  }
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) {
    request.reject(new Error(JSON.stringify(message.error)));
  } else {
    request.resolve(message.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`IDE automation timed out: ${method}`));
    }, 45_000);
    pending.set(id, { reject, resolve, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

return { call, close() { socket.close(); for (const { timer } of pending.values()) clearTimeout(timer); } };
}
