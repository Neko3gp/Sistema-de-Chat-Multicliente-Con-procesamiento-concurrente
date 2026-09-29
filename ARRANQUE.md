# Arranque del proyecto

Comandos desde la **raíz del repositorio**  
(`Sistema-de-Chat-Multicliente-Con-procesamiento-concurrente`).

Usa **dos terminales**: una para el backend y otra para el frontend.

---

## Backend (puerto 5001)

```bash
cd backend
python3 main.py --host 0.0.0.0 --port 5001
```

Si trabajas con el venv del proyecto:

```bash
source .venv/bin/activate
cd backend
python main.py --host 0.0.0.0 --port 5001
```

---

## Frontend (Vite, puerto 5173)

En **otra** terminal:

```bash
cd frontend/miapp
npm install
npm run dev -- --host 0.0.0.0
```

(`npm install` solo hace falta la primera vez o si cambian dependencias.)

Abre la URL que muestre Vite (local o Network).

---

## Notas

| Servicio  | Puerto | URL típica              |
|-----------|--------|-------------------------|
| Backend   | 5001   | WebSocket `ws://IP:5001` |
| Frontend  | 5173   | `http://IP:5173`         |

- El front apunta al WebSocket en el puerto **5001** por defecto.
- Para celular en la misma red: usa la IP LAN de la Mac, no `localhost`.
- Para detener: `Ctrl+C` en cada terminal.

### Usuarios de prueba (si ya corriste el seed)

- Usuario: `user01` / `test1234`
- Admin: `admin` / (clave de `CHAT_ADMIN_PASSWORD` o `admin123`)
