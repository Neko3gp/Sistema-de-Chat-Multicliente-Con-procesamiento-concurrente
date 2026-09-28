"""Verificación T7: carga de cinco usuarios durante cinco segundos a tasa dos."""
import json
import subprocess
import sys

from test_logging import ROOT, temporary_server


def main():
    """Aísla los datos y comprueba conteos completos sin errores de carga."""
    with temporary_server(users=5) as (port, log_path, console):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/load_test.py"),
                                 "--port", str(port), "--users", "5", "--duration", "5", "--rate", "2"],
                                capture_output=True, text=True, timeout=20)
        assert result.returncode == 0, result.stdout + result.stderr
        report = json.loads(result.stdout)
        assert report["sent"] == 100 and report["received"] == report["expected_deliveries"] == 130
        assert report["rtt"]["samples"] == 50 and not report["errors"]
        print(f"PASO T7: 100 enviados, 130 entregas, 50 RTT, p95={report['rtt']['p95_ms']} ms; 0 errores")


if __name__ == "__main__":
    main()
