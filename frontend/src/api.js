import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function analyzeChannels(payload) {
  const response = await axios.post(`${API_BASE_URL}/analyze`, payload);
  return response.data;
}

export async function getSearchRuns(limit = 25) {
  const response = await axios.get(`${API_BASE_URL}/analyze/runs`, { params: { limit } });
  return response.data;
}

export async function getDailySearchLog() {
  const response = await axios.get(`${API_BASE_URL}/analyze/daily`);
  return response.data;
}

export async function getWatchlist() {
  const response = await axios.get(`${API_BASE_URL}/watchlist`);
  return response.data;
}

export async function saveWatchlistChannel(payload) {
  const response = await axios.post(`${API_BASE_URL}/watchlist`, payload);
  return response.data;
}

export async function updateWatchlistChannel(channelId, payload) {
  const response = await axios.patch(`${API_BASE_URL}/watchlist/${channelId}`, payload);
  return response.data;
}

export async function refreshWatchlistChannel(channelId) {
  const response = await axios.post(`${API_BASE_URL}/watchlist/${channelId}/refresh`);
  return response.data;
}

export async function refreshAllWatchlistChannels() {
  const response = await axios.post(`${API_BASE_URL}/watchlist/refresh-all`);
  return response.data;
}

export async function getWatchlistIdeas(channelId) {
  const response = await axios.get(`${API_BASE_URL}/watchlist/${channelId}/ideas`);
  return response.data;
}

export async function removeWatchlistChannel(channelId) {
  const response = await axios.delete(`${API_BASE_URL}/watchlist/${channelId}`);
  return response.data;
}

export async function getNicheReports(limit = 20) {
  const response = await axios.get(`${API_BASE_URL}/niches/reports`, { params: { limit } });
  return response.data;
}

export async function getDashboard() {
  const response = await axios.get(`${API_BASE_URL}/dashboard`);
  return response.data;
}

export async function runDeepAnalysis(payload) {
  const response = await axios.post(`${API_BASE_URL}/deep-analysis`, payload);
  return response.data;
}

export async function getDeepAnalyses(limit = 12) {
  const response = await axios.get(`${API_BASE_URL}/deep-analysis`, { params: { limit } });
  return response.data;
}

export async function getTrends(days = 14) {
  const response = await axios.get(`${API_BASE_URL}/trends`, { params: { days } });
  return response.data;
}

export async function generateIdeas(payload) {
  const response = await axios.post(`${API_BASE_URL}/ideas/generate`, payload);
  return response.data;
}

export async function getIdeaSets(limit = 20) {
  const response = await axios.get(`${API_BASE_URL}/ideas`, { params: { limit } });
  return response.data;
}

export async function createMonetizationReport(payload) {
  const response = await axios.post(`${API_BASE_URL}/monetization/report`, payload);
  return response.data;
}

export async function getMonetizationReports(limit = 20) {
  const response = await axios.get(`${API_BASE_URL}/monetization/reports`, { params: { limit } });
  return response.data;
}

export async function getScans() {
  const response = await axios.get(`${API_BASE_URL}/scans`);
  return response.data;
}

export async function createScan(payload) {
  const response = await axios.post(`${API_BASE_URL}/scans`, payload);
  return response.data;
}

export async function updateScan(id, payload) {
  const response = await axios.patch(`${API_BASE_URL}/scans/${id}`, payload);
  return response.data;
}

export async function deleteScan(id) {
  const response = await axios.delete(`${API_BASE_URL}/scans/${id}`);
  return response.data;
}
