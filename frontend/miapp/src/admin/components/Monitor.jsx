import { useEffect, useState } from "react";
import { FiActivity, FiArrowUpRight, FiArrowDownLeft, FiCheck, FiCheckCircle, FiCpu, FiEdit2, FiEye, FiFile, FiImage, FiInbox, FiLogOut, FiMaximize2, FiMusic, FiPause, FiPlay, FiPlus, FiSearch, FiShield, FiTrash2, FiUsers } from "react-icons/fi";
import BrandMark from "../../common/components/BrandMark";
import {
  EVENT_LIMIT,
  TRACE_LIMIT,
  chatTraceFilters,
  describeChatTrace,
  describeEvent,
  describeLog,
  eventFilters,
  formatBytes,
  formatNumber,
  formatTime,
} from "../lib/monitorState";
import "../styles/Monitor.css";

function EventBadge({ event }) {
  const view = describeEvent(event);
  const Icon = ({
    image: FiImage, audio: FiMusic, document: FiFile,
    message: FiArrowDownLeft, message_sent: FiArrowUpRight,
    processed: FiCheckCircle, connect: FiUsers, request: FiShield,
    chat_queued: FiInbox, chat_delivered: FiCheck, chat_read: FiEye,
  })[view.category] || FiActivity;
  return <span data-category={view.category} className={`monitor-event-label ${["error", "login_failed"].includes(view.category) ? "is-error" : ""}`}><Icon aria-hidden="true" />{view.label}</span>;
}

function EventDetail({ event }) {
  const view = describeEvent(event);
  return <div className="monitor-event-detail"><p>{view.summary}</p>{view.route ? <span>{view.route}</span> : null}{event.detail?.filename ? <strong>{event.detail.filename}</strong> : null}<small className="monitor-thread">Hilo: {event.thread}</small><details><summary>Metadatos técnicos</summary><code>{JSON.stringify(event.detail || {})}</code></details></div>;
}

function ChatTraceDetail({ event }) {
  const view = describeChatTrace(event);
  return (
    <div className="monitor-event-detail">
      <p>{view.summary}</p>
      {view.route ? <span>{view.route}</span> : null}
      {view.reader ? <span>Lector: {view.reader}</span> : null}
      {view.messageId ? <strong>id: {view.messageId}</strong> : null}
      <small className="monitor-thread">Hilo: {event.thread}</small>
      <details><summary>Metadatos técnicos</summary><code>{JSON.stringify(event.detail || {})}</code></details>
    </div>
  );
}

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

function AdminUsersPanel({ users, onCreate, onUpdate, onDelete }) {
  const emptyForm = { username: "", newUsername: "", password: "", role: "user", avatarUrl: "", description: "" };
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  function submit(event) {
    event.preventDefault();
    if (editing) {
      onUpdate(form);
    } else {
      onCreate({ username: form.username, password: form.password, role: form.role });
    }
    setForm(emptyForm);
    setEditing(false);
  }

  function edit(user) {
    setEditing(true);
    setForm({ ...emptyForm, ...user, newUsername: user.username, password: "" });
  }

  return (
    <section className="monitor-admin-grid" aria-label="Administración de usuarios">
      <form className="monitor-panel monitor-admin-form" onSubmit={submit}>
        <div className="monitor-panel-heading"><div><h2>{editing ? "Editar usuario" : "Nuevo usuario"}</h2><p>{editing ? "Actualiza rol, perfil o contraseña." : "Crea una cuenta para el chat o el panel."}</p></div><FiUsers aria-hidden="true" /></div>
        <div className="monitor-form-fields">
          <label>Nombre de usuario<input value={editing ? form.newUsername : form.username} onChange={(event) => setForm({ ...form, ...(editing ? { newUsername: event.target.value } : { username: event.target.value }) })} required /></label>
          <label>Contraseña<input type="password" value={form.password} placeholder={editing ? "Sin cambios" : "Obligatoria"} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} /></label>
          <label>Rol<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="user">Usuario</option><option value="admin">Administrador</option></select></label>
          {editing ? <><label>Avatar URL<input value={form.avatarUrl || ""} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} /></label><label>Descripción<textarea value={form.description || ""} maxLength={140} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></> : null}
        </div>
        <div className="monitor-form-actions"><button type="submit"><FiPlus aria-hidden="true" />{editing ? "Guardar cambios" : "Crear usuario"}</button>{editing ? <button type="button" onClick={() => { setEditing(false); setForm(emptyForm); }}>Cancelar</button> : null}</div>
      </form>
      <section className="monitor-panel monitor-admin-list">
        <div className="monitor-panel-heading"><div><h2>Cuentas registradas</h2><p>{users.length} cuentas en SQLite</p></div><FiShield aria-hidden="true" /></div>
        <div className="monitor-admin-table-scroll"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{users.map((user) => <tr key={user.username}><td><strong>{user.username}</strong><small>{user.description || "Sin descripción"}</small></td><td>{user.role === "admin" ? "Administrador" : "Usuario"}</td><td><span className={user.online ? "monitor-online" : "monitor-offline"}>{user.online ? "En línea" : "Desconectado"}</span></td><td className="monitor-action-cell"><button type="button" title={`Editar ${user.username}`} aria-label={`Editar ${user.username}`} onClick={() => edit(user)}><FiEdit2 /></button><button type="button" title={`Eliminar ${user.username}`} aria-label={`Eliminar ${user.username}`} onClick={() => window.confirm(`¿Eliminar la cuenta ${user.username}?`) && onDelete(user.username)}><FiTrash2 /></button></td></tr>)}</tbody></table></div>
      </section>
    </section>
  );
}

function AdminGroupsPanel({ users, groups, onCreate, onUpdate, onDelete }) {
  const emptyForm = { groupId: "", name: "", members: [] };
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const chatUsers = users.filter((user) => user.role === "user");

  function submit(event) {
    event.preventDefault();
    if (editing) onUpdate(form);
    else onCreate({ name: form.name, members: form.members });
    setForm(emptyForm);
    setEditing(false);
  }

  function toggleMember(username) {
    const members = form.members.includes(username)
      ? form.members.filter((member) => member !== username)
      : [...form.members, username];
    setForm({ ...form, members });
  }

  function edit(group) {
    setEditing(true);
    setForm({ groupId: group.id, name: group.name, members: group.members || [] });
  }

  return (
    <section className="monitor-admin-grid" aria-label="Administración de grupos">
      <form className="monitor-panel monitor-admin-form" onSubmit={submit}>
        <div className="monitor-panel-heading"><div><h2>{editing ? "Editar grupo" : "Nuevo grupo"}</h2><p>Administra los integrantes del grupo.</p></div><FiUsers aria-hidden="true" /></div>
        <div className="monitor-form-fields"><label>Nombre del grupo<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><fieldset><legend>Integrantes</legend>{chatUsers.length ? chatUsers.map((user) => <label className="monitor-check" key={user.username}><input type="checkbox" checked={form.members.includes(user.username)} onChange={() => toggleMember(user.username)} />{user.username}</label>) : <small>No hay usuarios normales registrados.</small>}</fieldset></div>
        <div className="monitor-form-actions"><button type="submit"><FiPlus aria-hidden="true" />{editing ? "Guardar cambios" : "Crear grupo"}</button>{editing ? <button type="button" onClick={() => { setEditing(false); setForm(emptyForm); }}>Cancelar</button> : null}</div>
      </form>
      <section className="monitor-panel monitor-admin-list"><div className="monitor-panel-heading"><div><h2>Grupos registrados</h2><p>{groups.length} grupos persistidos</p></div><FiUsers aria-hidden="true" /></div><div className="monitor-group-list">{groups.map((group) => <article className="monitor-group-row" key={group.id}><div><strong>{group.name}</strong><small>{group.members.length} integrantes · propietario: {group.owner}</small></div><div className="monitor-action-cell"><button type="button" title={`Editar ${group.name}`} aria-label={`Editar ${group.name}`} onClick={() => edit(group)}><FiEdit2 /></button><button type="button" title={`Eliminar ${group.name}`} aria-label={`Eliminar ${group.name}`} onClick={() => window.confirm(`¿Eliminar el grupo ${group.name}?`) && onDelete(group.id)}><FiTrash2 /></button></div></article>)}{groups.length === 0 ? <div className="monitor-empty"><FiUsers /><p>Aún no hay grupos persistidos.</p></div> : null}</div></section>
    </section>
  );
}

function ChatTracesPanel({ traces, ready }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [paused, setPaused] = useState(null);
  const search = query.trim().toLocaleLowerCase();
  const source = paused ?? traces;
  const filtered = source.filter((event) => {
    const detail = event.detail || {};
    if (stage !== "all" && detail.stage !== stage) return false;
    const view = describeChatTrace(event);
    return `${view.label} ${view.summary} ${event.user || ""} ${view.route} ${view.messageId || ""} ${JSON.stringify(detail)}`
      .toLocaleLowerCase()
      .includes(search);
  }).slice().reverse();

  return (
    <section className="monitor-panel monitor-events" aria-labelledby="traces-title">
      <div className="monitor-panel-heading">
        <div>
          <h2 id="traces-title">Trazas de chat</h2>
          <p>Ciclo de entrega y lectura, separado del monitor de infraestructura</p>
        </div>
        <button type="button" aria-pressed={paused !== null} onClick={() => setPaused(paused === null ? [...traces] : null)}>
          {paused === null ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}
          {paused === null ? "Pausar lista" : "Reanudar lista"}
        </button>
      </div>
      <div className="monitor-toolbar">
        <div className="monitor-filters">
          <label className="monitor-search">
            <FiSearch aria-hidden="true" />
            <span className="monitor-sr-only">Buscar en trazas</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario, ruta o id…" />
          </label>
          <label>
            <span className="monitor-sr-only">Etapa</span>
            <select value={stage} onChange={(event) => setStage(event.target.value)}>
              {Object.entries(chatTraceFilters).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="monitor-pause-note">
        Sin recepción = destinatario offline (queda en historial). Entregado = escrito al socket en vivo. Entregado al reconectar = lo recuperó por historial al iniciar sesión. Lectura = abrió el chat y envió acuse. No incluye typing ni ping.
      </p>
      {paused !== null ? <p className="monitor-pause-note" role="status">Lista pausada. Al reanudar se muestran las trazas recientes disponibles.</p> : null}
      <div className="monitor-table-scroll" tabIndex={0} role="region" aria-label="Trazas de chat">
        <table>
          <thead>
            <tr>
              <th scope="col">Hora local</th>
              <th scope="col">Estado</th>
              <th scope="col">Emisor</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((event) => (
              <tr key={event.id}>
                <td><time dateTime={event.ts}>{formatTime(event.ts)}</time></td>
                <td><EventBadge event={event} /></td>
                <td>{event.user || "Sin autenticar"}</td>
                <td><ChatTraceDetail event={event} /></td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="monitor-table-empty">
                  {!ready
                    ? "Esperando datos del monitor…"
                    : search || stage !== "all"
                      ? "No hay resultados para estos filtros."
                      : "Todavía no hay trazas. Envía un mensaje privado o abre un chat para generarlas."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="monitor-log-footer">
        <span>{filtered.length} trazas visibles</span>
        <span>Máximo {TRACE_LIMIT} entradas · más recientes primero</span>
      </div>
    </section>
  );
}

function ActivityLogPanel({
  events,
  liveEvents,
  log,
  tab,
  setTab,
  query,
  setQuery,
  eventType,
  setEventType,
  pausedEvents,
  setPausedEvents,
  expanded = false,
  onExpand,
}) {
  const search = query.trim().toLocaleLowerCase();
  const filteredEvents = events.filter((event) =>
    (eventType === "all" || describeEvent(event).category === eventType) &&
    `${describeEvent(event).label} ${event.user || ""} ${event.thread || ""} ${JSON.stringify(event.detail || {})}`.toLocaleLowerCase().includes(search),
  ).slice().reverse();
  const filteredLog = log.filter((entry) =>
    `${entry.level} ${entry.thread} ${entry.msg}`.toLocaleLowerCase().includes(search),
  ).slice().reverse();

  return (
    <section
      className={`monitor-panel monitor-events${expanded ? " is-expanded" : ""}`}
      aria-labelledby={expanded ? "events-full-title" : "events-title"}
    >
      <div className="monitor-panel-heading">
        <div>
          <h2 id={expanded ? "events-full-title" : "events-title"}>
            {expanded ? "Registro de actividad completo" : "Registro de actividad"}
          </h2>
          <p>
            {expanded
              ? "Todos los eventos visibles a altura completa, con los mismos filtros del monitor"
              : "Metadatos del servidor, sin textos de conversaciones ni contraseñas"}
          </p>
        </div>
        <div className="monitor-panel-actions">
          {tab === "events" ? (
            <button
              type="button"
              aria-pressed={pausedEvents !== null}
              onClick={() => setPausedEvents(pausedEvents === null ? [...liveEvents] : null)}
            >
              {pausedEvents === null ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}
              {pausedEvents === null ? "Pausar lista" : "Reanudar lista"}
            </button>
          ) : null}
          {!expanded && onExpand ? (
            <button type="button" onClick={onExpand}>
              <FiMaximize2 aria-hidden="true" />
              Ver completo
            </button>
          ) : null}
        </div>
      </div>
      <div className="monitor-toolbar">
        <div className="monitor-tabs" role="group" aria-label="Fuente del registro">
          <button type="button" aria-pressed={tab === "events"} onClick={() => setTab("events")}>Eventos en vivo</button>
          <button type="button" aria-pressed={tab === "log"} onClick={() => setTab("log")}>Historial al conectar</button>
        </div>
        <div className="monitor-filters">
          <label className="monitor-search">
            <FiSearch aria-hidden="true" />
            <span className="monitor-sr-only">Buscar en el registro</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario o detalle…" />
          </label>
          {tab === "events" ? (
            <label>
              <span className="monitor-sr-only">Tipo de evento</span>
              <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                <option value="all">Todos los eventos</option>
                {Object.entries(eventFilters).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      <p className="monitor-pause-note">
        {tab === "log"
          ? "Copia de las últimas 200 entradas que el servidor conservaba al abrir esta sesión del monitor. No es una lista de tareas de arranque ni se actualiza en vivo."
          : "Recibido = cliente → servidor. Enviado = servidor → socket del destinatario. Cada destinatario genera un envío; no implica que haya leído el mensaje. Las lecturas viven en «Trazas de chat»."}
      </p>
      {pausedEvents !== null && tab === "events" ? (
        <p className="monitor-pause-note" role="status">
          Lista pausada para lectura. Las métricas siguen actualizándose; al reanudar se muestran los eventos recientes disponibles.
        </p>
      ) : null}
      <div
        className={`monitor-table-scroll${expanded ? " is-expanded" : ""}`}
        tabIndex={0}
        role="region"
        aria-label={expanded ? "Registro completo del servidor" : "Registro del servidor"}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Hora local</th>
              <th scope="col">{tab === "events" ? "Evento" : "Nivel"}</th>
              <th scope="col">{tab === "events" ? "Usuario" : "Hilo"}</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {tab === "events"
              ? filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td><time dateTime={event.ts}>{formatTime(event.ts)}</time></td>
                  <td><EventBadge event={event} /></td>
                  <td>{event.user || "Sin autenticar"}</td>
                  <td><EventDetail event={event} /></td>
                </tr>
              ))
              : filteredLog.map((entry, index) => (
                <tr key={index}>
                  <td><time dateTime={entry.ts}>{formatTime(entry.ts)}</time></td>
                  <td>{entry.level}</td>
                  <td>{entry.thread}</td>
                  <td>
                    {describeLog(entry) ? (
                      <><EventBadge event={describeLog(entry)} /><EventDetail event={describeLog(entry)} /></>
                    ) : entry.msg}
                  </td>
                </tr>
              ))}
            {(tab === "events" ? filteredEvents : filteredLog).length === 0 ? (
              <tr>
                <td colSpan={4} className="monitor-table-empty">
                  {search || (eventType !== "all" && tab === "events")
                    ? "No hay resultados para estos filtros."
                    : "Todavía no hay entradas para mostrar."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="monitor-log-footer">
        <span>
          {tab === "events"
            ? `${filteredEvents.length} eventos visibles`
            : `${filteredLog.length} entradas anteriores a esta conexión`}
        </span>
        <span>Máximo {EVENT_LIMIT} entradas · más recientes primero</span>
      </div>
    </section>
  );
}

export default function Monitor({ username, monitor, reconnecting, error, onLogout, adminUsers, adminGroups, onCreateUser, onUpdateUser, onDeleteUser, onCreateGroup, onUpdateGroup, onDeleteGroup }) {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [tab, setTab] = useState("events");
  const [section, setSection] = useState("monitor");
  const [pausedEvents, setPausedEvents] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const { stats, ready, users, log, samples, lastUpdated, chatTraces = [] } = monitor;
  const stale = lastUpdated !== null && now - lastUpdated > 8000;
  const status = reconnecting ? "Reconectando" : !ready ? "Esperando datos" : stale ? "Sin datos recientes" : "En vivo";
  const healthy = ready && !reconnecting && !stale;
  const events = pausedEvents ?? monitor.events;
  const metrics = [
    { label: "Usuarios conectados", value: formatNumber(stats?.connected), note: "Sesiones de chat", icon: <FiUsers /> },
    { label: "Mensajes recibidos", value: formatNumber(stats?.msgs_total), note: "Desde el arranque del servidor", icon: <FiArrowUpRight /> },
    { label: "Mensajes por segundo", value: formatNumber(stats?.msgs_per_sec, 2), note: "Último intervalo de muestreo", icon: <FiActivity /> },
    { label: "Hilos activos", value: formatNumber(stats?.threads), note: "Incluye el monitor y sus conexiones", icon: <FiCpu /> },
  ];

  const activityLogProps = {
    events,
    liveEvents: monitor.events,
    log,
    tab,
    setTab,
    query,
    setQuery,
    eventType,
    setEventType,
    pausedEvents,
    setPausedEvents,
  };

  return (
    <div className="monitor-shell">
      <header className="monitor-topbar">
        <a href="#monitor-main" className="monitor-brand">
          <BrandMark
            className="monitor-brand-mark"
            label={
              <>
                Chat paralelo
                <small>Administración del servidor</small>
              </>
            }
          />
        </a>
        <div className="monitor-top-actions">
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

        <nav className="monitor-section-tabs" aria-label="Secciones administrativas">
          <button type="button" aria-pressed={section === "monitor"} onClick={() => setSection("monitor")}><FiActivity /> Centro de monitoreo</button>
          <button type="button" aria-pressed={section === "activity"} onClick={() => setSection("activity")}><FiMaximize2 /> Registro completo</button>
          <button type="button" aria-pressed={section === "traces"} onClick={() => setSection("traces")}><FiEye /> Trazas de chat</button>
          <button type="button" aria-pressed={section === "users"} onClick={() => setSection("users")}><FiUsers /> Usuarios</button>
          <button type="button" aria-pressed={section === "groups"} onClick={() => setSection("groups")}><FiShield /> Grupos de chat</button>
        </nav>

        {section === "users" ? <AdminUsersPanel users={adminUsers} onCreate={onCreateUser} onUpdate={onUpdateUser} onDelete={onDeleteUser} /> : null}
        {section === "groups" ? <AdminGroupsPanel users={adminUsers} groups={adminGroups} onCreate={onCreateGroup} onUpdate={onUpdateGroup} onDelete={onDeleteGroup} /> : null}
        {section === "traces" ? <ChatTracesPanel traces={chatTraces} ready={ready} /> : null}
        {section === "activity" ? <ActivityLogPanel {...activityLogProps} expanded /> : null}

        {section === "monitor" ? <>

        <section className="monitor-metrics" aria-label="Métricas principales">
          {metrics.map(({ label, value, note, icon }) => <article className="monitor-metric" key={label}><div><span>{label}</span><span className="monitor-metric-icon" aria-hidden="true">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>)}
        </section>

        <div className="monitor-overview">
          <section className="monitor-panel monitor-activity" aria-labelledby="activity-title">
            <div className="monitor-panel-heading"><div><h2 id="activity-title">Actividad del servidor</h2><p>Hasta 60 muestras de mensajes por segundo</p></div><FiActivity aria-hidden="true" /></div>
            <ActivityChart samples={samples} />
            <dl className="monitor-resources">
              <div><dt>CPU del proceso</dt><dd>{formatNumber(stats?.cpu_percent, 1)}<small> %</small></dd></div>
              <div><dt>{stats?.process_memory_kind === "peak_rss" ? "Memoria máxima del proceso" : "Memoria del proceso (RSS)"}</dt><dd>{formatNumber(stats?.mem_mb, 1)}<small> MiB</small></dd></div>
              <div><dt>En cola</dt><dd>{formatNumber(stats?.queue_size)}</dd></div>
              <div><dt>Tráfico recibido</dt><dd>{formatBytes(stats?.bytes_total)}</dd></div>
            </dl>
            <div className="monitor-host-resources">
              <div className="monitor-host-heading"><div><h3>Recursos del equipo</h3><p>Recursos del equipo que ejecuta el backend, no del navegador.</p></div><FiCpu aria-hidden="true" /></div>
              <div className="monitor-host-grid">
                <div><span>CPU lógicas</span><strong>{formatNumber(stats?.cpu_count)}</strong></div>
                <div><span>CPU del sistema</span><strong>{formatNumber(stats?.system_cpu_percent, 1)}<small> %</small></strong></div>
                <div><span>Memoria total</span><strong>{formatNumber(stats?.memory_total_mb, 0)}<small> MiB</small></strong></div>
                <div><span>Memoria disponible</span><strong>{formatNumber(stats?.memory_available_mb, 0)}<small> MiB</small></strong></div>
                <div><span>Memoria utilizada</span><strong>{formatNumber(stats?.memory_used_mb, 0)}<small> MiB</small></strong></div>
                <div><span>Uso del proceso</span><strong>{formatNumber(stats?.process_memory_percent, 2)}<small> % RAM</small></strong></div>
              </div>
              <p className="monitor-footnote">{stats?.resource_source === "psutil" ? "Medición multiplataforma con psutil. CPU del proceso: 100% equivale a una CPU lógica." : "Medición limitada: instala scripts/requirements.txt y reinicia el backend para obtener los recursos del sistema. — significa dato no disponible."}</p>
            </div>
          </section>

          <section className="monitor-panel monitor-users" aria-labelledby="users-title">
            <div className="monitor-panel-heading"><div><h2 id="users-title">Usuarios conectados</h2><p>Lista actualizada cada 2 segundos</p></div><span className="monitor-count">{ready ? users.length : "—"}</span></div>
            {users.length ? <ul>{users.map((name) => <li key={name}><span className="monitor-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><span>{name}</span><span className={`monitor-user-state ${healthy ? "" : "is-stale"}`}>{healthy ? "En línea" : "Última muestra"}</span></li>)}</ul> : <div className="monitor-empty"><FiUsers aria-hidden="true" /><p>{ready ? "No hay usuarios de chat conectados" : "Esperando la lista de usuarios…"}</p></div>}
            <p className="monitor-footnote">Las sesiones de administradores no se incluyen en esta lista.</p>
          </section>
        </div>

        <ActivityLogPanel
          {...activityLogProps}
          onExpand={() => setSection("activity")}
        />
        </> : null}
        <footer className="monitor-footer"><span>Actualización de métricas cada 2 s · Los totales se reinician con el servidor.</span><span>{section === "monitor" ? "Monitor de solo lectura" : section === "activity" ? "Registro de actividad completo" : section === "traces" ? "Trazas de entrega y lectura" : "Cambios administrativos protegidos por rol"}</span></footer>
      </main>
    </div>
  );
}
