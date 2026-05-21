import axios from "axios";

const YOUTUBE_BASE_URL = "https://www.googleapis.com/youtube/v3";

function getApiKey() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || apiKey.includes("paste_your")) {
    throw new Error("Missing YOUTUBE_API_KEY. Add your key to backend/.env");
  }
  return apiKey;
}

export async function searchRecentVideos({
  keyword,
  regionCode = "US",
  daysBack = 30,
  maxResults = 25,
}) {
  const publishedAfter = new Date();
  publishedAfter.setDate(publishedAfter.getDate() - daysBack);

  const params = {
    key: getApiKey(),
    part: "snippet",
    type: "video",
    q: keyword,
    order: "viewCount",
    maxResults,
    publishedAfter: publishedAfter.toISOString(),
    safeSearch: "none",
  };

  if (regionCode) params.regionCode = regionCode;

  const response = await axios.get(`${YOUTUBE_BASE_URL}/search`, { params });
  return response.data.items || [];
}

export async function getVideoStats(videoIds) {
  if (!videoIds.length) return [];

  const response = await axios.get(`${YOUTUBE_BASE_URL}/videos`, {
    params: {
      key: getApiKey(),
      part: "snippet,statistics,contentDetails",
      id: videoIds.slice(0, 50).join(","),
    },
  });

  return response.data.items || [];
}

export async function getChannelStats(channelIds) {
  if (!channelIds.length) return [];

  const response = await axios.get(`${YOUTUBE_BASE_URL}/channels`, {
    params: {
      key: getApiKey(),
      part: "snippet,statistics",
      id: channelIds.slice(0, 50).join(","),
    },
  });

  return response.data.items || [];
}

export async function searchChannelRecentVideos({ channelId, maxResults = 25, order = "date" }) {
  if (!channelId) return [];

  const response = await axios.get(`${YOUTUBE_BASE_URL}/search`, {
    params: {
      key: getApiKey(),
      part: "snippet",
      type: "video",
      channelId,
      order,
      maxResults: Math.min(Number(maxResults) || 25, 50),
      safeSearch: "none",
    },
  });

  return response.data.items || [];
}

export async function searchVideosByChannelAndKeyword({ channelId, keyword, maxResults = 25 }) {
  if (!channelId) return [];
  const params = {
    key: getApiKey(),
    part: "snippet",
    type: "video",
    channelId,
    order: "viewCount",
    maxResults: Math.min(Number(maxResults) || 25, 50),
    safeSearch: "none",
  };
  if (keyword) params.q = keyword;
  const response = await axios.get(`${YOUTUBE_BASE_URL}/search`, { params });
  return response.data.items || [];
}
