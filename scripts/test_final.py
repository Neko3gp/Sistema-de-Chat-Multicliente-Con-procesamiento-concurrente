"""T10: carga de 20 usuarios/30 s, admin observador y archivo de 5 MiB.

El criterio local de latencia se fija antes de ejecutar: p95 durante <=
max(2 * p95 fuera, p95 fuera + 20 ms). No equivale a una garantía para otras LAN.
"""
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys
import threading
import time

from test_concurrency import Client
from test_logging import ROOT, login, temporary_server


def main():
    """Recoge evidencia, comprueba criterios y cierra todos los recursos."""
    observations, monitor_errors, failures = [], [], []
    stop = threading.Event()
    with temporary_server(users=20, server_timeout=75) as (port, log_path, console):
        admin = Client(port)
        login(admin, "admin", "admin-test")
        initial = admin.receive()
        assert initial["type"] == "monitor_snapshot" and initial["users"] == []

        def observe():
            """Consume el monitor durante toda la carga sin frenar los clientes."""
            try:
                while not stop.is_set():
                    message = admin.receive()
                    if message.get("type") not in {"monitor_event", "monitor_stats"}:
                        monitor_errors.append(f"Mensaje inesperado: {message.get('type')}")
                    observations.append(message)
            except (OSError, AssertionError) as error:
                if not stop.is_set():
                    monitor_errors.append(str(error))
            except Exception as error:
                monitor_errors.append(f"{type(error).__name__}: {error}")

        reader = threading.Thread(target=observe, name="test-admin", daemon=True)
        reader.start()
        try:
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/load_test.py"), "--port", str(port),
                 "--users", "20", "--duration", "30", "--rate", "2", "--file-mb", "5"],
                capture_output=True, text=True, timeout=55,
            )
            if result.returncode:
                failures.append(f"load_test terminó con código {result.returncode}")
            report = json.loads(result.stdout)
            failures.extend(report["errors"])
            deadline = time.monotonic() + 6
            while time.monotonic() < deadline:
                stats = [item for item in observations if item["type"] == "monitor_stats"]
                if stats and stats[-1]["connected"] == 0 and stats[-1]["msgs_total"] == report["sent"]:
                    break
                time.sleep(.05)
        finally:
            stop.set()
            admin.close()
            reader.join(timeout=2)
        # El nuevo snapshot consulta el mismo registro que produce user_list.
        deadline = time.monotonic() + 3
        while 'disconnect usuario="admin"' not in log_path.read_text():
            assert time.monotonic() < deadline
            time.sleep(.02)
        inspector = Client(port)
        try:
            login(inspector, "admin", "admin-test")
            final_snapshot = inspector.receive()
        finally:
            inspector.close()
        console.seek(0)
        console_text = console.read()
    stats = [item for item in observations if item["type"] == "monitor_stats"]
    events = [item for item in observations if item["type"] == "monitor_event"]
    final_stats = stats[-1] if stats else {}
    during = report["other_users_during_file"]
    outside = report["other_users_outside_file"]
    threshold = max(outside["p95_ms"] * 2, outside["p95_ms"] + 20) if outside["samples"] else None
    latency_ok = bool(during["samples"] and threshold is not None and during["p95_ms"] <= threshold)
    incoming = [item for item in events if item["event"] == "message"
                and item["detail"].get("message_type") in {"broadcast", "private_message", "file"}]
    connected_users = {item["user"] for item in events if item["event"] == "connect"
                       and item["detail"].get("phase") == "login" and item["user"] != "admin"}
    disconnected_users = {item["user"] for item in events if item["event"] == "disconnect"
                          and item["user"] != "admin"}
    checks = {
        "conteos de entregas": report["sent"] == 2401 and report["received"] == report["expected_deliveries"] == 6721,
        "archivo íntegro": report["file"]["integrity"] is True and report["file"]["bytes"] == 5 * 1024 * 1024,
        "latencia de otros usuarios": latency_ok,
        "user_list vacío": final_snapshot.get("type") == "monitor_snapshot" and final_snapshot.get("users") == [],
        "estadísticas finales": final_stats.get("connected") == 0 and final_stats.get("threads") == 6
                                  and final_stats.get("queue_size") == 0 and final_stats.get("msgs_total") == 2401,
        "eventos de login/desconexión": len(connected_users) == len(disconnected_users) == 20,
        "contadores del monitor": len(incoming) == report["sent"]
                                  and sum(item["detail"]["bytes"] for item in incoming) == final_stats.get("bytes_total"),
        "estadísticas en vivo": len(stats) >= 10 and max((item["connected"] for item in stats), default=0) == 20
                                and max((item["threads"] for item in stats), default=0) == 46,
        "archivo registrado": any(item["event"] == "file" and item["detail"].get("bytes") == 5 * 1024 * 1024 for item in events),
        "sin excepciones": "Traceback" not in console_text and not monitor_errors,
    }
    failures.extend(name for name, ok in checks.items() if not ok)
    failures.extend(monitor_errors)
    result_name = "PASÓ" if not failures else "FALLÓ"
    artifact = {"load": report, "checks": checks, "failures": failures,
                "monitor": {"samples": len(stats), "events": dict(Counter(item["event"] for item in events)),
                            "max_threads": max((item["threads"] for item in stats), default=0),
                            "final_stats": final_stats, "users_final": final_snapshot.get("users")},
                "latency_threshold_ms": threshold}
    (ROOT / "docs/RESULTADOS_FINALES.json").write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n")
    rows = [
        ("Resultado", result_name), ("Usuarios / admin / duración / tasa", "20 / 1 / 30 s / 2 mensajes + 2 sondas por usuario y segundo"),
        ("Máscara del cliente websockets", report.get("client_mask_implementation", "no registrada")),
        ("Mensajes enviados / entregas recibidas", f"{report['sent']} / {report['received']}"),
        ("Entregas esperadas", report["expected_deliveries"]), ("Errores de carga", len(report["errors"])),
        ("Archivo", f"{report['file']['bytes']} bytes; íntegro: {report['file']['integrity']}"),
        ("Duración transferencia", f"{report['file']['duration_ms']:.3f} ms"),
        ("RTT global p50 / p95 / máximo", f"{report['rtt']['p50_ms']} / {report['rtt']['p95_ms']} / {report['rtt']['max_ms']:.3f} ms"),
        ("RTT p95 otros usuarios: durante / fuera", f"{during['p95_ms']} / {outside['p95_ms']} ms"),
        ("Muestras otros usuarios: durante / fuera", f"{during['samples']} / {outside['samples']}"),
        ("Umbral p95 durante", f"{threshold:.3f} ms" if threshold else "Sin muestras"),
        ("Hilos con 20 usuarios + admin / solo admin", f"{artifact['monitor']['max_threads']} / {final_stats.get('threads')}"),
        ("Usuarios de chat al finalizar", final_snapshot.get("users")),
        ("Muestras de estadísticas / eventos de mensaje", f"{len(stats)} / {len(incoming)}"),
    ]
    text = ["# Prueba final T10", "", f"Resultado: **{result_name}**. Entorno: localhost, servidor y clientes en esta computadora.", "",
            "Comando de carga (puerto temporal asignado por el verificador):", "",
            "```bash", "python scripts/load_test.py --users 20 --duration 30 --rate 2 --file-mb 5", "```", "",
            "| Medida | Resultado |", "|---|---|"]
    text += [f"| {name} | {value} |" for name, value in rows]
    text += ["", "## Criterios y alcance", "",
             "El umbral se fijó antes de ejecutar: p95 durante <= max(2 × p95 fuera, p95 fuera + 20 ms). "
             "Es un criterio operativo local; no constituye una garantía de latencia para cualquier red. "
             "La comparación excluye al emisor y destinatario del archivo y clasifica sondas cuyo intervalo "
             "se superpone con la transferencia real. Percentiles con pocas muestras requieren cautela.", "",
             "Se comprobó integridad SHA-256, JSON, orden, destinatarios, duplicados y pérdidas. "
             "Los broadcasts explican la diferencia entre enviados y entregas. El admin recibió snapshot, "
             "eventos y estadísticas, sin recibir chat. La lista vacía se verificó mediante un nuevo "
             "snapshot: usa el mismo registro que genera user_list, pues el admin no recibe user_list.", "",
             "Los hilos esperados son 2 × (20 + 1) + 4 = 46, y 6 al quedar solo admin. "
             "Los contadores de mensajes/bytes del monitor se contrastaron con sus eventos de entrada. "
             "Todos los procesos, conexiones, datos y logs temporales se cerraron al terminar.", "",
             "Datos detallados: [RESULTADOS_FINALES.json](RESULTADOS_FINALES.json). "
             "Reproducir la verificación completa: `python scripts/test_final.py`.", ""]
    if failures:
        text += ["Criterios pendientes: " + "; ".join(failures), ""]
    if during["samples"] < 10:
        text += [f"**Límite de evidencia:** solo {during['samples']} sondas coincidieron con el archivo; "
                 "ese p95 no permite una conclusión estadística sólida ni garantiza el resultado "
                 "en otra LAN, aunque pueda cumplir el criterio operativo local.", ""]
    previous_paths = sorted((ROOT / "docs").glob("RESULTADOS_FINALES_INTENTO*.json"))
    if previous_paths:
        text += ["## Correcciones y trazabilidad", "",
                 "Cada intento anterior tuvo una implementación distinta; no se seleccionó la mejor "
                 "de varias corridas equivalentes. Se conserva el mismo umbral de aceptación.", ""]
        for previous_path in previous_paths:
            previous = json.loads(previous_path.read_text())
            text += [f"- [{previous_path.name}]({previous_path.name}): p95 durante "
                     f"{previous['load']['other_users_during_file']['p95_ms']} ms y fuera "
                     f"{previous['load']['other_users_outside_file']['p95_ms']} ms; "
                     f"pendientes: {', '.join(previous['failures'])}."]
        text += ["", "Tras el primer intento se sustituyó el XOR byte a byte por tablas translate "
                 "en bloques de 64 KiB, y la acumulación TCP por bytearray. Tras el segundo se movió "
                 "la validación base64 al lector del emisor en bloques, y el escritor serializa "
                 "únicamente metadatos JSON antes de insertar el base64 ya validado. Así el worker "
                 "compartido solo resuelve destinos. Además, el cliente prepara el JSON del archivo "
                 "antes de medir y atiende sus dos participantes en otro bucle/hilo: el enmascarado "
                 "del generador no detiene el bucle de las sondas ajenas. El servidor mantiene "
                 "WebSocket manual, sockets, threading, locks y colas. Los límites de archivo se "
                 "volvieron a verificar después de mover la validación. Tras el tercer intento "
                 "se añadieron cesiones explícitas del hilo entre bloques grandes y se compiló "
                 "la extensión C opcional del mismo websockets 15.0.1 para los clientes. "
                 "Este último cambio también modifica el entorno de medición; por eso la mejora "
                 "no se atribuye exclusivamente al servidor. La dependencia del servidor no cambió.", ""]
    (ROOT / "docs/RESULTADOS_FINALES.md").write_text("\n".join(text))
    print(f"T10 {result_name}: enviados={report['sent']}, entregas={report['received']}, errores={len(report['errors'])}")
    print(f"p95 otros: durante={during['p95_ms']} ms ({during['samples']} muestras), fuera={outside['p95_ms']} ms; umbral={threshold}")
    print(f"Hilos: {artifact['monitor']['max_threads']} -> {final_stats.get('threads')}; archivo íntegro={report['file']['integrity']}")
    if failures:
        print("Pendiente: " + "; ".join(failures))
    raise SystemExit(bool(failures))


if __name__ == "__main__":
    main()
