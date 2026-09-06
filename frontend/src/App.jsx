import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ADMIN_METHODS, api, displayDate, METHOD_LABELS, METHODS, money, prepareCsrf } from "./api";

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function useRemote(path) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      setState({ loading: false, data: await api(path), error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error.message });
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const data = await api("/auth/me");
      setUser(data.user);
      setCurrencyCode(data.currencyCode || "USD");
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    prepareCsrf().then(refreshSession).catch(() => setLoading(false));
  }, [refreshSession]);

  return (
    <AuthContext.Provider value={{ user, setUser, currencyCode, loading, refreshSession }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/donate" element={<Protected><Donate /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="/transparency" element={<Protected><Transparency /></Protected>} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/admin" element={<Protected admin><AdminOverview /></Protected>} />
        <Route path="/admin/review" element={<Protected admin><AdminReview /></Protected>} />
        <Route path="/admin/finance" element={<Protected admin><AdminFinance /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/donate" replace /> : children;
}

function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/donate" replace />;
  return <Shell>{children}</Shell>;
}

function LoadingScreen() {
  return <div className="app-loading"><span className="loading-mark">DL</span><p>Opening your ledger</p></div>;
}

function Shell({ children }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
    window.location.reload();
  }

  const navItem = ({ isActive }) => `nav-link${isActive ? " active" : ""}`;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/donate"><span>DL</span><strong>Donation<br />Ledger</strong></Link>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? "×" : "☰"}</button>
        <nav className={open ? "nav open" : "nav"} onClick={() => setOpen(false)}>
          <NavLink className={navItem} to="/donate">Donate</NavLink>
          <NavLink className={navItem} to="/history">History</NavLink>
          <NavLink className={navItem} to="/transparency">Total</NavLink>
          <NavLink className={navItem} to="/profile">Profile</NavLink>
          {user.role === "admin" && <>
            <NavLink className={navItem} to="/admin">Admin</NavLink>
            <NavLink className={navItem} to="/admin/review">Review</NavLink>
            <NavLink className={navItem} to="/admin/finance">Funds</NavLink>
          </>}
          <button className="nav-link sign-out" onClick={logout}>Sign out</button>
        </nav>
      </header>
      <main className="page-wrap">{children}</main>
    </div>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/donate" replace />;
  return (
    <main className="welcome">
      <div className="night-orb orb-one" /><div className="night-orb orb-two" />
      <section className="welcome-copy">
        <p className="kicker">Donation ledger</p>
        <h1>Giving, kept<br /><em>private.</em></h1>
        <p className="welcome-text">Log what you gave. Keep your records to yourself. Follow one transparent public total.</p>
        <div className="action-row"><Link className="button primary" to="/register">Create account</Link><Link className="button quiet" to="/login">Sign in</Link></div>
      </section>
      <aside className="welcome-card">
        <span className="card-eyebrow">A clear flow</span>
        <ol><li><span>01</span>Record an offline donation</li><li><span>02</span>Admin validates it</li><li><span>03</span>Public total updates</li></ol>
      </aside>
    </main>
  );
}

function Login() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const data = await api("/auth/login", { method: "POST", body: form });
      await refreshSession();
      navigate(data.needsEmail ? "/profile" : "/donate");
    } catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }

  return <AuthFrame title="Welcome back" hint="Sign in with your email and password."><form onSubmit={submit} className="form-stack">
    <Field label="Email address" type="text" value={form.email} onChange={(email) => setForm({ ...form, email })} autoComplete="email" />
    <Field label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} autoComplete="current-password" />
    <Notice message={error} />
    <button className="button primary wide" disabled={saving}>{saving ? "Signing in…" : "Sign in"}</button>
  </form><p className="auth-switch">New here? <Link to="/register">Create an account</Link></p></AuthFrame>;
}

function Register() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [showAdmin, setShowAdmin] = useState(false);
  const [form, setForm] = useState({ email: "", username: "", password: "", confirmPassword: "", adminCode: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try { await api("/auth/register", { method: "POST", body: form }); await refreshSession(); navigate("/donate"); }
    catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }

  return <AuthFrame title="Start your ledger" hint="Email signs you in. Your username is only how your account is shown."><form onSubmit={submit} className="form-stack">
    <Field label="Email address" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} autoComplete="email" />
    <Field label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} hint="3–30 lowercase letters, numbers, or underscores" />
    <Field label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} autoComplete="new-password" />
    <Field label="Confirm password" type="password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} autoComplete="new-password" />
    <button type="button" className="text-button" onClick={() => setShowAdmin(!showAdmin)}>Admin code</button>
    {showAdmin && <Field label="Optional admin code" type="password" value={form.adminCode} onChange={(adminCode) => setForm({ ...form, adminCode })} required={false} />}
    <Notice message={error} />
    <button className="button primary wide" disabled={saving}>{saving ? "Creating…" : "Create account"}</button>
  </form><p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p></AuthFrame>;
}

function AuthFrame({ title, hint, children }) {
  return <main className="auth-page"><Link className="brand auth-brand" to="/"><span>DL</span><strong>Donation Ledger</strong></Link><section className="auth-card"><p className="kicker">Private account</p><h1>{title}</h1><p className="auth-hint">{hint}</p>{children}</section></main>;
}

function Donate() {
  const { currencyCode } = useAuth();
  const { data, loading, error, reload } = useRemote("/dashboard");
  const [form, setForm] = useState({ amount: "", paymentMethod: "VODAFONE_CASH", paymentReference: "", donorNote: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.paymentProfiles?.length || form.paymentReference) return;
    const defaultProfile = data.paymentProfiles.find((profile) => profile.isDefault) || data.paymentProfiles[0];
    setForm((current) => ({ ...current, paymentMethod: defaultProfile.paymentMethod, paymentReference: defaultProfile.accountIdentifier }));
  }, [data, form.paymentReference]);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage("");
    try { const result = await api("/donations", { method: "POST", body: { ...form, amount: Number(form.amount) } }); setMessage(result.message); setForm((current) => ({ ...current, amount: "", donorNote: "" })); reload(); }
    catch (failure) { setMessage(failure.message); } finally { setSaving(false); }
  }

  if (loading) return <PageLoading />;
  if (error) return <Failure message={error} />;
  const profiles = data.paymentProfiles || [];
  return <>
    <PageTitle eyebrow="New entry" title="Record a donation" />
    <section className="metric-ribbon">
      <Metric label="Daily target" value={money(data.dailyTarget, currencyCode)} />
      <Metric label="Days since last donation" value={data.daysSinceLastDonation} />
      <Metric label="Suggested today" value={money(data.suggestedAmount, currencyCode)} emphasis />
    </section>
    <section className="split-grid donate-layout">
      <article className="surface form-surface"><h2>Donation details</h2><form className="form-stack" onSubmit={submit}>
        <Field label="Amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        <SelectField label="Payment method" value={form.paymentMethod} onChange={(paymentMethod) => setForm({ ...form, paymentMethod })} options={METHODS} />
        {profiles.length > 0 && <label className="field"><span>Saved details</span><select value="" onChange={(event) => { const profile = profiles.find((item) => String(item.id) === event.target.value); if (profile) setForm({ ...form, paymentMethod: profile.paymentMethod, paymentReference: profile.accountIdentifier }); }}><option value="">Type a new number or choose one</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{METHOD_LABELS[profile.paymentMethod]} · {profile.label || profile.accountIdentifier}</option>)}</select></label>}
        <Field label="Phone number or account identifier" value={form.paymentReference} onChange={(paymentReference) => setForm({ ...form, paymentReference })} hint="New details are saved to your profile automatically." />
        <TextArea label="Note (optional)" value={form.donorNote} onChange={(donorNote) => setForm({ ...form, donorNote })} />
        <Notice message={message} success={message.startsWith("Donation")} />
        <button className="button primary" disabled={saving}>{saving ? "Saving…" : "Submit for validation"}</button>
      </form></article>
      <article className="surface recent-surface"><div className="section-header"><div><p className="kicker">Your activity</p><h2>Recent donations</h2></div><Link to="/history">View all</Link></div><DonationList donations={data.recentDonations} currencyCode={currencyCode} compact /></article>
    </section>
  </>;
}

function History() {
  const { currencyCode } = useAuth(); const { data, loading, error } = useRemote("/history");
  if (loading) return <PageLoading />; if (error) return <Failure message={error} />;
  return <><PageTitle eyebrow="Your private record" title="Donation history" /><section className="surface"><DonationList donations={data.donations} currencyCode={currencyCode} /></section></>;
}

function Transparency() {
  const { currencyCode } = useAuth(); const { data, loading, error } = useRemote("/transparency");
  if (loading) return <PageLoading />; if (error) return <Failure message={error} />;
  return <><PageTitle eyebrow="Shared, not personal" title="Public total" /><section className="total-stage"><span>Current collected value</span><strong>{money(data.summary.publicTotal, currencyCode)}</strong><p>Approved donations and clearly recorded changes.</p></section><section className="metric-ribbon"><Metric label="Validated donations" value={money(data.summary.approvedTotal, currencyCode)} /><Metric label="Added" value={money(data.summary.addedTotal, currencyCode)} /><Metric label="Removed" value={money(data.summary.removedTotal, currencyCode)} /></section><section className="surface"><div className="section-header"><div><p className="kicker">Accountability</p><h2>Total changes</h2></div></div><AdjustmentList adjustments={data.adjustments} currencyCode={currencyCode} /></section></>;
}

function Profile() {
  const { user, setUser, currencyCode } = useAuth(); const { data, loading, error, reload } = useRemote("/profile");
  const [profile, setProfile] = useState(null); const [account, setAccount] = useState({ paymentMethod: "VODAFONE_CASH", accountIdentifier: "", label: "", makeDefault: false }); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { if (data?.user) setProfile({ email: data.user.email || "", username: data.user.username, dailyTarget: data.user.dailyTarget || 0 }); }, [data]);
  if (loading || !profile) return <PageLoading />; if (error) return <Failure message={error} />;

  async function saveProfile(event) { event.preventDefault(); setSaving(true); setMessage(""); try { const result = await api("/profile", { method: "PUT", body: { ...profile, dailyTarget: Number(profile.dailyTarget) } }); setUser(result.user); setMessage("Profile saved."); } catch (failure) { setMessage(failure.message); } finally { setSaving(false); } }
  async function addProfile(event) { event.preventDefault(); setSaving(true); setMessage(""); try { await api("/profile/payment-profiles", { method: "POST", body: account }); setAccount({ paymentMethod: "VODAFONE_CASH", accountIdentifier: "", label: "", makeDefault: false }); setMessage("Payment detail saved."); reload(); } catch (failure) { setMessage(failure.message); } finally { setSaving(false); } }
  async function removeProfile(id) { if (!window.confirm("Remove this saved payment detail?")) return; try { await api(`/profile/payment-profiles/${id}`, { method: "DELETE" }); reload(); } catch (failure) { setMessage(failure.message); } }

  return <><PageTitle eyebrow="Your account" title="Profile & settings" /><section className="split-grid"><article className="surface form-surface"><h2>Account preferences</h2><form className="form-stack" onSubmit={saveProfile}><Field label="Email address" type="email" value={profile.email} onChange={(email) => setProfile({ ...profile, email })} /><Field label="Username" value={profile.username} onChange={(username) => setProfile({ ...profile, username })} /><Field label={`Daily donation target (${currencyCode})`} type="number" min="0" step="0.01" value={profile.dailyTarget} onChange={(dailyTarget) => setProfile({ ...profile, dailyTarget })} hint="We use this with the days since your last donation to suggest an amount." /><Notice message={message} success={message.includes("saved")} /><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button></form></article><article className="surface form-surface"><h2>Add payment detail</h2><form className="form-stack" onSubmit={addProfile}><SelectField label="Method" value={account.paymentMethod} onChange={(paymentMethod) => setAccount({ ...account, paymentMethod })} options={METHODS} /><Field label="Phone number or account" value={account.accountIdentifier} onChange={(accountIdentifier) => setAccount({ ...account, accountIdentifier })} /><Field label="Label (optional)" value={account.label} onChange={(label) => setAccount({ ...account, label })} placeholder="Personal InstaPay" required={false} /><label className="checkbox-row"><input type="checkbox" checked={account.makeDefault} onChange={(event) => setAccount({ ...account, makeDefault: event.target.checked })} />Use as my default for this payment method</label><button className="button secondary">Save payment detail</button></form></article></section><section className="surface saved-section"><div className="section-header"><div><p className="kicker">Saved securely</p><h2>Payment details</h2></div></div><div className="profile-list">{data.paymentProfiles.length ? data.paymentProfiles.map((item) => <article className="profile-chip" key={item.id}><div><strong>{item.label || METHOD_LABELS[item.paymentMethod]}</strong><span>{METHOD_LABELS[item.paymentMethod]} · {item.accountIdentifier}</span></div>{item.isDefault && <em>Default</em>}<button className="icon-button danger" onClick={() => removeProfile(item.id)} aria-label="Remove payment profile">×</button></article>) : <Empty message="No saved details yet. You can also save one automatically when you donate." />}</div></section></>;
}

function AdminOverview() {
  const { currencyCode } = useAuth(); const { data, loading, error } = useRemote("/admin/overview");
  if (loading) return <PageLoading />; if (error) return <Failure message={error} />;
  return <><PageTitle eyebrow="Admin overview" title="Fund position" /><section className="total-stage admin-total"><span>Overall public total</span><strong>{money(data.summary.publicTotal, currencyCode)}</strong></section><MethodDiagram balances={data.methodBalances} currencyCode={currencyCode} /><section className="surface"><div className="section-header"><div><p className="kicker">Recent movement</p><h2>Method transfers</h2></div><Link to="/admin/finance">Manage funds</Link></div><TransferList transfers={data.transfers} currencyCode={currencyCode} /></section></>;
}

function AdminReview() {
  const { currencyCode } = useAuth(); const { data, loading, error, reload } = useRemote("/admin/review"); const [message, setMessage] = useState("");
  if (loading) return <PageLoading />; if (error) return <Failure message={error} />;
  async function review(id, action, note) { try { await api(`/admin/donations/${id}/review`, { method: "POST", body: { action, adminNote: note } }); setMessage(`Donation ${action}.`); reload(); } catch (failure) { setMessage(failure.message); } }
  return <><PageTitle eyebrow="Admin queue" title="Validate donations" /><Notice message={message} success={message.includes("approved") || message.includes("rejected")} /><section className="review-grid">{data.pendingDonations.length ? data.pendingDonations.map((donation) => <ReviewCard key={donation.id} donation={donation} currencyCode={currencyCode} onReview={review} />) : <Empty message="No donations are waiting for validation." />}</section><section className="surface"><div className="section-header"><div><p className="kicker">Completed</p><h2>Recently reviewed</h2></div></div><DonationList donations={data.reviewedDonations} currencyCode={currencyCode} admin /></section></>;
}

function AdminFinance() {
  const { currencyCode } = useAuth(); const { data, loading, error, reload } = useRemote("/admin/overview"); const [message, setMessage] = useState(""); const [transfer, setTransfer] = useState({ fromMethod: "VODAFONE_CASH", toMethod: "INSTAPAY", amount: "", note: "" }); const [adjustment, setAdjustment] = useState({ direction: "remove", paymentMethod: "VODAFONE_CASH", amount: "", note: "" });
  if (loading) return <PageLoading />; if (error) return <Failure message={error} />;
  async function submit(path, body, clear) { setMessage(""); try { await api(path, { method: "POST", body }); setMessage("Saved."); clear(); reload(); } catch (failure) { setMessage(failure.message); } }
  return <><PageTitle eyebrow="Admin finance" title="Move or adjust funds" /><MethodDiagram balances={data.methodBalances} currencyCode={currencyCode} /><Notice message={message} success={message === "Saved."} /><section className="split-grid"><article className="surface form-surface"><h2>Transfer between methods</h2><p className="quiet-copy">This only reallocates the recorded method balance. It never changes the public total.</p><form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("/admin/transfers", { ...transfer, amount: Number(transfer.amount) }, () => setTransfer({ ...transfer, amount: "", note: "" })); }}><SelectField label="From" value={transfer.fromMethod} onChange={(fromMethod) => setTransfer({ ...transfer, fromMethod })} options={ADMIN_METHODS} /><SelectField label="To" value={transfer.toMethod} onChange={(toMethod) => setTransfer({ ...transfer, toMethod })} options={ADMIN_METHODS} /><Field label="Amount" type="number" min="0.01" step="0.01" value={transfer.amount} onChange={(amount) => setTransfer({ ...transfer, amount })} /><TextArea label="Transfer note" value={transfer.note} onChange={(note) => setTransfer({ ...transfer, note })} /><button className="button secondary">Transfer funds</button></form></article><article className="surface form-surface"><h2>Add or remove value</h2><form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("/admin/adjustments", { ...adjustment, amount: Number(adjustment.amount) }, () => setAdjustment({ ...adjustment, amount: "", note: "" })); }}><label className="field"><span>Direction</span><select value={adjustment.direction} onChange={(event) => setAdjustment({ ...adjustment, direction: event.target.value })}><option value="remove">Remove</option><option value="add">Add</option></select></label><SelectField label="Payment method" value={adjustment.paymentMethod} onChange={(paymentMethod) => setAdjustment({ ...adjustment, paymentMethod })} options={METHODS} /><Field label="Amount" type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={(amount) => setAdjustment({ ...adjustment, amount })} /><TextArea label="Admin note" value={adjustment.note} onChange={(note) => setAdjustment({ ...adjustment, note })} /><button className="button danger-button">Save total change</button></form></article></section><section className="surface"><div className="section-header"><div><p className="kicker">Recorded changes</p><h2>Adjustment log</h2></div></div><AdjustmentList adjustments={data.adjustments} currencyCode={currencyCode} /></section></>;
}

function ReviewCard({ donation, currencyCode, onReview }) {
  const [note, setNote] = useState(""); return <article className="surface review-card"><div className="review-amount"><div><p className="kicker">{donation.username}</p><h2>{money(donation.amount, currencyCode)}</h2></div><Status status="pending" /></div><dl className="detail-list"><div><dt>Method</dt><dd>{METHOD_LABELS[donation.paymentMethod]}</dd></div><div><dt>Account</dt><dd>{donation.paymentReference}</dd></div><div><dt>Logged</dt><dd>{displayDate(donation.createdAt)}</dd></div>{donation.donorNote && <div><dt>Note</dt><dd>{donation.donorNote}</dd></div>}</dl><TextArea label="Admin note" value={note} onChange={setNote} /><div className="button-pair"><button className="button primary" onClick={() => onReview(donation.id, "approved", note)}>Approve</button><button className="button danger-button" onClick={() => onReview(donation.id, "rejected", note)}>Reject</button></div></article>;
}

function MethodDiagram({ balances, currencyCode }) {
  const normalized = ADMIN_METHODS.map((method) => ({ paymentMethod: method, amount: Number(balances.find((item) => item.paymentMethod === method)?.amount || 0) })); const maximum = Math.max(...normalized.map((item) => item.amount), 1);
  return <section className="surface method-diagram"><div className="section-header"><div><p className="kicker">Internal distribution</p><h2>Payment methods</h2></div></div><div className="bar-list">{normalized.map((item) => <div className="method-bar" key={item.paymentMethod}><div><span>{METHOD_LABELS[item.paymentMethod]}</span><strong>{money(item.amount, currencyCode)}</strong></div><i><b style={{ width: `${Math.max(2, item.amount / maximum * 100)}%` }} /></i></div>)}</div></section>;
}

function DonationList({ donations, currencyCode, compact = false, admin = false }) {
  if (!donations?.length) return <Empty message="No donations recorded yet." />;
  return <div className={compact ? "donation-list compact" : "donation-list"}>{donations.map((donation) => <article className="donation-row" key={donation.id}><div className="donation-main"><strong>{money(donation.amount, currencyCode)}</strong><span>{METHOD_LABELS[donation.paymentMethod] || "Recorded donation"} · {displayDate(donation.createdAt)}</span>{admin && <span>{donation.donorUsername} · {donation.reviewerUsername || "—"}</span>}</div><div className="donation-side"><Status status={donation.status} />{!compact && donation.adminNote && <small>{donation.adminNote}</small>}</div></article>)}</div>;
}

function AdjustmentList({ adjustments, currencyCode }) { if (!adjustments?.length) return <Empty message="No total changes have been recorded." />; return <div className="donation-list">{adjustments.map((item) => <article className="donation-row" key={item.id}><div className="donation-main"><strong className={Number(item.amount) < 0 ? "negative" : "positive"}>{money(item.amount, currencyCode)}</strong><span>{item.note}</span></div><div className="donation-side"><small>{item.adminUsername} · {displayDate(item.createdAt)}</small></div></article>)}</div>; }
function TransferList({ transfers, currencyCode }) { if (!transfers?.length) return <Empty message="No payments have been moved between methods." />; return <div className="donation-list">{transfers.map((item) => <article className="donation-row" key={item.id}><div className="donation-main"><strong>{money(item.amount, currencyCode)}</strong><span>{METHOD_LABELS[item.fromMethod]} → {METHOD_LABELS[item.toMethod]} · {item.note}</span></div><div className="donation-side"><small>{item.adminUsername} · {displayDate(item.createdAt)}</small></div></article>)}</div>; }
function Status({ status }) { return <span className={`status ${status}`}>{status}</span>; }
function Metric({ label, value, emphasis = false }) { return <article className={emphasis ? "metric emphasis" : "metric"}><span>{label}</span><strong>{value}</strong></article>; }
function PageTitle({ eyebrow, title }) { return <header className="page-title"><p className="kicker">{eyebrow}</p><h1>{title}</h1></header>; }
function PageLoading() { return <div className="page-loading"><span />Loading</div>; }
function Failure({ message }) { return <div className="failure">{message}</div>; }
function Empty({ message }) { return <p className="empty">{message}</p>; }
function Notice({ message, success = false }) { return message ? <p className={success ? "notice success" : "notice"}>{message}</p> : null; }
function Field({ label, hint, onChange, ...props }) { return <label className="field"><span>{label}</span><input {...props} required={props.required ?? true} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>; }
function TextArea({ label, value, onChange }) { return <label className="field"><span>{label}</span><textarea rows="3" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, options }) { return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{METHOD_LABELS[option] || option}</option>)}</select></label>; }
