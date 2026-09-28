import assert from "node:assert/strict";
import { test } from "node:test";
import { describeEvent, describeLog, initialMonitorState, monitorReducer } from "./monitor.js";

test("control requests are not labeled as chat messages", () => {
  const login = describeEvent({ event: "message", detail: { message_type: "login" } });
  assert.equal(login.category, "request");
  assert.equal(login.label, "Inicio de sesión");
  assert.equal(describeEvent({ event: "connect", detail: { phase: "tcp" } }).label, "Conexión TCP");
});

test("file filters preserve categories in both transport directions", () => {
  for (const category of ["image", "audio", "document"]) {
    for (const direction of ["received", "sent"]) {
      const view = describeEvent({ event: direction === "sent" ? "file" : "message",
        detail: { message_type: "file", file_kind: category, direction, scope: "private", to: "user02" } });
      assert.equal(view.category, category);
      assert.match(view.label, direction === "sent" ? /enviado/ : /recibido/);
      assert.equal(view.route, "Privado → user02");
    }
  }
  assert.equal(describeEvent({ event: "file", detail: { filename: "old.M4A" } }).category, "audio");
});

test("socket delivery is distinguished from reception and processing", () => {
  assert.equal(describeEvent({ event: "message", detail: { message_type: "private_message" } }).label, "Mensaje recibido");
  assert.match(describeEvent({ event: "message_sent" }).summary, /no confirma lectura/);
  assert.equal(describeEvent({ event: "processed", detail: { message_type: "file" } }).category, "processed");
});

test("historical logs can be described without changing the frozen snapshot", () => {
  const entry = { msg: 'connect usuario="user01" detalle={"phase":"login"}', thread: "client-user01" };
  assert.equal(describeEvent(describeLog(entry)).label, "Sesión iniciada");
  assert.equal(describeLog({ msg: "Servidor escuchando en 0.0.0.0:5001" }), null);
  assert.equal(describeLog({ msg: "message usuario=invalid detalle={}" }), null);
  let state = monitorReducer(initialMonitorState, { type: "monitor_snapshot", log: [entry], stats: {}, receivedAt: 1 });
  state = monitorReducer(state, { type: "monitor_event", event: "message_sent" });
  assert.deepEqual(state.log, [entry]);
  assert.equal(state.events.length, 1);
});
