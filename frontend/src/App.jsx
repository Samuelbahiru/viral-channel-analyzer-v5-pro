import { useEffect, useMemo, useState } from "react";
import {
  analyzeChannels,
  createMonetizationReport,
  createScan,
  deleteScan,
  generateIdeas,
  getDailySearchLog,
  getDashboard,
  getDeepAnalyses,
  getIdeaSets,
  getMonetizationReports,
  getNicheReports,
  getScans,
  getSearchRuns,
  getTrends,
  getWatchlist,
  refreshAllWatchlistChannels,
  refreshWatchlistChannel,
  removeWatchlistChannel,
  runDeepAnalysis,
  saveWatchlistChannel,
  updateWatchlistChannel,
} from "./api.js";
import "./index.css";

const regionOptions = [
  ["US", "United States"], ["ET", "Ethiopia"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["NG", "Nigeria"], ["KE", "Kenya"], ["GH", "Ghana"], ["ZA", "South Africa"], ["IN", "India"], ["PH", "Philippines"], ["GLOBAL", "Global"],
];
const formatOptions = [["all", "All formats"], ["shorts", "Shorts only"], ["standard", "Videos only"], ["mid-form", "Mid-form"], ["long-form", "Long-form"]];
const navItems = [
  ["dashboard", "Dashboard", "Business overview"],
  ["research", "Research", "Find viral channels"],
  ["watchlist", "Watchlist", "Track saved channels"],
  ["deep", "Deep Analysis", "Competitor intelligence"],
  ["reports", "Niche Reports", "Creator fit"],
  ["trends", "Trends", "Momentum signals"],
  ["ideas", "Ideas", "Content strategy"],
  ["money", "Monetization", "Revenue paths"],
  ["scans", "Scan Plans", "Daily routines"],
  ["history", "History", "Search logs"],
];

const defaultForm = { keyword: "christian music", regionCode: "US", daysBack: 30, maxChannelAgeDays: 365, maxResults: 25, minVideoViews: 10000, videoFormatFilter: "all" };

function n(value) { return Number(value || 0).toLocaleString(); }
function compact(value) { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0)); }
function dt(value) { return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "-"; }
function pct(value) { return `${Number(value || 0).toFixed(0)}%`; }
function dur(seconds) { if (seconds == null) return "-"; const m = Math.floor(seconds / 60); const s = seconds % 60; return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, "0")}`; }
function reportObj(r) { return r?.reportJson ? { ...r.reportJson, ...r } : r; }

function Pill({ children, tone = "" }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Button({ children, onClick, disabled, kind = "primary", type = "button" }) { return <button type={type} className={`btn ${kind}`} disabled={disabled} onClick={onClick}>{children}</button>; }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Card({ title, eyebrow, action, children, className = "" }) { return <section className={`card ${className}`}><div className="card-head"><div>{eyebrow && <p>{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>{children}</section>; }
function Stat({ label, value, note }) { return <article className="stat"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>; }
function Empty({ title = "No data yet", text = "Run a search or create a report to populate this area." }) { return <div className="empty"><strong>{title}</strong><span>{text}</span></div>; }

function Bars({ rows = [], labelKey, valueKey, formatter = n, limit = 8 }) {
  const safe = rows.slice(0, limit);
  const max = Math.max(...safe.map((r) => Number(r[valueKey] || 0)), 1);
  if (!safe.length) return <Empty />;
  return <div className="bars">{safe.map((row, index) => {
    const value = Number(row[valueKey] || 0);
    return <div className="bar" key={`${row[labelKey]}-${index}`}><div><span>{row[labelKey]}</span><strong>{formatter(value)}</strong></div><i><b style={{ width: `${Math.max(3, (value / max) * 100)}%` }} /></i></div>;
  })}</div>;
}

function ResultTable({ results, onSave, onDeep }) {
  if (!results?.length) return <Empty title="No candidates yet" text="Run research to see ranked channels." />;
  return <div className="table-wrap"><table><thead><tr><th>Video / Channel</th><th>Format</th><th>Views</th><th>Subs</th><th>Opp.</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{results.map((item) => <tr key={`${item.channelId}-${item.videoId}`}><td><div className="media-cell">{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" />}<div><a href={item.videoUrl} target="_blank">{item.videoTitle}</a><small><a href={item.channelUrl} target="_blank">{item.channelTitle}</a> • {item.channelAgeDays}d old</small></div></div></td><td><Pill>{item.videoFormat || "unknown"}</Pill><small>{dur(item.durationSeconds)}</small></td><td>{compact(item.videoViews)}<small>{item.viewsPerSubscriber} views/sub</small></td><td>{compact(item.subscribers)}</td><td><strong>{Math.round(item.opportunityScore || 0)}</strong><small>viral {compact(item.viralScore)}</small></td><td>{item.reason}<small>{item.recommendation}</small></td><td><div className="action-stack"><Button kind="secondary" onClick={() => onSave(item)}>Save</Button><Button kind="ghost" onClick={() => onDeep(item.channelId)}>Deep</Button></div></td></tr>)}</tbody></table></div>;
}

function Dashboard({ data, loadAll, setActive }) {
  return <div className="grid-page"><div className="stats-grid"><Stat label="Searches" value={n(data?.stats?.totalSearches)} note={`${n(data?.stats?.searchesToday)} today`} /><Stat label="Saved channels" value={n(data?.stats?.savedChannels)} note="tracked competitors" /><Stat label="Niche reports" value={n(data?.stats?.nicheReports)} note={`best fit ${data?.stats?.bestCreatorFit || 0}/100`} /><Stat label="Ideas / money" value={`${n(data?.stats?.ideaSets)} / ${n(data?.stats?.monetizationReports)}`} note="strategy assets" /></div><div className="two-col"><Card title="Search activity" eyebrow="14 days"><Bars rows={data?.charts?.dailySearches || []} labelKey="date" valueKey="searches" /></Card><Card title="Top creator-fit niches" eyebrow="ranking"><Bars rows={data?.charts?.topNiches || []} labelKey="keyword" valueKey="creatorFitScore" formatter={(v) => `${v}/100`} /></Card></div><div className="two-col"><Card title="Format performance" eyebrow="market signal"><Bars rows={data?.charts?.formatMix || []} labelKey="format" valueKey="avgOpportunityScore" formatter={(v) => `${v}/100`} /></Card><Card title="Top saved competitors" eyebrow="watchlist" action={<Button kind="ghost" onClick={() => setActive("watchlist")}>Open</Button>}><Bars rows={data?.topSavedChannels || []} labelKey="title" valueKey="score" formatter={(v) => `${v}/100`} /></Card></div><Card title="Operating rhythm" eyebrow="workflow"><div className="workflow"><div><b>1. Research</b><span>Find high-signal channels by niche and format.</span></div><div><b>2. Save</b><span>Move winners into Watchlist.</span></div><div><b>3. Deep analyze</b><span>Study repeatability and content patterns.</span></div><div><b>4. Generate ideas</b><span>Turn research into publishable tests.</span></div><div><b>5. Monetize</b><span>Choose revenue paths by niche.</span></div></div></Card></div>;
}

function Research({ form, setForm, analysis, setAnalysis, loading, setLoading, saveResult, runDeepFromChannel, refreshEverything }) {
  async function submit(e) {
    e.preventDefault();
    setLoading("research");
    try { const data = await analyzeChannels(form); setAnalysis(data); await refreshEverything(); } catch (error) { alert(error.response?.data?.message || error.message); } finally { setLoading(null); }
  }
  const report = reportObj(analysis?.nicheReport || analysis?.report);
  return <div className="grid-page"><Card title="Research new viral channels" eyebrow="YouTube API search"><form className="form-grid" onSubmit={submit}><Field label="Keyword"><input value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></Field><Field label="Region"><select value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value })}>{regionOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Format"><select value={form.videoFormatFilter} onChange={(e) => setForm({ ...form, videoFormatFilter: e.target.value })}>{formatOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Video age"><select value={form.daysBack} onChange={(e) => setForm({ ...form, daysBack: Number(e.target.value) })}>{[7,14,30,60,90,180,365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></Field><Field label="Max channel age"><select value={form.maxChannelAgeDays} onChange={(e) => setForm({ ...form, maxChannelAgeDays: Number(e.target.value) })}>{[30,90,180,365,730,1095,1825].map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field><Field label="Results"><select value={form.maxResults} onChange={(e) => setForm({ ...form, maxResults: Number(e.target.value) })}>{[5,10,25,50].map((d) => <option key={d} value={d}>{d}</option>)}</select></Field><Field label="Min views"><select value={form.minVideoViews} onChange={(e) => setForm({ ...form, minVideoViews: Number(e.target.value) })}>{[0,1000,10000,50000,100000,500000,1000000].map((d) => <option key={d} value={d}>{n(d)}+</option>)}</select></Field><div className="field field-end"><Button type="submit" disabled={loading === "research"}>{loading === "research" ? "Analyzing..." : "Analyze"}</Button></div></form></Card>{report && <Card title="Niche opportunity report" eyebrow={report.keyword}><div className="stats-grid"><Stat label="Creator fit" value={`${Math.round(report.creatorFitScore || 0)}/100`} note={report.opportunityLevel} /><Stat label="Difficulty" value={report.nicheDifficulty || "-"} note={`Best: ${report.bestFormat || "unknown"}`} /><Stat label="Avg views" value={compact(report.averageViews)} note={`${n(report.candidatesAnalyzed)} candidates`} /><Stat label="Shorts ratio" value={pct(report.shortsRatio)} note="detected format" /></div><p className="summary">{report.summary || report.creatorRecommendation}</p><TagList title="Top signals" items={report.topSignals} /><TagList title="Strategic actions" items={report.strategicActions} /></Card>}<Card title="Ranked candidates" eyebrow={`${analysis?.totalResults || 0} result(s)`}><ResultTable results={analysis?.results || []} onSave={saveResult} onDeep={runDeepFromChannel} /></Card></div>;
}

function TagList({ title, items }) {
  if (!items?.length) return null;
  return <div className="tag-block"><h3>{title}</h3><div className="tag-list">{items.map((item, i) => <span key={`${item}-${i}`}>{typeof item === "string" ? item : item.term || JSON.stringify(item)}</span>)}</div></div>;
}

function Watchlist({ watchlist, refreshWatch, removeWatch, updateWatch, refreshAll, runDeepFromChannel, generateFromChannel }) {
  return <div className="grid-page"><Card title="Saved channels" eyebrow="competitor watchlist" action={<Button onClick={refreshAll}>Refresh all</Button>}>{!watchlist?.length ? <Empty title="No saved channels" text="Save channels from Research first." /> : <div className="card-grid">{watchlist.map((item) => <article className="mini-card" key={item.channelId}>{item.channel?.thumbnailUrl && <img src={item.channel.thumbnailUrl} alt="" />}<div><h3>{item.channel?.title || item.channelId}</h3><p>{item.savedKeyword || "No keyword"} • score {Math.round(item.savedOpportunityScore || item.savedScore || 0)}/100</p><div className="mini-stats"><span>Subs {compact(item.channel?.subscriberCount)}</span><span>Views {compact(item.channel?.totalViewCount)}</span><span>Δ views {item.growth?.channelViewDelta == null ? "-" : compact(item.growth.channelViewDelta)}</span></div><textarea placeholder="Notes" defaultValue={item.notes || ""} onBlur={(e) => updateWatch(item.channelId, { notes: e.target.value })} /><div className="buttons"><Button kind="secondary" onClick={() => refreshWatch(item.channelId)}>Refresh</Button><Button kind="ghost" onClick={() => runDeepFromChannel(item.channelId)}>Deep</Button><Button kind="ghost" onClick={() => generateFromChannel(item.channelId, item.savedKeyword)}>Ideas</Button><Button kind="danger" onClick={() => removeWatch(item.channelId)}>Remove</Button></div></div></article>)}</div>}</Card></div>;
}

function DeepAnalysis({ watchlist, deepAnalyses, deepResult, setDeepResult, loading, setLoading, reload }) {
  const [channelId, setChannelId] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  async function submit(e) { e.preventDefault(); if (!channelId) return; setLoading("deep"); try { const data = await runDeepAnalysis({ channelId, maxResults }); setDeepResult(data.analysis); await reload(); } catch (error) { alert(error.response?.data?.message || error.message); } finally { setLoading(null); } }
  const result = deepResult || reportObj(deepAnalyses?.[0]);
  return <div className="grid-page"><Card title="Deep competitor analysis" eyebrow="channel intelligence"><form className="form-grid" onSubmit={submit}><Field label="Choose saved channel"><select value={channelId} onChange={(e) => setChannelId(e.target.value)}><option value="">Select channel</option>{watchlist.map((w) => <option key={w.channelId} value={w.channelId}>{w.channel?.title || w.channelId}</option>)}</select></Field><Field label="Videos to fetch"><select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))}>{[10,25,50].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field><div className="field field-end"><Button type="submit" disabled={loading === "deep"}>{loading === "deep" ? "Analyzing..." : "Analyze channel"}</Button></div></form></Card>{result && <Card title={result.channelTitle || "Deep report"} eyebrow={`Repeatability ${Math.round(result.repeatabilityScore || 0)}/100`}><div className="stats-grid"><Stat label="Avg views" value={compact(result.averageViews)} /><Stat label="Engagement" value={`${result.averageEngagement || 0}%`} /><Stat label="Dominant format" value={result.dominantFormat || "-"} /><Stat label="Copy difficulty" value={result.copyDifficulty || "-"} /></div><p className="summary">{result.decision}</p><TagList title="Strengths" items={result.strengths} /><TagList title="Risks" items={result.risks} /><TagList title="Actions" items={result.recommendedActions} /><div className="two-col"><Card title="Top videos"><VideoList videos={result.topVideos} /></Card><Card title="Weak videos"><VideoList videos={result.weakVideos} /></Card></div></Card>}<Card title="Previous deep analyses" eyebrow="saved reports"><Bars rows={(deepAnalyses || []).map((r) => ({ title: r.channelTitle, score: r.repeatabilityScore }))} labelKey="title" valueKey="score" formatter={(v) => `${v}/100`} /></Card></div>;
}

function VideoList({ videos = [] }) { if (!videos.length) return <Empty />; return <div className="video-list">{videos.map((v) => <a key={v.videoId} href={v.videoUrl} target="_blank"><b>{v.title}</b><span>{compact(v.views)} views • {v.videoFormat} • {Math.round(v.opportunityScore || 0)}/100</span></a>)}</div>; }

function Reports({ reports, createMoneyFromReport, generateFromReport }) {
  return <div className="grid-page"><Card title="Niche reports" eyebrow="creator fit library">{!reports?.length ? <Empty /> : <div className="report-grid">{reports.map((row) => { const r = reportObj(row); return <article className="report-card" key={row.id}><div><Pill>{r.opportunityLevel}</Pill><h3>{r.keyword}</h3><p>{r.summary || r.creatorRecommendation}</p></div><div className="stats-grid small"><Stat label="Fit" value={`${Math.round(r.creatorFitScore || 0)}/100`} /><Stat label="Difficulty" value={r.nicheDifficulty} /><Stat label="Best" value={r.bestFormat || "-"} /><Stat label="Shorts" value={pct(r.shortsRatio)} /></div><div className="buttons"><Button kind="secondary" onClick={() => generateFromReport(row.id, r.keyword)}>Ideas</Button><Button kind="ghost" onClick={() => createMoneyFromReport(row.id, r.keyword)}>Money</Button></div></article>; })}</div>}</Card></div>;
}

function Trends({ trends }) {
  return <div className="grid-page"><Card title="Trend alerts" eyebrow="recent momentum">{(trends?.alerts || []).map((a, i) => <p className="alert" key={i}>{a}</p>)}</Card><div className="two-col"><Card title="Rising niches"><Bars rows={trends?.risingNiches || []} labelKey="keyword" valueKey="bestCreatorFit" formatter={(v) => `${v}/100`} /></Card><Card title="Format momentum"><Bars rows={trends?.formatMomentum || []} labelKey="format" valueKey="averageOpportunityScore" formatter={(v) => `${v}/100`} /></Card></div><Card title="Fastest saved-channel growth"><Bars rows={trends?.fastestGrowingChannels || []} labelKey="title" valueKey="viewDelta" formatter={compact} /></Card></div>;
}

function Ideas({ ideaSets, currentIdea, setCurrentIdea, watchlist, reports, loading, setLoading, reload }) {
  const [form, setForm] = useState({ keyword: "christian music", channelId: "", nicheReportId: "", formatPreference: "mixed" });
  async function submit(e) { e.preventDefault(); setLoading("ideas"); try { const data = await generateIdeas({ ...form, nicheReportId: form.nicheReportId ? Number(form.nicheReportId) : undefined }); setCurrentIdea(data.ideaSet); await reload(); } catch (error) { alert(error.response?.data?.message || error.message); } finally { setLoading(null); } }
  const ideas = currentIdea || ideaSets?.[0]?.ideasJson;
  return <div className="grid-page"><Card title="Content idea generator" eyebrow="from research to production"><form className="form-grid" onSubmit={submit}><Field label="Keyword"><input value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></Field><Field label="Saved channel"><select value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })}><option value="">Optional</option>{watchlist.map((w) => <option key={w.channelId} value={w.channelId}>{w.channel?.title || w.channelId}</option>)}</select></Field><Field label="Niche report"><select value={form.nicheReportId} onChange={(e) => setForm({ ...form, nicheReportId: e.target.value })}><option value="">Optional</option>{reports.map((r) => <option key={r.id} value={r.id}>{r.keyword}</option>)}</select></Field><Field label="Format"><select value={form.formatPreference} onChange={(e) => setForm({ ...form, formatPreference: e.target.value })}>{["mixed","shorts","mid-form","long-form"].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field><div className="field field-end"><Button type="submit" disabled={loading === "ideas"}>Generate ideas</Button></div></form></Card>{ideas && <Card title={ideas.niche || "Idea kit"} eyebrow={ideas.formatPreference}><p className="summary">{ideas.contentDirection}</p><TagList title="Hooks" items={ideas.hooks} /><TagList title="Titles" items={ideas.titleIdeas} /><TagList title="Thumbnail concepts" items={ideas.thumbnailConcepts} /><TagList title="Posting plan" items={ideas.postingPlan} /><TagList title="Ethical copy rules" items={ideas.ethicalCopyRules} /></Card>}<Card title="Saved idea kits"><Bars rows={(ideaSets || []).map((i) => ({ keyword: i.keyword || i.ideasJson?.niche, score: i.creatorFitScore || 1 }))} labelKey="keyword" valueKey="score" formatter={(v) => `${Math.round(v)}/100`} /></Card></div>;
}

function Money({ moneyReports, currentMoney, setCurrentMoney, reports, loading, setLoading, reload }) {
  const [form, setForm] = useState({ keyword: "christian music", nicheReportId: "" });
  async function submit(e) { e.preventDefault(); setLoading("money"); try { const data = await createMonetizationReport({ keyword: form.keyword, nicheReportId: form.nicheReportId ? Number(form.nicheReportId) : undefined }); setCurrentMoney(data.report); await reload(); } catch (error) { alert(error.response?.data?.message || error.message); } finally { setLoading(null); } }
  const report = currentMoney || moneyReports?.[0]?.reportJson;
  return <div className="grid-page"><Card title="Monetization intelligence" eyebrow="revenue strategy"><form className="form-grid" onSubmit={submit}><Field label="Keyword"><input value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></Field><Field label="Use niche report"><select value={form.nicheReportId} onChange={(e) => setForm({ ...form, nicheReportId: e.target.value })}><option value="">Optional</option>{reports.map((r) => <option key={r.id} value={r.id}>{r.keyword}</option>)}</select></Field><div className="field field-end"><Button type="submit" disabled={loading === "money"}>Create report</Button></div></form></Card>{report && <Card title={report.keyword || "Monetization report"} eyebrow={`Score ${report.monetizationScore || 0}/100`}><div className="stats-grid"><Stat label="AdSense" value={report.adsensePotential} /><Stat label="Affiliate" value={report.affiliatePotential} /><Stat label="Sponsorship" value={report.sponsorshipPotential} /><Stat label="Product" value={report.productPotential} /></div><TagList title="Recommendations" items={report.recommendations} /><TagList title="Monetization ladder" items={report.monetizationLadder} /></Card>}<Card title="Saved monetization reports"><Bars rows={(moneyReports || []).map((r) => ({ keyword: r.keyword, score: r.monetizationScore }))} labelKey="keyword" valueKey="score" formatter={(v) => `${v}/100`} /></Card></div>;
}

function Scans({ scans, reload }) {
  const [form, setForm] = useState({ name: "Daily Christian music scan", keyword: "christian music", regionCode: "US", daysBack: 30, maxChannelAgeDays: 365, maxResults: 25, minVideoViews: 10000, videoFormatFilter: "all", cadence: "daily", active: true });
  async function submit(e) { e.preventDefault(); try { await createScan(form); await reload(); } catch (error) { alert(error.response?.data?.message || error.message); } }
  async function remove(id) { await deleteScan(id); await reload(); }
  return <div className="grid-page"><Card title="Scan plans" eyebrow="local daily routine presets"><form className="form-grid" onSubmit={submit}><Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Keyword"><input value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></Field><Field label="Region"><select value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value })}>{regionOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Format"><select value={form.videoFormatFilter} onChange={(e) => setForm({ ...form, videoFormatFilter: e.target.value })}>{formatOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Cadence"><select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>{["daily","weekly","manual"].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field><div className="field field-end"><Button type="submit">Save scan</Button></div></form><p className="hint">This version stores scan plans. Automatic background execution should be added when you deploy the backend to a server with a cron worker.</p></Card><Card title="Saved scan plans">{!scans.length ? <Empty /> : <div className="list">{scans.map((s) => <div key={s.id} className="list-row"><div><b>{s.name}</b><span>{s.keyword} • {s.regionCode || "Global"} • {s.videoFormatFilter} • {s.cadence}</span></div><Button kind="danger" onClick={() => remove(s.id)}>Delete</Button></div>)}</div>}</Card></div>;
}

function History({ runs, daily }) { return <div className="grid-page"><div className="two-col"><Card title="Daily search log"><Bars rows={(daily || []).map((d) => ({ date: d.date || d.day, count: d.count || d.searchCount || 0 }))} labelKey="date" valueKey="count" /></Card><Card title="Recent searches">{!runs?.length ? <Empty /> : <div className="list">{runs.map((r) => <div key={r.id} className="list-row"><div><b>{r.keyword}</b><span>{r.regionCode || "Global"} • {r.videoFormatFilter} • {r.status} • {dt(r.createdAt)}</span></div><Pill>{r._count?.results || r.totalChannelsFound || 0} results</Pill></div>)}</div>}</Card></div></div>; }

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [loading, setLoading] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [analysis, setAnalysis] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [runs, setRuns] = useState([]);
  const [daily, setDaily] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [reports, setReports] = useState([]);
  const [deepAnalyses, setDeepAnalyses] = useState([]);
  const [deepResult, setDeepResult] = useState(null);
  const [trends, setTrends] = useState(null);
  const [ideaSets, setIdeaSets] = useState([]);
  const [currentIdea, setCurrentIdea] = useState(null);
  const [moneyReports, setMoneyReports] = useState([]);
  const [currentMoney, setCurrentMoney] = useState(null);
  const [scans, setScans] = useState([]);

  async function reload() {
    const results = await Promise.allSettled([getDashboard(), getSearchRuns(25), getDailySearchLog(), getWatchlist(), getNicheReports(30), getDeepAnalyses(20), getTrends(14), getIdeaSets(20), getMonetizationReports(20), getScans()]);
    if (results[0].status === "fulfilled") setDashboard(results[0].value);
    if (results[1].status === "fulfilled") setRuns(results[1].value.runs || results[1].value || []);
    if (results[2].status === "fulfilled") setDaily(results[2].value.days || results[2].value.daily || results[2].value || []);
    if (results[3].status === "fulfilled") setWatchlist(results[3].value.channels || []);
    if (results[4].status === "fulfilled") setReports(results[4].value.reports || []);
    if (results[5].status === "fulfilled") setDeepAnalyses(results[5].value.analyses || []);
    if (results[6].status === "fulfilled") setTrends(results[6].value);
    if (results[7].status === "fulfilled") setIdeaSets(results[7].value.ideaSets || []);
    if (results[8].status === "fulfilled") setMoneyReports(results[8].value.reports || []);
    if (results[9].status === "fulfilled") setScans(results[9].value.scans || []);
  }

  useEffect(() => { reload(); }, []);

  async function saveResult(item) { await saveWatchlistChannel({ ...item, sourceRunId: analysis?.runId, savedKeyword: analysis?.keyword || form.keyword, savedRegionCode: form.regionCode }); await reload(); }
  async function refreshWatch(channelId) { await refreshWatchlistChannel(channelId); await reload(); }
  async function refreshAll() { await refreshAllWatchlistChannels(); await reload(); }
  async function removeWatch(channelId) { await removeWatchlistChannel(channelId); await reload(); }
  async function updateWatch(channelId, payload) { await updateWatchlistChannel(channelId, payload); await reload(); }
  async function runDeepFromChannel(channelId) { setActive("deep"); setLoading("deep"); try { const data = await runDeepAnalysis({ channelId, maxResults: 25 }); setDeepResult(data.analysis); await reload(); } catch (error) { alert(error.response?.data?.message || error.message); } finally { setLoading(null); } }
  async function generateFromChannel(channelId, keyword) { setActive("ideas"); const data = await generateIdeas({ channelId, keyword, formatPreference: "mixed" }); setCurrentIdea(data.ideaSet); await reload(); }
  async function generateFromReport(nicheReportId, keyword) { setActive("ideas"); const data = await generateIdeas({ nicheReportId, keyword, formatPreference: "mixed" }); setCurrentIdea(data.ideaSet); await reload(); }
  async function createMoneyFromReport(nicheReportId, keyword) { setActive("money"); const data = await createMonetizationReport({ nicheReportId, keyword }); setCurrentMoney(data.report); await reload(); }

  const page = useMemo(() => {
    if (active === "dashboard") return <Dashboard data={dashboard} setActive={setActive} loadAll={reload} />;
    if (active === "research") return <Research form={form} setForm={setForm} analysis={analysis} setAnalysis={setAnalysis} loading={loading} setLoading={setLoading} saveResult={saveResult} runDeepFromChannel={runDeepFromChannel} refreshEverything={reload} />;
    if (active === "watchlist") return <Watchlist watchlist={watchlist} refreshWatch={refreshWatch} removeWatch={removeWatch} updateWatch={updateWatch} refreshAll={refreshAll} runDeepFromChannel={runDeepFromChannel} generateFromChannel={generateFromChannel} />;
    if (active === "deep") return <DeepAnalysis watchlist={watchlist} deepAnalyses={deepAnalyses} deepResult={deepResult} setDeepResult={setDeepResult} loading={loading} setLoading={setLoading} reload={reload} />;
    if (active === "reports") return <Reports reports={reports} createMoneyFromReport={createMoneyFromReport} generateFromReport={generateFromReport} />;
    if (active === "trends") return <Trends trends={trends} />;
    if (active === "ideas") return <Ideas ideaSets={ideaSets} currentIdea={currentIdea} setCurrentIdea={setCurrentIdea} watchlist={watchlist} reports={reports} loading={loading} setLoading={setLoading} reload={reload} />;
    if (active === "money") return <Money moneyReports={moneyReports} currentMoney={currentMoney} setCurrentMoney={setCurrentMoney} reports={reports} loading={loading} setLoading={setLoading} reload={reload} />;
    if (active === "scans") return <Scans scans={scans} reload={reload} />;
    return <History runs={runs} daily={daily} />;
  }, [active, dashboard, form, analysis, loading, watchlist, reports, deepAnalyses, deepResult, trends, ideaSets, currentIdea, moneyReports, currentMoney, scans, runs, daily]);

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><b>ViralScope</b><span>Creator Intelligence Pro</span></div><nav>{navItems.map(([id, label, hint]) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><b>{label}</b><span>{hint}</span></button>)}</nav><Button kind="ghost" onClick={reload}>Refresh data</Button></aside><main className="content"><header className="topbar"><div><p>Workspace</p><h1>{navItems.find(([id]) => id === active)?.[1]}</h1></div><div className="top-actions"><Pill>{loading ? `Running ${loading}` : "Ready"}</Pill></div></header>{page}</main></div>;
}
