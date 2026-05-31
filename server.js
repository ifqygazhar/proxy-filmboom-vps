import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const API_BASE_H5 = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
const API_BASE_FILMBOOM = 'https://123movienow.cc/wefeed-h5api-bff';
const MOVIENOW_ORIGIN = 'https://123movienow.cc';
const MOVIEBOX_ORIGIN = 'https://themoviebox.xyz';
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8787);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const DEFAULT_ALLOWED_ORIGINS = [
	'https://film.meongplod.my.id',
	'http://localhost:5173',
	'http://localhost:4173'
];

const USER_AGENTS = [
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
];

class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

const DETAIL_API_SOURCES = [
	{
		label: 'Aoneroom H5 API',
		baseUrl: API_BASE_H5,
		origin: MOVIEBOX_ORIGIN,
		referer: `${MOVIEBOX_ORIGIN}/`
	},
	{
		label: '123movienow API',
		baseUrl: API_BASE_FILMBOOM,
		origin: MOVIENOW_ORIGIN,
		referer: `${MOVIENOW_ORIGIN}/`
	},
	{
		label: 'Moviebox API',
		baseUrl: `${MOVIEBOX_ORIGIN}/wefeed-h5api-bff`,
		origin: MOVIEBOX_ORIGIN,
		referer: `${MOVIEBOX_ORIGIN}/`
	}
];

const PLAY_API_SOURCES = [
	{
		label: '123movienow API',
		baseUrl: API_BASE_FILMBOOM,
		origin: MOVIENOW_ORIGIN,
		secFetchSite: 'same-origin'
	},
	{
		label: 'Aoneroom H5 API',
		baseUrl: API_BASE_H5,
		origin: MOVIEBOX_ORIGIN,
		secFetchSite: 'cross-site'
	},
	{
		label: 'Moviebox API',
		baseUrl: `${MOVIEBOX_ORIGIN}/wefeed-h5api-bff`,
		origin: MOVIEBOX_ORIGIN,
		secFetchSite: 'same-origin'
	}
];

function randomUserAgent() {
	return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getCommonHeaders(referer) {
	return {
		accept: 'application/json',
		'accept-language': 'en-GB,en;q=0.6',
		priority: 'u=1, i',
		'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Brave";v="144"',
		'sec-ch-ua-mobile': '?0',
		'sec-ch-ua-platform': '"macOS"',
		'sec-fetch-dest': 'empty',
		'sec-fetch-mode': 'cors',
		'sec-fetch-site': 'cross-site',
		'sec-gpc': '1',
		'x-client-info': '{"timezone":"Asia/Jakarta"}',
		Referer: referer,
		'User-Agent': randomUserAgent()
	};
}

function buildDetailUrl(baseUrl, detailPath) {
	const searchParams = new URLSearchParams({ detailPath });
	return `${baseUrl}/detail?${searchParams.toString()}`;
}

function buildPlayUrl(baseUrl, subjectId, season, episode, detailPath) {
	const searchParams = new URLSearchParams({
		subjectId,
		se: season,
		ep: episode,
		detailPath
	});
	return `${baseUrl}/subject/play?${searchParams.toString()}`;
}

function buildCaptionUrl(baseUrl, videoId, subjectId, detailPath) {
	const searchParams = new URLSearchParams({
		format: 'MP4',
		id: videoId,
		subjectId,
		detailPath
	});
	return `${baseUrl}/subject/caption?${searchParams.toString()}`;
}

function buildPlayReferer(origin, detailPath, subjectId, season, episode) {
	const searchParams = new URLSearchParams({
		id: subjectId,
		type: '/movie/detail',
		detailSe: season,
		detailEp: episode,
		lang: 'id'
	});
	return `${origin}/spa/videoPlayPage/movies/${detailPath}?${searchParams.toString()}`;
}

function buildPlayHeaders(cookie, referer, secFetchSite) {
	return {
		...getCommonHeaders(referer),
		'sec-fetch-site': secFetchSite,
		'x-source': '',
		cookie,
		Origin: new URL(referer).origin,
		Referer: referer
	};
}

function getRawSetCookies(headers) {
	if (typeof headers.getSetCookie === 'function') {
		return headers.getSetCookie();
	}

	const rawCookie = headers.get('set-cookie');
	return rawCookie ? [rawCookie] : [];
}

function extractToken(rawCookies) {
	for (const rawCookie of rawCookies) {
		const match = rawCookie.match(/(?:^|;\s*)token=([^;]+)/);
		if (match) return match[1];
	}

	return null;
}

async function fetchWithTimeout(url, init = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		return await fetch(url, {
			...init,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchJson(url, init, debugLabel) {
	try {
		const response = await fetchWithTimeout(url, init);
		const body = await response.text();

		if (!response.ok) {
			const preview = body.length > 1000 ? `${body.slice(0, 1000)}... [truncated]` : body;
			console.error(`[${debugLabel}] upstream failed`, {
				status: response.status,
				statusText: response.statusText,
				url,
				bodyPreview: preview
			});
			return null;
		}

		return JSON.parse(body);
	} catch (error) {
		console.error(`[${debugLabel}] upstream error`, {
			url,
			error: error instanceof Error ? error.message : error
		});
		return null;
	}
}

async function getFilmboomAuth() {
	const uuid = randomUUID();

	try {
		const response = await fetchWithTimeout(`${API_BASE_H5}/country-code`, {
			method: 'GET',
			headers: {
				'User-Agent': randomUserAgent(),
				Accept: 'application/json',
				Origin: MOVIEBOX_ORIGIN,
				Referer: `${MOVIEBOX_ORIGIN}/`
			}
		});

		const rawCookies = getRawSetCookies(response.headers);
		const token = extractToken(rawCookies);
		const cookieParts = [`uuid=${uuid}`];

		if (token) cookieParts.push(`token=${token}`);

		return {
			token,
			uuid,
			cookie: cookieParts.join('; '),
			rawCookies
		};
	} catch (error) {
		console.error('[Filmboom Auth] failed', error);
		return {
			token: null,
			uuid,
			cookie: `uuid=${uuid}`,
			rawCookies: []
		};
	}
}

async function fetchFilmDetail(detailPath) {
	for (const source of DETAIL_API_SOURCES) {
		const detailUrl = buildDetailUrl(source.baseUrl, detailPath);
		const detailResponse = await fetchJson(
			detailUrl,
			{
				method: 'GET',
				headers: {
					...getCommonHeaders(source.referer),
					Origin: source.origin
				}
			},
			`Film Detail ${source.label}`
		);

		if (detailResponse?.code === 0 && detailResponse.data) {
			return detailResponse;
		}
	}

	return null;
}

async function fetchVideo({ subjectId, season, episode, detailPath, auth }) {
	let firstPlayableResponse = null;

	for (const source of PLAY_API_SOURCES) {
		const playUrl = buildPlayUrl(source.baseUrl, subjectId, season, episode, detailPath);
		const referer = buildPlayReferer(source.origin, detailPath, subjectId, season, episode);
		const videoResponse = await fetchJson(
			playUrl,
			{
				method: 'GET',
				headers: buildPlayHeaders(auth.cookie, referer, source.secFetchSite)
			},
			`Film Video ${source.label}`
		);

		if (videoResponse?.code === 0 && videoResponse.data) {
			const streams = videoResponse.data.streams || [];

			if (streams.length > 0) {
				return { videoResponse, source };
			}

			firstPlayableResponse ??= { videoResponse, source };
		}
	}

	return firstPlayableResponse || { videoResponse: null, source: null };
}

async function fetchCaptions({
	videoId,
	subjectId,
	detailPath,
	season,
	episode,
	auth,
	preferredSource
}) {
	const captionSources = preferredSource
		? [
				preferredSource,
				...PLAY_API_SOURCES.filter((source) => source.label !== preferredSource.label)
			]
		: PLAY_API_SOURCES;

	for (const source of captionSources) {
		const captionUrl = buildCaptionUrl(source.baseUrl, videoId, subjectId, detailPath);
		const referer = buildPlayReferer(source.origin, detailPath, subjectId, season, episode);
		const captionResponse = await fetchJson(
			captionUrl,
			{
				method: 'GET',
				headers: buildPlayHeaders(auth.cookie, referer, source.secFetchSite)
			},
			`Film Caption ${source.label}`
		);

		if (captionResponse?.code === 0 && captionResponse.data) {
			return captionResponse;
		}
	}

	return null;
}

function pickVideoId(videoResponse) {
	const data = videoResponse?.data;

	if (!data) return null;
	if (data.streams?.length > 0) return data.streams[0].id;
	if (data.currentResource?.id) return data.currentResource.id;
	if (data.id) return data.id;

	return null;
}

export async function loadFilmDetail({
	detailPath,
	season: requestedSeason,
	episode: requestedEpisode
}) {
	if (!detailPath) {
		throw new HttpError(400, 'detailPath is required');
	}

	const detailResponse = await fetchFilmDetail(detailPath);

	if (!detailResponse?.data?.subject) {
		throw new HttpError(404, 'Detail drama tidak ditemukan');
	}

	const subjectData = detailResponse.data.subject;
	const subjectId = subjectData.subjectId;

	if (!subjectId) {
		throw new HttpError(500, 'Subject ID missing');
	}

	const seasonsList = detailResponse.data.resource?.seasons || [];
	let defaultSeason = '1';
	let defaultEpisode = '1';

	if (seasonsList.length > 0) {
		const firstSeasonData = seasonsList[0];

		if (firstSeasonData.se === 0 && firstSeasonData.maxEp === 0) {
			defaultSeason = '0';
			defaultEpisode = '0';
		}
	} else {
		defaultSeason = '0';
		defaultEpisode = '0';
	}

	const season = requestedSeason ?? defaultSeason;
	const episode = requestedEpisode ?? defaultEpisode;
	const auth = await getFilmboomAuth();
	const { videoResponse, source: videoSource } = await fetchVideo({
		subjectId,
		season,
		episode,
		detailPath,
		auth
	});
	const videoId = pickVideoId(videoResponse);
	const subtitleResponse = videoId
		? await fetchCaptions({
				videoId,
				subjectId,
				detailPath,
				season,
				episode,
				auth,
				preferredSource: videoSource
			})
		: null;
	const streams = videoResponse?.data?.streams || [];

	return {
		meta: {
			title: subjectData.title,
			description: subjectData.description,
			cover: subjectData.cover?.url,
			rating: subjectData.imdbRatingValue,
			genre: subjectData.genre,
			cast: detailResponse.data.stars || []
		},
		currentContext: {
			detailPath,
			subjectId,
			season: Number.parseInt(season, 10),
			episode: Number.parseInt(episode, 10)
		},
		video: {
			streams,
			hasResource: videoResponse?.data?.hasResource ?? false
		},
		requestAuth: {
			token: auth.token,
			uuid: auth.uuid,
			cookie: auth.cookie
		},
		subtitles: subtitleResponse?.data?.captions || [],
		episodes: seasonsList,
		dubs: subjectData.dubs || [],
		proxyMeta: {
			source: videoSource?.label || null,
			streamCount: streams.length
		}
	};
}

function getAllowedOrigins() {
	return (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
}

function applyCors(request, response) {
	const requestOrigin = request.headers.origin;
	const allowedOrigins = getAllowedOrigins();
	const allowAny = allowedOrigins.includes('*');
	const allowedOrigin = allowAny ? '*' : allowedOrigins.find((origin) => origin === requestOrigin);

	if (allowedOrigin) {
		response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
		response.setHeader('Vary', 'Origin');
	}

	response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	response.setHeader('Access-Control-Allow-Headers', 'content-type, x-proxy-secret');
	response.setHeader('Access-Control-Max-Age', '86400');
}

function requireSecret(request) {
	const expectedSecret = process.env.PROXY_SHARED_SECRET;

	if (!expectedSecret) return;

	if (request.headers['x-proxy-secret'] !== expectedSecret) {
		throw new HttpError(401, 'Unauthorized');
	}
}

function sendJson(request, response, status, payload) {
	applyCors(request, response);
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store'
	});
	response.end(JSON.stringify(payload));
}

async function handleRequest(request, response) {
	try {
		applyCors(request, response);

		if (request.method === 'OPTIONS') {
			response.writeHead(204);
			response.end();
			return;
		}

		const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

		if (url.pathname === '/health') {
			sendJson(request, response, 200, { ok: true });
			return;
		}

		requireSecret(request);

		if (request.method === 'GET' && url.pathname === '/api/film/detail') {
			const detailPath = url.searchParams.get('detailPath') || '';
			const season = url.searchParams.get('season') || undefined;
			const episode = url.searchParams.get('episode') || undefined;
			const data = await loadFilmDetail({ detailPath, season, episode });

			sendJson(request, response, 200, data);
			return;
		}

		throw new HttpError(404, 'Not found');
	} catch (error) {
		const status = error instanceof HttpError ? error.status : 500;
		const message = error instanceof Error ? error.message : 'Internal server error';

		console.error('[Proxy Request] failed', { status, message });
		sendJson(request, response, status, { ok: false, error: message });
	}
}

const isCliEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCliEntry) {
	createServer(handleRequest).listen(PORT, HOST, () => {
		console.log(`Filmboom VPS proxy listening on http://${HOST}:${PORT}`);
	});
}
