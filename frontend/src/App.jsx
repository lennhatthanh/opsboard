import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";
const severityLabel = { SEV1: "Critical", SEV2: "High", SEV3: "Medium", SEV4: "Low" };
const statusLabel = { OPEN: "Open", INVESTIGATING: "Investigating", MONITORING: "Monitoring", RESOLVED: "Resolved" };
const emptyForm = { title: "", description: "", severity: "SEV3", status: "OPEN", serviceId: "", assignee: "" };

async function api(path, options) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function StatCard({ label, value, tone, detail }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-top"><span>{label}</span><i /></div>
      <strong>{value ?? "—"}</strong><small>{detail}</small>
    </article>
  );
}

function IncidentForm({ incident, services, onClose, onSaved }) {
  const [form, setForm] = useState(incident ? {
    title: incident.title, description: incident.description || "", severity: incident.severity,
    status: incident.status, serviceId: String(incident.serviceId), assignee: incident.assignee || "",
  } : { ...emptyForm, serviceId: String(services[0]?.id || "") });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api(incident ? `/api/incidents/${incident.id}` : "/api/incidents", {
        method: incident ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, serviceId: Number(form.serviceId) }),
      });
      onSaved();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="incident-form" onSubmit={submit}>
        <div className="form-heading"><div><span className="eyebrow">Incident command</span><h2>{incident ? "Update incident" : "Declare incident"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close">×</button></div>
        {error && <div className="form-error">{error}</div>}
        <label className="field">Title<input name="title" value={form.title} onChange={update} minLength="3" required placeholder="What is happening?" /></label>
        <div className="form-grid">
          <label className="field">Severity<select name="severity" value={form.severity} onChange={update}>{Object.keys(severityLabel).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Status<select name="status" value={form.status} onChange={update}>{Object.keys(statusLabel).map((item) => <option value={item} key={item}>{statusLabel[item]}</option>)}</select></label>
          <label className="field">Service<select name="serviceId" value={form.serviceId} onChange={update} required><option value="" disabled>Select service</option>{services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></label>
          <label className="field">Assignee<input name="assignee" value={form.assignee} onChange={update} placeholder="On-call engineer" /></label>
        </div>
        <label className="field">Description<textarea name="description" value={form.description} onChange={update} rows="5" placeholder="Impact, signals, and current mitigation..." /></label>
        <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : incident ? "Save changes" : "Declare incident"}</button></div>
      </form>
    </div>
  );
}

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "", severity: "" });
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filters]);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [incidentResult, serviceResult, statsResult] = await Promise.all([
        api(`/api/incidents${query ? `?${query}` : ""}`), api("/api/services"), api("/api/incidents/stats"),
      ]);
      setIncidents(incidentResult.data); setServices(serviceResult); setStats(statsResult);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { loadData(); }, [loadData]);

  const removeIncident = async (incident) => {
    if (!window.confirm(`Delete incident #${incident.id}?`)) return;
    try { await api(`/api/incidents/${incident.id}`, { method: "DELETE" }); await loadData(); }
    catch (requestError) { setError(requestError.message); }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">O</div><div><strong>OpsBoard</strong><span>Incident command</span></div></div>
        <nav><a className="active" href="#incidents"><span>◫</span>Incidents</a><a href="#services"><span>⬡</span>Services</a><a href="#metrics"><span>↗</span>Observability</a></nav>
        <div className="environment"><span className="pulse" /><div><small>Environment</small><strong>Local / Healthy</strong></div></div>
      </aside>
      <main>
        <header className="topbar"><div><span className="eyebrow">Platform operations</span><h1>Incident overview</h1></div><button className="button primary" onClick={() => setModal({ type: "create" })}><span>+</span> Declare incident</button></header>
        <section className="stats-grid">
          <StatCard label="All incidents" value={stats?.total} tone="neutral" detail="Recorded across services" />
          <StatCard label="Active" value={stats?.active} tone="warning" detail="Require team attention" />
          <StatCard label="Critical" value={stats?.critical} tone="danger" detail="SEV1 currently active" />
          <StatCard label="Resolved" value={stats?.resolved} tone="success" detail="Mitigated incidents" />
        </section>
        <section className="panel" id="incidents">
          <div className="panel-heading"><div><h2>Incident queue</h2><p>Live operational events ordered by severity.</p></div><button className="refresh" onClick={loadData}>↻ Refresh</button></div>
          <div className="filters">
            <label className="search"><span>⌕</span><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search incidents or services" /></label>
            <select value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })}><option value="">All severity</option>{Object.keys(severityLabel).map((item) => <option key={item}>{item}</option>)}</select>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All status</option>{Object.keys(statusLabel).map((item) => <option value={item} key={item}>{statusLabel[item]}</option>)}</select>
          </div>
          {error && <div className="error-banner"><strong>API unavailable.</strong> {error}. Start PostgreSQL and backend, then refresh.</div>}
          <div className="table-wrap"><table><thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Service</th><th>Owner</th><th>Started</th><th /></tr></thead><tbody>
            {incidents.map((incident) => <tr key={incident.id}>
              <td><button className="incident-title" onClick={() => setModal({ type: "edit", incident })}>{incident.title}</button><span className="incident-id">INC-{String(incident.id).padStart(4, "0")}</span></td>
              <td><span className={`badge severity ${incident.severity.toLowerCase()}`}><i />{incident.severity} · {severityLabel[incident.severity]}</span></td>
              <td><span className={`badge status ${incident.status.toLowerCase()}`}>{statusLabel[incident.status]}</span></td>
              <td><code>{incident.serviceName}</code></td><td>{incident.assignee || <span className="unassigned">Unassigned</span>}</td>
              <td className="time">{new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(incident.createdAt))}</td>
              <td><div className="row-actions"><button onClick={() => setModal({ type: "edit", incident })}>Edit</button><button className="delete" onClick={() => removeIncident(incident)}>Delete</button></div></td>
            </tr>)}</tbody></table>
            {!loading && !incidents.length && <div className="empty-state"><strong>No incidents found</strong><span>Change the filters or declare a new incident.</span></div>}
            {loading && <div className="empty-state">Loading incident data...</div>}
          </div>
        </section>
        <footer><span>OpsBoard API</span><span className="footer-dot" />PostgreSQL<span className="footer-dot" />Prometheus-ready</footer>
      </main>
      {modal && <IncidentForm incident={modal.incident} services={services} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await loadData(); }} />}
    </div>
  );
}
