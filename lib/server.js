// lib/server.js — 写作台面板的 REST 数据面。
//
// 浏览器 → /api/writer-studio/*。认证统一交给宿主 connection 服务：
// 每条请求先走 connection.requestRejection()，Host/Origin/浏览器凭据任一
// 不通过就拒绝；认证服务不可用时整条路由不注册。请求体上限 4MB，所有写
// 操作复用 store 的串行锁。
import {
  readState, publicBook, listBooks, createBook, updateBook, deleteBook,
  upsertCharacter, deleteCharacter, upsertLocation, deleteLocation,
  upsertBranch, deleteBranch,
  saveChapter, readChapter, deleteChapter, updateChapterMeta,
  getSession, setSession, buildContextPack, findBook, resolveBook, activateBook,
  LOCATION_TYPES, BRANCH_KINDS,
} from './store.js';
import { runAi } from './ai.js';

const PREFIX = '/api/writer-studio';
const FENCE = 'x-dsh-writer-studio';

function send(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function fail(res, status, code, message) {
  send(res, status, { ok: false, error: { code, message: String(message ?? '') } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        req.destroy();
        reject(new Error('请求体超过 4MB 上限'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function decode(value) {
  try { return decodeURIComponent(String(value ?? '')); } catch { return ''; }
}

function sessionIdOf(url, body) {
  const fromQuery = url.searchParams.get('session');
  const raw = body?.sessionId ?? fromQuery ?? '';
  return /^[A-Za-z0-9:_-]{1,128}$/.test(String(raw)) ? String(raw) : null;
}

function statePayload(state, sessionId) {
  const session = sessionId ? getSession(state, sessionId) : null;
  const book = resolveBook(state, session?.bookId ?? state.activeBookId, sessionId);
  return {
    books: listBooks(state, sessionId),
    activeBookId: book?.id ?? null,
    book: publicBook(book),
    session: session ?? null,
    locationTypes: LOCATION_TYPES,
    branchKinds: BRANCH_KINDS,
  };
}

async function handle(req, res, getAiContext, getAiRoute) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const segments = url.pathname.slice(PREFIX.length).split('/').filter(Boolean).map(decode);
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try { body = await readBody(req); } catch (error) {
      fail(res, 400, 'BAD_BODY', error.message);
      return;
    }
  }

  // GET /state
  if (req.method === 'GET' && segments.length === 1 && segments[0] === 'state') {
    const state = await readState();
    send(res, 200, { ok: true, ...statePayload(state, sessionIdOf(url, null)) });
    return;
  }

  // POST /session
  if (req.method === 'POST' && segments.length === 1 && segments[0] === 'session') {
    const sessionId = sessionIdOf(url, body);
    if (!sessionId) return fail(res, 400, 'BAD_SESSION', '缺少合法会话 id');
    const patch = {};
    if (body.mode !== undefined) patch.mode = Boolean(body.mode);
    if (body.bookId !== undefined) patch.bookId = body.bookId ? String(body.bookId) : null;
    const session = await setSession(sessionId, patch);
    send(res, 200, { ok: true, session });
    return;
  }

  // POST /books
  if (req.method === 'POST' && segments.length === 1 && segments[0] === 'books') {
    const book = await createBook(body);
    send(res, 200, { ok: true, book });
    return;
  }

  const isBook = segments[0] === 'books' && segments[1];
  if (isBook) {
    const bookId = segments[1];
    const state = await readState();
    const book = findBook(state, bookId);
    if (!book && !(segments.length === 2 && req.method === 'DELETE')) {
      fail(res, 404, 'NO_BOOK', '作品不存在');
      return;
    }

    if (segments.length === 2) {
      if (req.method === 'DELETE') {
        send(res, 200, { ok: true, ...(await deleteBook(bookId)) });
        return;
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const updated = await updateBook(bookId, body);
        send(res, 200, { ok: true, book: updated });
        return;
      }
      if (req.method === 'GET') {
        send(res, 200, { ok: true, book: publicBook(book) });
        return;
      }
    }

    if (segments[2] === 'activate' && segments.length === 3 && req.method === 'POST') {
      send(res, 200, { ok: true, ...(await activateBook(bookId)) });
      return;
    }

    if (segments[2] === 'characters') {
      if (segments.length === 3 && req.method === 'POST') {
        const character = await upsertCharacter(bookId, body);
        send(res, 200, { ok: true, character });
        return;
      }
      if (segments.length === 4 && (req.method === 'PUT' || req.method === 'PATCH')) {
        const character = await upsertCharacter(bookId, { ...body, id: segments[3] });
        send(res, 200, { ok: true, character });
        return;
      }
      if (segments.length === 4 && req.method === 'DELETE') {
        send(res, 200, { ok: true, ...(await deleteCharacter(bookId, segments[3])) });
        return;
      }
    }

    if (segments[2] === 'branches') {
      if (segments.length === 3 && req.method === 'GET') {
        send(res, 200, { ok: true, branches: book.branches });
        return;
      }
      if (segments.length === 3 && req.method === 'POST') {
        const branch = await upsertBranch(bookId, body);
        send(res, 200, { ok: true, branch });
        return;
      }
      if (segments.length === 4 && (req.method === 'PUT' || req.method === 'PATCH')) {
        const branch = await upsertBranch(bookId, { ...body, id: segments[3] });
        send(res, 200, { ok: true, branch });
        return;
      }
      if (segments.length === 4 && req.method === 'DELETE') {
        send(res, 200, { ok: true, ...(await deleteBranch(bookId, segments[3])) });
        return;
      }
    }

    if (segments[2] === 'locations') {
      if (segments.length === 3 && req.method === 'POST') {
        const location = await upsertLocation(bookId, body);
        send(res, 200, { ok: true, location });
        return;
      }
      if (segments.length === 4 && (req.method === 'PUT' || req.method === 'PATCH')) {
        const location = await upsertLocation(bookId, { ...body, id: segments[3] });
        send(res, 200, { ok: true, location });
        return;
      }
      if (segments.length === 4 && req.method === 'DELETE') {
        send(res, 200, { ok: true, ...(await deleteLocation(bookId, segments[3])) });
        return;
      }
    }

    if (segments[2] === 'chapters') {
      if (segments.length === 3 && req.method === 'GET') {
        send(res, 200, { ok: true, chapters: book.chapters });
        return;
      }
      if (segments.length === 3 && req.method === 'POST') {
        const result = await saveChapter(bookId, body);
        send(res, 200, { ok: true, ...result });
        return;
      }
      if (segments.length === 4) {
        const no = Number(segments[3]);
        if (!Number.isInteger(no) || no < 1) return fail(res, 400, 'BAD_CHAPTER', '章号不合法');
        if (req.method === 'GET') {
          const meta = book.chapters.find((ch) => ch.no === no);
          if (!meta) return fail(res, 404, 'NO_CHAPTER', '章节不存在');
          send(res, 200, { ok: true, chapter: meta, content: await readChapter(bookId, no) });
          return;
        }
        if (req.method === 'PATCH') {
          const result = await updateChapterMeta(bookId, no, body);
          send(res, 200, { ok: true, ...result });
          return;
        }
        if (req.method === 'PUT') {
          const result = await saveChapter(bookId, { ...body, no, overwrite: true });
          send(res, 200, { ok: true, ...result });
          return;
        }
        if (req.method === 'DELETE') {
          send(res, 200, { ok: true, ...(await deleteChapter(bookId, no)) });
          return;
        }
      }
    }

    if (segments[2] === 'context' && segments.length === 3 && req.method === 'GET') {
      const chapter = Number(url.searchParams.get('chapter')) || undefined;
      send(res, 200, { ok: true, context: buildContextPack(book, { chapter }) });
      return;
    }
  }

  // POST /ai
  if (req.method === 'POST' && segments.length === 1 && segments[0] === 'ai') {
    const sessionId = sessionIdOf(url, body);
    const state = await readState();
    const book = resolveBook(state, body.bookId, sessionId);
    if (!book) return fail(res, 404, 'NO_BOOK', '请先选择或新建一本作品');
    const kind = String(body.kind ?? '');
    if (!['title', 'character', 'world', 'style', 'chapter', 'location', 'synopsis', 'logline'].includes(kind)) {
      return fail(res, 400, 'BAD_KIND', `不支持的生成类型：${kind}`);
    }
    try {
      const result = await runAi(getAiContext(), book, {
        kind,
        instruction: body.instruction,
        target: body.target,
        chapter: body.chapter,
        branch: body.branch,
      }, { sessionId, aiRoute: typeof getAiRoute === 'function' ? getAiRoute() : null });
      send(res, 200, { ok: true, ...result });
    } catch (error) {
      fail(res, 502, 'AI_FAILED', error?.message ?? error);
    }
    return;
  }

  // GET /health
  if (req.method === 'GET' && segments.length === 1 && segments[0] === 'health') {
    send(res, 200, { ok: true, plugin: 'dsh-writer-studio', prefix: PREFIX });
    return;
  }

  fail(res, 404, 'NOT_FOUND', `未知接口：${req.method} ${url.pathname}`);
}

export function registerServerApi(ctx, deps = {}) {
  const getAiContext = typeof deps.getAiContext === 'function' ? deps.getAiContext : () => ctx;
  const getAiRoute = typeof deps.getAiRoute === 'function' ? deps.getAiRoute : () => null;
  ctx.inject(['webServer', 'connection'], (wctx) => {
    wctx.effect(() => wctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        const rejection = wctx.connection.requestRejection({ headers: req.headers });
        if (rejection !== undefined) {
          res.writeHead(rejection, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(JSON.stringify({
            ok: false,
            error: {
              code: rejection === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
              message: '需要有效的 DSH connection 认证',
            },
          }));
          return;
        }
        try {
          await handle(req, res, getAiContext, getAiRoute);
        } catch (error) {
          try { console.error('[writer-studio] api error:', error); } catch { /* ignore */ }
          if (!res.headersSent) fail(res, 500, 'INTERNAL', error?.message ?? String(error));
          else try { res.end(); } catch { /* ignore */ }
        }
      },
    }), 'dsh-writer-studio: server-api');
  });
}

export { PREFIX, FENCE };
