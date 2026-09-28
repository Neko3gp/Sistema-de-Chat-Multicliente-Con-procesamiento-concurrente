"""Verificación única T5: un admin, dos usuarios y monitoreo aislado del chat."""
import base64
import json
import time

from test_concurrency import Client
from test_logging import login, temporary_server


STATS_FIELDS = {"connected", "threads", "queue_size", "msgs_total", "msgs_per_sec",
                "bytes_total", "cpu_percent", "mem_mb"}


def collect_until(admin, predicate, captured):
    """Recoge monitor_event/stats hasta cumplir una condición con tiempo límite."""
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        message = admin.receive()
        assert message["type"] in {"monitor_event", "monitor_stats"}, message
        captured.append(message)
        if message["type"] == "monitor_stats":
            assert STATS_FIELDS <= message.keys()
            assert all(isinstance(message[key], (int, float)) for key in STATS_FIELDS)
            assert all(message[key] >= 0 for key in STATS_FIELDS)
        else:
            assert {"event", "ts", "thread", "user", "detail"} <= message.keys()
        if predicate(message):
            return message
    raise AssertionError("El monitor no recibió el evento esperado")


def snapshot(admin):
    """Exige snapshot inmediatamente después del resultado del login admin."""
    state = admin.receive()
    assert state["type"] == "monitor_snapshot", state
    assert STATS_FIELDS <= state["stats"].keys()
    assert len(state["log"]) <= 200
    assert all(set(entry) == {"ts", "thread", "level", "msg"} for entry in state["log"])
    return state


def main():
    """Comprueba eventos, permisos, estadísticas, buffer circular y desconexión."""
    with temporary_server() as (port, log_path, console):
        clients, captured = [], []
        try:
            admin = Client(port)
            clients.append(admin)
            assert login(admin, "admin", "admin-test")["role"] == "admin"
            initial = snapshot(admin)
            assert initial["users"] == [] and initial["stats"]["connected"] == 0
            for user in ("user01", "user02"):
                client = Client(port)
                clients.append(client)
                client.send({"type": "monitor_subscribe"})
                assert client.until("error")["reason"] == "forbidden"
                assert login(client, user)["role"] == "user"
            _, a, b = clients
            for client in (a, b):
                while set(client.until("user_list")["users"]) != {"user01", "user02"}:
                    pass
                client.send({"type": "monitor_subscribe"})
                assert client.until("error")["reason"] == "forbidden"

            a.send({"type": "private_message", "to": "user02", "message": "privado-secreto-T5"})
            assert b.until("private_message")["message"] == "privado-secreto-T5"
            b.send({"type": "broadcast", "message": "broadcast-secreto-T5"})
            assert a.until("broadcast")["from"] == "user02"
            a.send({"type": "file", "to": "user02", "filename": "T5.bin",
                    "data": base64.b64encode(b"archivo-secreto-T5").decode()})
            assert b.until("file")["filename"] == "T5.bin"
            a.send({"type": "login", "username": "user01", "password": "clave-secreta-T5"})
            assert a.until("login_result")["reason"] == "invalid_credentials"
            admin.send({"type": "broadcast", "message": "admin-no-es-chat"})
            # El admin puede recibir eventos anteriores antes de su error directo.
            while True:
                response = admin.receive()
                if response["type"] == "error":
                    assert response["reason"] == "forbidden"
                    break
                assert response["type"] in {"monitor_event", "monitor_stats"}, response
                captured.append(response)
            for number in range(205):
                a.send({"type": "private_message", "to": "user01", "message": str(number)})
                assert a.until("private_message")["message"] == str(number)
            stats = collect_until(admin, lambda item: item["type"] == "monitor_stats"
                                  and item["msgs_total"] == 208, captured)
            assert stats["connected"] == 2 and stats["threads"] >= 10
            assert stats["bytes_total"] > 0 and stats["msgs_per_sec"] > 0
            events = [item for item in captured if item["type"] == "monitor_event"]
            for user in ("user01", "user02"):
                assert any(item["event"] == "connect" and item["user"] == user
                           and item["detail"].get("phase") == "login" for item in events)
            assert {"message", "broadcast", "file", "error", "login_failed"} <= {
                item["event"] for item in events}

            # Tras cerrar el admin, su username debe liberarse y el nuevo snapshot
            # debe conservar solo las últimas 200 entradas, sin modificar el chat.
            admin.close()
            deadline = time.monotonic() + 3
            while 'disconnect usuario="admin"' not in log_path.read_text():
                assert time.monotonic() < deadline
                time.sleep(0.02)
            # El evento de desconexión se registra después de liberar la sesión.
            admin = Client(port)
            clients.append(admin)
            assert login(admin, "admin", "admin-test")["role"] == "admin"
            state = snapshot(admin)
            assert len(state["log"]) == 200 and set(state["users"]) == {"user01", "user02"}
            assert state["stats"]["msgs_total"] == 208
            b.close()
            while a.until("user_list")["users"] != ["user01"]:
                pass
            a.close()
            final = collect_until(admin, lambda item: item["type"] == "monitor_stats"
                                  and item["connected"] == 0 and item["threads"] <= 6, captured)
            for user in ("user01", "user02"):
                assert any(item.get("event") == "disconnect" and item.get("user") == user
                           for item in captured)
            assert final["msgs_total"] == 208 and final["queue_size"] == 0
            serialized = json.dumps([initial, state, captured])
            for secret in ("privado-secreto-T5", "broadcast-secreto-T5", "archivo-secreto-T5",
                           "clave-secreta-T5", "admin-test", "admin-no-es-chat"):
                assert secret not in serialized
            console.seek(0)
            assert "Traceback" not in console.read()
        finally:
            for client in clients:
                client.close()
    print("PASO T5: snapshot (buffer 200), eventos en vivo y estadísticas; 208 mensajes contados")
    print("PASO T5: admin fuera del chat; forbidden para usuarios; metadatos sin contenidos")
    print("PASO T5: desconexiones registradas; 0 usuarios y 6 hilos al quedar solo el admin")
    print("Servidor, base y logs temporales eliminados")


if __name__ == "__main__":
    main()
