import { useEffect, useState } from "react";
import { FiActivity, FiArrowUpRight, FiCpu, FiLogOut, FiPause, FiPlay, FiSearch, FiServer, FiUsers } from "react-icons/fi";
import { EVENT_LIMIT, eventLabels, formatBytes, formatNumber, formatTime } from "../utils/monitor";
import "./Monitor.css";

function ActivityChart({ samples }) {
  if (samples.length < 2) {
    return <div className="monitor-chart-empty">Esperando la siguiente muestra de actividad…</div>;
  }
  const values = samples.map((sample) => Math.max(0, sample.msgs_per_sec || 0));
  const peak = Math.max(1, ...values);
  const points = values.map((value, index) => `${12 + index * 576 / (values.length - 1)},${134 - value / peak * 112}`);
  return (
    <figure className="monitor-chart">
      <svg viewBox="0 0 600 154" role="img" aria-label={`Actividad reciente. Máximo ${formatNumber(Math.max(...values), 2)} mensajes por segundo.`}>
        {[22, 78, 134].map((y) => <line key={y} x1="12" x2="588" y1={y} y2={y} className="monitor-chart-grid" />)}
        <polygon points={`12,134 ${points.join(" ")} 588,134`} className="monitor-chart-area" />
        <polyline points={points.join(" ")} className="monitor-chart-line" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(",");
          return <circle key={index} cx={cx} cy={cy} r="3" className="monitor-chart-dot"><title>{formatTime(samples[index].at)} · {formatNumber(values[index], 2)} msg/s</title></circle>;
        })}
      </svg>
      <figcaption><span>{formatTime(samples[0].at)}</span><span>Escala: 0–{formatNumber(peak, 2)} msg/s</span><span>{formatTime(samples.at(-1).at)}</span></figcaption>
    </figure>
  );
}

export default function Monitor({ username, monitor, reconnecting, error, onLogout, themePreference, onThemeChange }) {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [tab, setTab] = useState("events");
  const [pausedEvents, setPausedEvents] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const { stats, ready, users, log, samples, lastUpdated } = monitor;
  const stale = lastUpdated !== null && now - lastUpdated > 8000;
  const status = reconnecting ? "Reconectando" : !ready ? "Esperando datos" : stale ? "Sin datos recientes" : "En vivo";
  const healthy = ready && !reconnecting && !stale;
  const events = pausedEvents ?? monitor.events;
  const search = query.trim().toLocaleLowerCase();
  const filteredEvents = events.filter((event) =>
    (eventType === "all" || event.event === eventType) &&
    `${eventLabels[event.event] || event.event} ${event.user || ""} ${event.thread || ""} ${JSON.stringify(event.detail || {})}`.toLocaleLowerCase().includes(search),
  ).slice().reverse();
  const filteredLog = log.filter((entry) => `${entry.level} ${entry.thread} ${entry.msg}`.toLocaleLowerCase().includes(search)).slice().reverse();
  const metrics = [
    { label: "Usuarios conectados", value: formatNumber(stats?.connected), note: "Sesiones de chat", icon: <FiUsers /> },
    { label: "Mensajes recibidos", value: formatNumber(stats?.msgs_total), note: "Desde el arranque del servidor", icon: <FiArrowUpRight /> },
    { label: "Mensajes por segundo", value: formatNumber(stats?.msgs_per_sec, 2), note: "Último intervalo de muestreo", icon: <FiActivity /> },
    { label: "Hilos activos", value: formatNumber(stats?.threads), note: "Incluye el monitor y sus conexiones", icon: <FiCpu /> },
  ];

  return (
    <div className="monitor-shell">
      <header className="monitor-topbar">
        <a href="#monitor-main" className="monitor-brand"><span className="monitor-brand-icon"><FiServer /></span><span>Chat paralelo<small>Administración del servidor</small></span></a>
        <div className="monitor-top-actions">
          <label className="monitor-theme"><span className="monitor-sr-only">Tema del panel</span><select value={themePreference} onChange={(event) => onThemeChange(event.target.value)}><option value="system">Sistema</option><option value="dark">Oscuro</option><option value="light">Claro</option><option value="uach-dark">UACH oscuro</option><option value="uach-light">UACH claro</option></select></label>
          <span className="monitor-account">{username}<small>Administrador</small></span>
          <button type="button" onClick={onLogout}><FiLogOut aria-hidden="true" /><span>Cerrar sesión</span></button>
        </div>
      </header>

      <main id="monitor-main" className="monitor-main">
        <div className="monitor-heading">
          <div><p className="monitor-eyebrow">CENTRO DE MONITOREO</p><h1>Estado del servidor</h1><p>Conexiones, rendimiento y actividad en un solo lugar.</p></div>
          <div className="monitor-status-block"><span className={`monitor-status ${healthy ? "is-live" : "is-waiting"}`} role="status"><i />{status}</span><small>Última muestra: {formatTime(lastUpdated)}</small></div>
        </div>

        {reconnecting || stale ? <div className="monitor-notice" role="status">{reconnecting ? "Se perdió la conexión. Intentando recuperar la sesión automáticamente…" : "No han llegado estadísticas en los últimos 8 segundos."} Los valores visibles corresponden a la última muestra recibida.</div> : null}
        {error && !reconnecting ? <div className="monitor-notice monitor-error" role="alert">{error}</div> : null}

        <section className="monitor-metrics" aria-label="Métricas principales">
          {metrics.map(({ label, value, note, icon }) => <article className="monitor-metric" key={label}><div><span>{label}</span><span className="monitor-metric-icon" aria-hidden="true">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>)}
        </section>

        <div className="monitor-overview">
          <section className="monitor-panel monitor-activity" aria-labelledby="activity-title">
            <div className="monitor-panel-heading"><div><h2 id="activity-title">Actividad del servidor</h2><p>Hasta 60 muestras de mensajes por segundo</p></div><FiActivity aria-hidden="true" /></div>
            <ActivityChart samples={samples} />
            <dl className="monitor-resources">
              <div><dt>CPU del proceso</dt><dd>{formatNumber(stats?.cpu_percent, 1)}<small> %</small></dd></div>
              <div><dt>Memoria reportada</dt><dd>{formatNumber(stats?.mem_mb, 1)}<small> MiB</small></dd></div>
              <div><dt>En cola</dt><dd>{formatNumber(stats?.queue_size)}</dd></div>
              <div><dt>Tráfico recibido</dt><dd>{formatBytes(stats?.bytes_total)}</dd></div>
            </dl>
          </section>

          <section className="monitor-panel monitor-users" aria-labelledby="users-title">
            <div className="monitor-panel-heading"><div><h2 id="users-title">Usuarios conectados</h2><p>Lista actualizada cada 2 segundos</p></div><span className="monitor-count">{ready ? users.length : "—"}</span></div>
            {users.length ? <ul>{users.map((name) => <li key={name}><span className="monitor-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><span>{name}</span><span className={`monitor-user-state ${healthy ? "" : "is-stale"}`}>{healthy ? "En línea" : "Última muestra"}</span></li>)}</ul> : <div className="monitor-empty"><FiUsers aria-hidden="true" /><p>{ready ? "No hay usuarios de chat conectados" : "Esperando la lista de usuarios…"}</p></div>}
            <p className="monitor-footnote">Las sesiones de administradores no se incluyen en esta lista.</p>
          </section>
        </div>

        <section className="monitor-panel monitor-events" aria-labelledby="events-title">
          <div className="monitor-panel-heading"><div><h2 id="events-title">Registro de actividad</h2><p>Metadatos del servidor, sin textos de conversaciones ni contraseñas</p></div>{tab === "events" ? <button type="button" aria-pressed={pausedEvents !== null} onClick={() => setPausedEvents(pausedEvents === null ? [...monitor.events] : null)}>{pausedEvents === null ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}{pausedEvents === null ? "Pausar lista" : "Reanudar lista"}</button> : null}</div>
          <div className="monitor-toolbar">
            <div className="monitor-tabs" role="group" aria-label="Fuente del registro"><button type="button" aria-pressed={tab === "events"} onClick={() => setTab("events")}>Eventos en vivo</button><button type="button" aria-pressed={tab === "log"} onClick={() => setTab("log")}>Registro inicial</button></div>
            <div className="monitor-filters"><label className="monitor-search"><FiSearch aria-hidden="true" /><span className="monitor-sr-only">Buscar en el registro</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario o detalle…" /></label>{tab === "events" ? <label><span className="monitor-sr-only">Tipo de evento</span><select value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="all">Todos los eventos</option>{Object.entries(eventLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label> : null}</div>
          </div>
          {pausedEvents !== null && tab === "events" ? <p className="monitor-pause-note" role="status">Lista pausada para lectura. Las métricas siguen actualizándose; al reanudar se muestran los eventos recientes disponibles.</p> : null}
          <div className="monitor-table-scroll" tabIndex={0} role="region" aria-label="Registro del servidor">
            <table><thead><tr><th scope="col">Hora local</th><th scope="col">{tab === "events" ? "Evento" : "Nivel"}</th><th scope="col">{tab === "events" ? "Usuario" : "Hilo"}</th><th scope="col">Detalle</th></tr></thead><tbody>
              {tab === "events" ? filteredEvents.map((event) => <tr key={event.id}><td><time dateTime={event.ts}>{formatTime(event.ts)}</time></td><td><span className={`monitor-event-label ${["error", "login_failed"].includes(event.event) ? "is-error" : ""}`}>{eventLabels[event.event] || event.event}</span></td><td>{event.user || "Sin autenticar"}</td><td><code>{JSON.stringify(event.detail || {})}</code><small className="monitor-thread">{event.thread}</small></td></tr>) : filteredLog.map((entry, index) => <tr key={index}><td><time dateTime={entry.ts}>{formatTime(entry.ts)}</time></td><td>{entry.level}</td><td>{entry.thread}</td><td><code>{entry.msg}</code></td></tr>)}
              {(tab === "events" ? filteredEvents : filteredLog).length === 0 ? <tr><td colSpan={4} className="monitor-table-empty">{search || eventType !== "all" && tab === "events" ? "No hay resultados para estos filtros." : "Todavía no hay entradas para mostrar."}</td></tr> : null}
            </tbody></table>
          </div>
          <div className="monitor-log-footer"><span>{tab === "events" ? `${filteredEvents.length} eventos visibles` : `${filteredLog.length} entradas del estado inicial`}</span><span>Máximo {EVENT_LIMIT} entradas · más recientes primero</span></div>
        </section>
        <footer className="monitor-footer"><span>Actualización de métricas cada 2 s · Los totales se reinician con el servidor.</span><span>Monitor de solo lectura</span></footer>
      </main>
    </div>
  );
}
