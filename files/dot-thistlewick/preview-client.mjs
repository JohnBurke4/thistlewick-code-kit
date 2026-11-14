// thistlewick-preview-client@2
// The live preview's client: carries the preview relay's page requests to
// this session's app on 127.0.0.1:<port>, and its answers back, adding the
// feedback overlay's script tag to HTML pages and answering /__feedback/
// itself. Run as `node --use-env-proxy .thistlewick/preview-client.mjs <port>`.
// It reads only /tmp/assistant-launch/preview.json, which relay.md's script
// writes, and /tmp/preview-feedback/, and prints counts only. It stops at the
// preview's end; only the relay's deadline counts. Plain Node, no dependencies.
// `node .thistlewick/preview-client.mjs feedback wait | reply <id> | done` is
// the session's side of that folder, and never reads preview.json.
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { gzipSync } from 'node:zlib';

const PREVIEW_JSON = '/tmp/assistant-launch/preview.json';
// Test only: read preview.json from this folder, keep feedback in its feedback/,
// and reach a loopback relay over plain http.
const TEST_DIR = process.env.THISTLEWICK_PREVIEW_TEST_DIR;
const FEEDBACK_DIR = TEST_DIR === undefined ? '/tmp/preview-feedback' : `${TEST_DIR}/feedback`;

const POLLS = 16;
const RETRY_MS = 1_000;
const SILENCE_MS = 2 * 60_000;
const POLL_TIMEOUT_MS = 40_000;
const TARGET_TIMEOUT_MS = 25_000;
const BODY_MAX = 16 * 1024 * 1024;
const GZIP_MIN = 1024;

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREVIEW_KEY = /^[1-9][0-9]{0,18}\.[0-9a-f]{64}$/;
const RELAY_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\]):[1-9][0-9]{0,4}$/;
const PREVIEW_ORIGIN = /^https:\/\/(?:[a-z0-9-]+\.)+run\.app$/;
const LOOPBACK_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):[1-9][0-9]{0,4}$/;
const REQUEST_ID = /^[0-9a-f]{32}$/;
// Types already compressed, which gzip only slows.
const COMPRESSED =
  /^(?:image\/(?!svg\+xml)|video\/|audio\/|font\/woff2?$|application\/(?:zip|gzip|x-gzip|zstd|x-bzip2|x-xz|x-7z-compressed|x-rar-compressed)$)/;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

function stop(code, line) {
  console.log(line);
  process.exit(code);
}

const FEEDBACK_ID = /^[0-9a-f]{32}$/;
const COMMENT_FILE = /^([0-9a-f]{32})\.json$/;
const COMMENTS_MAX = 200;
const POST_MAX = 32 * 1024;
const STORED_MAX = 64 * 1024;
const TEXT_MAX = 2_000;
const WAIT_SHOWN = 10;
const WAIT_BYTES = 16 * 1024;
const WAIT_TICK_MS = 1_000;
const WAIT_MS = 25 * 60_000;
// The joiner and VS1-16 stay allowed, since ordinary emoji are built with them.
const REFUSED = /(?![\n\t\u200d\ufe00-\ufe0f])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
const ESCAPED =
  /(?![\u200d\ufe00-\ufe0f])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}]/gu;

const randomHex = () => randomBytes(16).toString('hex');
const feedbackPath = (name) => `${FEEDBACK_DIR}/${name}`;

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Made 0700 when new; false unless it is a real 0700 directory of this user.
function feedbackFolder() {
  try {
    mkdirSync(FEEDBACK_DIR, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') return false;
  }
  try {
    const stat = lstatSync(FEEDBACK_DIR);
    return stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700;
  } catch {
    return false;
  }
}

// Never through a symlink or a hard link; null when missing, not one regular file, or over max.
function readStored(name, max = STORED_MAX) {
  let fd;
  try {
    fd = openSync(
      feedbackPath(name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = fstatSync(fd);
    return stat.isFile() && stat.nlink === 1 && stat.size <= max ? readFileSync(fd) : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readStoredJson(name) {
  try {
    return JSON.parse(readStored(name)?.toString('utf8') ?? 'null');
  } catch {
    return null;
  }
}

function writeStored(name, text) {
  const temp = feedbackPath(`.${randomHex()}.tmp`);
  writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
  renameSync(temp, feedbackPath(name));
}

function isDone() {
  try {
    lstatSync(feedbackPath('done'));
    return true;
  } catch {
    return false;
  }
}

const points = (text) => [...text].length;
const isText = (value, max) => typeof value === 'string' && points(value) <= max;
const isNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
const isList = (value, max, each) =>
  Array.isArray(value) && value.length <= max && value.every(each);

function isShape(value, keys) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

const isBox = (value) =>
  isShape(value, ['x', 'y', 'w', 'h']) && Object.values(value).every(isNumber);

function isFeedbackText(value) {
  return (
    isText(value, TEXT_MAX) && value.trim() !== '' && value.isWellFormed() && !REFUSED.test(value)
  );
}

function isElement(value) {
  const { pin, markup, ancestors, box, styles, neighbours } = value ?? {};
  return (
    isShape(value, ['pin', 'markup', 'ancestors', 'box', 'styles', 'neighbours']) &&
    isShape(pin, ['tag', 'text']) &&
    isText(pin.tag, 80) &&
    isText(pin.text, 80) &&
    typeof markup === 'string' &&
    Buffer.byteLength(markup) <= 2048 &&
    isList(
      ancestors,
      6,
      (each) =>
        isShape(each, ['tag', 'id', 'classes']) &&
        [each.tag, each.id, each.classes].every((field) => isText(field, 100)),
    ) &&
    isBox(box) &&
    typeof styles === 'object' &&
    styles !== null &&
    !Array.isArray(styles) &&
    Object.keys(styles).length <= 20 &&
    Object.entries(styles).every(
      ([name, style]) => /^[a-z-]{1,40}$/.test(name) && isText(style, 100),
    ) &&
    isList(
      neighbours,
      6,
      (each) =>
        isShape(each, ['tag', 'text', 'box']) &&
        isText(each.tag, 100) &&
        isText(each.text, 80) &&
        isBox(each.box),
    )
  );
}

function isComment(value) {
  return (
    isShape(value, ['text', 'route', 'viewport', 'element', 'console', 'failed']) &&
    isFeedbackText(value.text) &&
    isText(value.route, 300) &&
    isShape(value.viewport, ['w', 'h']) &&
    isNumber(value.viewport.w) &&
    isNumber(value.viewport.h) &&
    (value.element === null || isElement(value.element)) &&
    isList(value.console, 5, (each) => isText(each, 300)) &&
    isList(
      value.failed,
      5,
      (each) =>
        isShape(each, ['method', 'path', 'status']) &&
        typeof each.method === 'string' &&
        /^[A-Z]{1,16}$/.test(each.method) &&
        isText(each.path, 200) &&
        !each.path.includes('?') &&
        Number.isInteger(each.status) &&
        each.status >= 0 &&
        each.status <= 999,
    )
  );
}

function storedComments() {
  const names = new Set(readdirSync(FEEDBACK_DIR));
  const comments = [];
  for (const name of names) {
    const id = COMMENT_FILE.exec(name)?.[1];
    if (id === undefined) continue;
    const comment = readStoredJson(name);
    if (comment?.id !== id || typeof comment.at !== 'string') continue;
    comments.push({ comment, seen: names.has(`${id}.seen`) });
  }
  return comments.sort(
    (a, b) => a.comment.at.localeCompare(b.comment.at) || a.comment.id.localeCompare(b.comment.id),
  );
}

const escapedJson = (value) =>
  JSON.stringify(value).replace(ESCAPED, (character) =>
    character
      .split('')
      .map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`)
      .join(''),
  );

function printComments(unseen) {
  const marker = randomHex();
  const lines = [];
  let room = WAIT_BYTES - 512;
  for (const { comment } of unseen.slice(0, WAIT_SHOWN)) {
    const { id, at, text, route, viewport, element, console: logged, failed } = comment;
    const full = escapedJson({ id, at, text, route, viewport, element, console: logged, failed });
    const line =
      Buffer.byteLength(full) < room
        ? full
        : escapedJson({ id, at, text, context: 'left out: over the output limit' });
    if (Buffer.byteLength(line) >= room) break;
    lines.push(line);
    room -= Buffer.byteLength(line) + 1;
  }
  console.log(
    [
      `Feedback: ${String(lines.length)} new comment${lines.length === 1 ? '' : 's'}, one JSON line each, between the two lines marked ${marker}.`,
      `BEGIN FEEDBACK ${marker}`,
      ...lines,
      `END FEEDBACK ${marker}`,
    ].join('\n'),
  );
  for (const { comment } of unseen.slice(0, lines.length)) writeStored(`${comment.id}.seen`, '');
  return unseen.length - lines.length;
}

async function waitForFeedback() {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    let done;
    let left = 0;
    try {
      // Done first: once it is there no comment is added, so none printed after it is missed.
      done = isDone();
      const unseen = storedComments().filter(({ seen }) => !seen);
      if (unseen.length > 0) left = printComments(unseen);
      if (unseen.length > 0 && left === 0 && !done) {
        stop(0, 'Feedback wait ended: run it again to keep listening.');
      }
    } catch {
      stop(1, 'Feedback is not available: its folder can not be read.');
    }
    if (left > 0) stop(0, 'More comments are waiting: run feedback wait again.');
    if (done) stop(0, 'Feedback closed: Looks good was confirmed, or feedback done was run.');
    if (Date.now() >= deadline) stop(0, 'No feedback for 25 minutes: run feedback wait again.');
    await sleep(WAIT_TICK_MS);
  }
}

function sendReply(id) {
  if (readStored(`${id}.json`) === null) stop(1, 'Reply refused: no comment has that id.');
  const file = `${id}.reply.txt`;
  const bytes = readStored(file, TEXT_MAX * 4 + 64);
  rmSync(feedbackPath(file), { force: true });
  if (bytes === null) {
    stop(1, 'Reply refused: the reply file is missing, not one regular file, or too long.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trimEnd();
  } catch {
    stop(1, 'Reply refused: the reply file is not UTF-8.');
  }
  if (!isFeedbackText(text)) {
    stop(1, 'Reply refused: it is empty, over 2,000 characters, or holds a refused character.');
  }
  writeStored(`${id}.reply.json`, JSON.stringify({ text, at: new Date().toISOString() }));
  stop(0, 'Reply sent.');
}

async function feedbackHelper([verb, id, ...rest]) {
  const shaped = verb === 'reply' ? id !== undefined && rest.length === 0 : id === undefined;
  if (!['wait', 'reply', 'done'].includes(verb) || !shaped) {
    stop(2, 'Usage: node .thistlewick/preview-client.mjs feedback wait | reply <id> | done');
  }
  if (verb === 'reply' && !FEEDBACK_ID.test(id)) {
    stop(2, 'Reply refused: that is not a comment id.');
  }
  if (!feedbackFolder()) stop(1, 'Feedback is not available: its folder is not safe.');
  if (verb === 'done') {
    try {
      writeStored('done', new Date().toISOString());
    } catch {
      stop(1, 'Feedback is not available: its folder can not be written.');
    }
    stop(0, 'Feedback closed: the overlay takes no more comments.');
  }
  if (verb === 'reply') {
    try {
      sendReply(id);
    } catch {
      stop(1, 'Reply refused: its folder can not be written.');
    }
  }
  await waitForFeedback();
}

// The helper never reads preview.json, so it runs before anything does.
if (process.argv[2] === 'feedback') await feedbackHelper(process.argv.slice(3));

const port = Number(process.argv[2]);
if (!/^[1-9][0-9]{0,4}$/.test(process.argv[2] ?? '') || port > 65535) {
  stop(2, 'Usage: node --use-env-proxy .thistlewick/preview-client.mjs <port>');
}

function readPreview() {
  try {
    const path = TEST_DIR === undefined ? PREVIEW_JSON : `${TEST_DIR}/preview.json`;
    const {
      run_id: runId,
      preview_key: key,
      relay_host: host,
    } = JSON.parse(readFileSync(path, 'utf8'));
    const hostShape = TEST_DIR === undefined ? RELAY_HOST : LOOPBACK_HOST;
    if (
      typeof runId === 'string' &&
      RUN_ID.test(runId) &&
      typeof key === 'string' &&
      PREVIEW_KEY.test(key) &&
      typeof host === 'string' &&
      host.length <= 100 &&
      hostShape.test(host)
    ) {
      return {
        runId,
        key,
        base: `${TEST_DIR === undefined ? 'https' : 'http'}://${host}`,
      };
    }
  } catch {
    // Missing or unreadable reads as not valid.
  }
  return null;
}

const preview = readPreview();
if (preview === null) stop(1, 'The preview can not start: preview.json is missing or not valid.');

// Each preview starts open to comments; earlier ones stay listed.
try {
  if (!feedbackFolder()) throw new Error('not safe');
  rmSync(feedbackPath('done'), { force: true });
} catch {
  stop(1, 'The preview can not start: its feedback folder is not safe.');
}
// Sent back on every feedback POST, so a tab from an earlier preview is told to reload.
const previewValue = randomHex();
const OVERLAY_TAG = Buffer.from(
  `<script src="/__feedback/overlay.js?p=${previewValue}" defer></script>`,
);

const target = `127.0.0.1:${String(port)}`;
const auth = {
  'x-thistlewick-run': preview.runId,
  'x-thistlewick-preview-key': preview.key,
};
const agent = new http.Agent({ keepAlive: true, maxSockets: POLLS });
const counts = { requests: 0, failed: 0 };
let latestEnd = 0;
let lastAnswer = Date.now();

function finish(reason) {
  stop(
    0,
    `Preview client stopped: ${reason}. Requests: ${String(counts.requests)}, failed: ${String(counts.failed)}.`,
  );
}

function noteEnd(value) {
  const at = value === null ? Number.NaN : Date.parse(value);
  if (Number.isFinite(at) && at > latestEnd) latestEnd = at;
}

function isOrigin(value) {
  return PREVIEW_ORIGIN.test(value) || (TEST_DIR !== undefined && LOOPBACK_ORIGIN.test(value));
}

function acceptsGzip(value) {
  if (typeof value !== 'string') return false;
  return value.split(',').some((part) => {
    const [coding = '', ...params] = part.split(';').map((each) => each.trim().toLowerCase());
    const q = params.find((param) => param.startsWith('q='));
    return coding === 'gzip' && (q === undefined || Number(q.slice(2)) > 0);
  });
}

// A loopback Host, and the preview origin's Origin made the app's own.
function targetHeaders(request, origin) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string' && !HOP_BY_HOP.has(name.toLowerCase())) {
      headers[name.toLowerCase()] = value;
    }
  }
  headers.host = target;
  // A page comes back uncompressed, so the overlay's tag can go in; it is gzipped on the way out.
  if (request.method === 'GET' && headers['sec-fetch-dest'] === 'document') {
    delete headers['accept-encoding'];
  }
  if (origin !== null && headers.origin === origin) headers.origin = `http://${target}`;
  if (request.body.length > 0 || !['GET', 'HEAD'].includes(request.method)) {
    headers['content-length'] = String(request.body.length);
  }
  return headers;
}

const failed = (status) => {
  counts.failed += 1;
  return { status, headers: {}, body: Buffer.alloc(0) };
};

function forward(request, origin) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (answer) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    const fail = (status) => {
      if (!settled) settle(failed(status));
    };
    let outgoing;
    try {
      outgoing = http.request(
        {
          host: '127.0.0.1',
          port,
          agent,
          method: request.method,
          path: request.path,
          headers: targetHeaders(request, origin),
          timeout: TARGET_TIMEOUT_MS,
        },
        (response) => {
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > BODY_MAX) {
              fail(502);
              response.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on('error', () => {
            fail(502);
          });
          response.on('end', () => {
            settle(answerOf(request, response, Buffer.concat(chunks)));
          });
        },
      );
    } catch {
      fail(502);
      return;
    }
    outgoing.on('timeout', () => {
      fail(504);
      outgoing.destroy();
    });
    outgoing.on('error', () => {
      fail(502);
    });
    outgoing.end(request.body);
  });
}

function withOverlay(body) {
  const at = body.toString('latin1').toLowerCase().lastIndexOf('</body>');
  return at < 0
    ? Buffer.concat([body, OVERLAY_TAG])
    : Buffer.concat([body.subarray(0, at), OVERLAY_TAG, body.subarray(at)]);
}

// Gzipped when the browser takes gzip and the app sent it uncompressed.
function answerOf(request, response, body) {
  const headers = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name)) headers[name] = value;
  }
  const status = response.statusCode ?? 502;
  const encoding = headers['content-encoding'];
  const type = String(headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (
    request.method === 'GET' &&
    status === 200 &&
    type === 'text/html' &&
    request.headers['sec-fetch-dest'] === 'document' &&
    (encoding === undefined || encoding === 'identity')
  ) {
    body = withOverlay(body);
    delete headers.etag;
  }
  if (
    !COMPRESSED.test(type) &&
    acceptsGzip(request.headers['accept-encoding']) &&
    (encoding === undefined || encoding === 'identity') &&
    body.length >= GZIP_MIN &&
    request.method !== 'HEAD' &&
    status !== 204 &&
    status !== 304
  ) {
    const vary = typeof headers.vary === 'string' ? `${headers.vary}, ` : '';
    return {
      status,
      headers: {
        ...headers,
        'content-encoding': 'gzip',
        vary: `${vary}Accept-Encoding`,
      },
      body: gzipSync(body),
    };
  }
  return { status, headers, body };
}

function pageRequestOf(value) {
  if (typeof value !== 'object' || value === null) return null;
  const { id, method, path, headers, body } = value;
  if (
    typeof id !== 'string' ||
    !REQUEST_ID.test(id) ||
    typeof method !== 'string' ||
    !/^[A-Z]{1,16}$/.test(method) ||
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    typeof headers !== 'object' ||
    headers === null ||
    typeof body !== 'string'
  ) {
    return null;
  }
  return { id, method, path, headers, body: Buffer.from(body, 'base64') };
}

// The overlay, served as its own source and run in the page, so it closes over
// nothing. It calls only /__feedback/ and keeps its events from the app.
function overlay() {
  const TEXT_MAX = 2_000;
  const POST_MAX = 32 * 1024;
  const POLL_MS = 5_000;
  const ENDED_POLL_MS = 30_000;
  const POLL_TIMEOUT_MS = 10_000;
  const FAILED_POLLS = 3;
  const TAP_PX = 10;
  const CONFIRM_GUARD_MS = 400;
  const REFUSED = /(?![\n\t\u200d\ufe00-\ufe0f])[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
  const STYLES = [
    'display',
    'position',
    'box-sizing',
    'width',
    'height',
    'margin',
    'padding',
    'border',
    'border-radius',
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'text-align',
    'gap',
    'align-items',
    'justify-content',
    'opacity',
  ];
  const SAYS = {
    bad: "Couldn't send this comment. Try again, or ask in the session.",
    full: 'This preview has taken 200 comments. Ask in the session.',
    done: 'Comments are closed: the session is opening the PR.',
    stale: 'This tab belongs to an earlier preview. Reload.',
    unreachable: "Couldn't reach the preview. Try again.",
    ended: 'The preview has ended. Your comments stay listed.',
  };
  const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];
  const POINTER_EVENTS = [
    'pointerdown',
    'pointerup',
    'pointermove',
    'pointerover',
    'pointerout',
    'pointercancel',
    'mousedown',
    'mouseup',
    'mousemove',
    'mouseover',
    'mouseout',
    'click',
    'dblclick',
    'auxclick',
    'contextmenu',
    'touchstart',
    'touchmove',
    'touchend',
    'touchcancel',
  ];

  let preview = '';
  try {
    preview = new URL(document.currentScript.src).searchParams.get('p') ?? '';
  } catch {
    preview = '';
  }

  const encoder = new TextEncoder();
  const bytes = (text) => encoder.encode(text).length;
  const cut = (value, max) => {
    const text = String(value ?? '');
    const points = [...text.slice(0, max * 2 + 2)];
    return points.length <= max ? text : `${points.slice(0, max - 1).join('')}…`;
  };
  const cutBytes = (text, max) => {
    if (bytes(text) <= max) return text;
    let kept = '';
    let size = 3;
    for (const point of text.slice(0, max)) {
      size += bytes(point);
      if (size > max) break;
      kept += point;
    }
    return `${kept}…`;
  };
  const wellFormed = (text) =>
    typeof text.toWellFormed === 'function' ? text.toWellFormed() : text;

  const logged = [];
  const failed = [];
  const keep = (list, item) => {
    list.push(item);
    if (list.length > 5) list.shift();
  };
  // Bounded while it walks, so a huge object never costs more than a few hundred characters.
  const shown = (value) => {
    if (typeof value === 'string') return value.slice(0, 300);
    if (value instanceof Error) {
      return String(value.stack || `${value.name}: ${value.message}`).slice(0, 300);
    }
    let room = 300;
    try {
      const json = JSON.stringify(value, (key, each) => {
        if (room <= 0) return undefined;
        room -= key.length + (typeof each === 'string' ? Math.min(each.length, 100) : 8);
        return typeof each === 'string' ? each.slice(0, 100) : each;
      });
      return String(json ?? value).slice(0, 300);
    } catch {
      return Object.prototype.toString.call(value);
    }
  };
  const noteConsole = (values) => {
    try {
      keep(logged, cut(values.slice(0, 3).map(shown).join(' '), 300));
    } catch {
      // Never in the app's way.
    }
  };
  const noteFailed = (method, url, status) => {
    try {
      const address = new URL(String(url), location.href);
      if (!/^https?:$/.test(address.protocol) || address.origin !== location.origin) return;
      const path = address.pathname;
      if (/^\/__feedback(?:\/|$)/i.test(path)) return;
      const verb = String(method || 'GET').toUpperCase();
      keep(failed, {
        method: /^[A-Z]{1,16}$/.test(verb) ? verb : 'OTHER',
        path: cut(path, 200),
        status: Number.isInteger(status) && status >= 0 && status <= 999 ? status : 0,
      });
    } catch {
      // Never in the app's way.
    }
  };

  const appError = console.error;
  console.error = function (...values) {
    noteConsole(values);
    return appError.apply(this, values);
  };
  window.addEventListener('error', (event) => {
    noteConsole([event.error instanceof Error ? event.error : event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    noteConsole(['Unhandled rejection:', event.reason]);
  });

  const pageFetch = window.fetch;
  window.fetch = function (input, init) {
    const answer = pageFetch.apply(window, arguments);
    try {
      const request = input instanceof Request ? input : null;
      const method = init?.method ?? request?.method ?? 'GET';
      const url = request?.url ?? input;
      answer.then(
        (response) => {
          if (!response.ok && !response.type.startsWith('opaque')) {
            noteFailed(method, url, response.status);
          }
        },
        (error) => {
          if (error?.name !== 'AbortError') noteFailed(method, url, 0);
        },
      );
    } catch {
      // Never in the app's way.
    }
    return answer;
  };
  const xhr = window.XMLHttpRequest?.prototype;
  if (xhr !== undefined) {
    const open = xhr.open;
    const opened = new WeakMap();
    xhr.open = function (method, url) {
      if (!opened.has(this)) {
        this.addEventListener('abort', () => {
          opened.get(this).aborted = true;
        });
        this.addEventListener('loadend', () => {
          const request = opened.get(this);
          if (!request.aborted && (this.status === 0 || this.status >= 400)) {
            noteFailed(request.method, request.url, this.status);
          }
        });
      }
      opened.set(this, { method, url, aborted: false });
      return open.apply(this, arguments);
    };
  }

  const make = (tag, className = '', text = '') => {
    const element = document.createElement(tag);
    if (className !== '') element.className = className;
    if (text !== '') element.textContent = text;
    return element;
  };
  const button = (className, text, act, label = '') => {
    const element = make('button', className, text);
    element.type = 'button';
    element.dataset.act = act;
    if (label !== '') element.setAttribute('aria-label', label);
    return element;
  };
  const row = (...children) => {
    const element = make('div', 'row');
    element.append(...children);
    return element;
  };
  const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
  };
  const setRect = (element, rect) => {
    element.style.setProperty('left', `${String(rect.left)}px`);
    element.style.setProperty('top', `${String(rect.top)}px`);
    element.style.setProperty('width', `${String(rect.width)}px`);
    element.style.setProperty('height', `${String(rect.height)}px`);
  };

  const host = document.createElement('thistlewick-feedback');
  host.style.setProperty('display', 'none', 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  // Adopted rather than linked: a <link> reloads on every move into or out of a dialog.
  const styleSheet = async () => {
    try {
      const response = await pageFetch.call(window, '/__feedback/overlay.css', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('not loaded');
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(await response.text());
      shadow.adoptedStyleSheets = [sheet];
      host.style.removeProperty('display');
    } catch {
      setTimeout(() => void styleSheet(), POLL_MS);
    }
  };
  const root = make('div', 'root');
  const live = make('div', 'sr');
  live.setAttribute('aria-live', 'polite');
  const pinLine = make('div', 'outline');
  const hoverLine = make('div', 'outline hover');
  const hoverTag = make('div', 'label');
  const pill = button('pill', 'Feedback', 'open');
  const dot = make('span', 'dot');
  pill.append(dot);
  const hint = make('div', 'hint');
  const hintText = make('span');
  const cancel = button('', 'Cancel', 'cancel');
  hint.append(hintText, cancel);
  const panel = make('section', 'panel');
  panel.setAttribute('aria-label', 'Feedback');
  const head = row(make('h2', '', 'Feedback'), button('icon', '×', 'fold', 'Close feedback'));
  const chip = make('div', 'chip');
  const chipText = make('span', 'chip-text');
  chip.append(chipText, button('icon', '×', 'unpin', 'Remove the pin'));
  const box = make('textarea');
  box.rows = 4;
  box.dir = 'auto';
  box.setAttribute('aria-label', 'Comment');
  const count = make('div', 'count');
  const message = make('p', 'message');
  message.setAttribute('role', 'alert');
  const pick = button('', 'Pick element', 'pick');
  const sendButton = button('primary', 'Send', 'send');
  const finishLead = make('p', 'muted', 'Done reviewing?');
  const looksGood = button('wide', 'Looks good, open the PR', 'confirm');
  const finishNote = make('p', 'muted', 'Send or clear your comment first');
  const yes = button('primary', 'Yes, open the PR', 'done');
  const notYet = button('', 'Not yet', 'not-yet');
  const finishError = make('p', 'message');
  finishError.setAttribute('role', 'alert');
  const confirmBox = make('div', 'confirm');
  confirmBox.append(
    make('p', '', 'Open the PR now? Comments close.'),
    row(yes, notYet),
    finishError,
  );
  const OPENING =
    "Sent to the session: it opens the PR next. Comments are closed. The PR link is on the session's page.";
  const opening = make('p', 'opening', OPENING);
  opening.tabIndex = -1;
  const finish = make('div', 'section');
  finish.append(finishLead, looksGood, finishNote, confirmBox, opening);
  const listHead = make('p', 'muted', 'Your comments, newest first');
  const empty = make(
    'p',
    'muted',
    'No comments yet. Pick an element, or just type what to change, then Send.',
  );
  const list = make('ul', 'list');
  const listArea = make('div', 'section list-area');
  listArea.append(listHead, empty, list);
  panel.append(
    head,
    make('p', 'muted', 'No reply? Ask in the session.'),
    chip,
    box,
    count,
    message,
    row(pick, sendButton),
    finish,
    listArea,
  );
  root.append(live, pinLine, hoverLine, hoverTag, pill, hint, panel);
  shadow.append(root);
  document.documentElement.append(host);

  let panelOpen = false;
  let picking = false;
  let pressed = null;
  let swallowing = false;
  let swallowTimer = 0;
  let pinned = null;
  let sending = false;
  let finishing = false;
  let confirming = false;
  let sentDone = false;
  let known = false;
  let done = false;
  let ended = false;
  let failedPolls = 0;
  let error = '';
  let finishFailure = '';
  let stale = false;
  let confirmAt = 0;
  let hovered = null;
  let dotOn = false;
  let comments = [];
  let ownSent = [];
  let listed = '';

  const classesOf = (element) =>
    (element.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
  const nameOf = (element, max) =>
    cut(
      `${element.localName}${element.id ? `#${element.id}` : ''}${classesOf(element)
        .slice(0, 2)
        .map((name) => `.${name}`)
        .join('')}`,
      max,
    );
  // Never what was typed: no field's value, a textarea's text or an editable element's contents.
  const FIELDS = new Set(['input', 'textarea', 'select']);
  const HIDDEN_TEXT = new Set(['textarea', 'script', 'style', 'noscript', 'template']);
  const EDITABLE = '[contenteditable]:not([contenteditable="false" i])';
  const textOf = (element) => {
    let text = '';
    if (!FIELDS.has(element.localName)) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (text.length < 1_000 && walker.nextNode() !== null) {
        const parent = walker.currentNode.parentElement;
        if (
          parent !== null &&
          !HIDDEN_TEXT.has(parent.localName) &&
          parent.closest(EDITABLE) === null
        ) {
          text += ` ${walker.currentNode.data}`;
        }
      }
    }
    return cut(
      text.slice(0, 1_000).replace(/\s+/g, ' ').trim() ||
        element.getAttribute('aria-label') ||
        element.getAttribute('placeholder') ||
        element.getAttribute('title') ||
        '',
      80,
    );
  };
  // A copy in an inert document, so no custom element runs, with every typed value taken out.
  const markupOf = (element) => {
    const copy = document.implementation.createHTMLDocument('').importNode(element, true);
    for (const each of [copy, ...copy.querySelectorAll('*')]) {
      if (each.localName === 'thistlewick-feedback') each.remove();
      else if (each.localName === 'input') each.removeAttribute('value');
      else if (each.localName === 'textarea') each.textContent = '';
      else if (each.localName === 'meta') each.removeAttribute('content');
      each.removeAttribute('selected');
      each.removeAttribute('checked');
      if (each.matches(EDITABLE)) each.replaceChildren();
    }
    // The copy lost its ancestors, so an editable one is checked on the page.
    if ((element.parentElement?.closest(EDITABLE) ?? null) !== null) copy.replaceChildren();
    return cutBytes(copy.outerHTML, 2048);
  };
  const clamp = (value) => Math.max(-1e7, Math.min(1e7, Math.round(value) || 0));
  const boxOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: clamp(rect.x), y: clamp(rect.y), w: clamp(rect.width), h: clamp(rect.height) };
  };
  const viewportOf = () => ({ w: clamp(window.innerWidth), h: clamp(window.innerHeight) });

  const elementOf = (element) => {
    const ancestors = [];
    for (let node = element; ancestors.length < 6;) {
      const rootNode = node.getRootNode();
      node = node.parentElement ?? (rootNode instanceof ShadowRoot ? rootNode.host : null);
      if (node === null) break;
      ancestors.push({
        tag: cut(node.localName, 100),
        id: cut(node.id, 100),
        classes: cut(classesOf(node).join(' '), 100),
      });
    }
    const computed = getComputedStyle(element);
    const styles = {};
    for (const name of STYLES) styles[name] = cut(computed.getPropertyValue(name), 100);
    const siblings = [...(element.parentNode?.children ?? [])].filter((each) => each !== host);
    const at = siblings.indexOf(element);
    const near = [];
    for (let step = 1; near.length < 6 && step < siblings.length; step += 1) {
      for (const each of [siblings[at - step], siblings[at + step]]) {
        if (each !== undefined && near.length < 6) near.push(each);
      }
    }
    return {
      pin: { tag: nameOf(element, 80), text: textOf(element) },
      markup: markupOf(element),
      ancestors,
      box: boxOf(element),
      styles,
      neighbours: near.map((each) => ({
        tag: nameOf(each, 100),
        text: textOf(each),
        box: boxOf(each),
      })),
    };
  };
  const contextOf = (element) => ({
    element: element === null ? null : elementOf(element),
    console: [...logged],
    failed: failed.map((each) => ({ ...each })),
    viewport: viewportOf(),
  });

  // The query's keys only: its values may be anything the page put there.
  const routeOf = () => {
    const keys = [...new URLSearchParams(location.search).keys()];
    const query = keys.map((key) => `${encodeURIComponent(key)}=`).join('&');
    return cut(`${location.pathname}${query === '' ? '' : `?${query}`}`, 300);
  };

  // Over the POST limit, context goes first, least useful first, until it fits.
  const bodyOf = (text) => {
    const context = pinned?.context ?? contextOf(null);
    const value = {
      text,
      route: routeOf(),
      viewport: context.viewport,
      element: context.element === null ? null : { ...context.element },
      console: context.console,
      failed: context.failed,
    };
    const drops = [
      { neighbours: [] },
      { markup: '' },
      { styles: {} },
      { ancestors: [] },
      { console: [] },
      { failed: [] },
      { element: null },
    ];
    let json = JSON.stringify(value);
    for (const drop of drops) {
      if (bytes(json) <= POST_MAX) break;
      const [[key, emptied]] = Object.entries(drop);
      if (Object.hasOwn(value, key)) value[key] = emptied;
      else if (value.element !== null) value.element[key] = emptied;
      json = JSON.stringify(value);
    }
    return json;
  };

  const cleanText = () => wellFormed(box.value.replace(REFUSED, '')).trim();
  const closed = () => done || sentDone;
  const canSend = () => {
    const text = cleanText();
    return text !== '' && [...text].length <= TEXT_MAX && !sending && !closed() && !ended && !stale;
  };

  const track = () => {
    if (picking && hovered !== null) hoverOn(hovered);
    const rect = pinned?.element.isConnected ? pinned.element.getBoundingClientRect() : null;
    const showing = rect !== null && !picking && (rect.width > 0 || rect.height > 0);
    pinLine.hidden = !showing;
    if (showing) setRect(pinLine, rect);
    if (pinned !== null) {
      const label = `${pinned.pin.tag}${pinned.pin.text === '' ? '' : ` · ${pinned.pin.text}`}`;
      setText(
        chipText,
        `Pinned: ${label}${pinned.element.isConnected ? '' : ' (no longer on the page)'}`,
      );
    }
  };

  const itemOf = (comment) => {
    const item = make('li');
    const state = comment.reply !== null ? 'Replied' : comment.seen ? 'Seen' : 'Sent';
    const text = make('span', 'text', comment.text);
    text.dir = 'auto';
    item.append(row(text, make('span', 'state', state)));
    if (comment.pin !== null) {
      const on = `${comment.pin.tag}${comment.pin.text === '' ? '' : ` · ${comment.pin.text}`}`;
      item.append(make('div', 'muted', `On ${on}`));
    }
    if (comment.reply !== null) {
      const reply = make('div', 'reply', `Claude: ${comment.reply}`);
      reply.dir = 'auto';
      item.append(reply);
    }
    return item;
  };
  const renderList = () => {
    const all = [...ownSent, ...comments];
    empty.hidden = !known || all.length > 0;
    listHead.hidden = all.length === 0;
    const signature = JSON.stringify(all);
    if (signature === listed) return;
    listed = signature;
    list.replaceChildren(...all.map(itemOf));
  };

  const render = () => {
    const text = cleanText();
    const points = [...text].length;
    const hasText = text !== '';
    if (hasText) confirming = false;
    pill.hidden = picking;
    pill.setAttribute('aria-expanded', String(panelOpen));
    pill.setAttribute('aria-label', dotOn ? 'Feedback, something new' : 'Feedback');
    dot.hidden = !dotOn;
    hint.hidden = !picking;
    setText(
      hintText,
      coarse() ? 'Tap an element to pin it' : 'Click an element to pin it · Esc to cancel',
    );
    panel.hidden = !panelOpen || picking;
    chip.hidden = pinned === null;
    box.readOnly = closed() || sending;
    box.classList.toggle('closed', closed());
    count.hidden = closed();
    setText(count, `${points.toLocaleString('en-US')} / 2,000`);
    count.classList.toggle('over', points > TEXT_MAX);
    sendButton.disabled = !canSend();
    setText(sendButton, sending ? 'Sending…' : 'Send');
    pick.disabled = closed();
    let says = error;
    if (closed()) says = '';
    else if (stale) says = SAYS.stale;
    else if (ended) says = SAYS.ended;
    setText(message, says);
    message.hidden = says === '';
    finishLead.hidden = closed();
    looksGood.hidden = closed() || confirming;
    looksGood.disabled = hasText || ended || stale || !known || finishing;
    finishNote.hidden = closed() || !hasText;
    confirmBox.hidden = closed() || !confirming;
    yes.disabled = finishing || ended || stale;
    setText(finishError, finishFailure);
    finishError.hidden = finishFailure === '';
    opening.hidden = !closed();
    hoverLine.hidden = hoverLine.hidden || !picking;
    hoverTag.hidden = hoverTag.hidden || !picking;
    track();
  };

  const coarse = () => window.matchMedia('(pointer: coarse)').matches;
  // On a phone, focusing the box would open the keyboard over the page.
  const openPanel = (focusBox = true) => {
    panelOpen = true;
    dotOn = false;
    render();
    if (focusBox) box.focus();
  };
  const fold = () => {
    const focused = shadow.activeElement !== null;
    panelOpen = false;
    confirming = false;
    render();
    if (focused) pill.focus();
  };
  const startPicking = () => {
    picking = true;
    pressed = null;
    hovered = null;
    hoverLine.hidden = true;
    hoverTag.hidden = true;
    render();
    cancel.focus();
  };
  const stopPicking = () => {
    picking = false;
    pressed = null;
    hovered = null;
    hoverLine.hidden = true;
    hoverTag.hidden = true;
  };
  const hoverOn = (element) => {
    hovered = element;
    const rect = element.getBoundingClientRect();
    setRect(hoverLine, rect);
    hoverLine.hidden = false;
    setText(hoverTag, nameOf(element, 80));
    hoverTag.hidden = false;
    const width = hoverTag.getBoundingClientRect().width;
    const left = Math.max(0, Math.min(rect.left, window.innerWidth - width));
    const top = rect.top >= 24 ? rect.top - 22 : Math.min(rect.bottom + 2, window.innerHeight - 22);
    hoverTag.style.setProperty('left', `${String(left)}px`);
    hoverTag.style.setProperty('top', `${String(top)}px`);
  };
  // A press on an icon inside a control pins the control.
  const pinTarget = (target) =>
    target instanceof SVGElement
      ? (target.closest('button, a, [role="button"]') ?? target)
      : target;
  const pinOn = (element) => {
    stopPicking();
    const context = contextOf(element);
    pinned = { element, pin: context.element.pin, context };
    // The press's own mouseup, touchend and click come after its pointerup.
    swallowing = true;
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(() => {
      swallowing = false;
    }, 700);
    openPanel();
  };

  const post = (path, body) =>
    pageFetch.call(window, path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-feedback-preview': preview },
      body,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  const isJson = (response) =>
    /^application\/json\b/i.test(response.headers.get('content-type') ?? '');
  const refusalOf = async (response) => {
    let code = null;
    if (isJson(response)) {
      try {
        code = (await response.json())?.error ?? null;
      } catch {
        code = null;
      }
    }
    if (typeof code !== 'string') return SAYS.unreachable;
    if (response.status === 429 && code === 'full') return SAYS.full;
    if (response.status === 409 && code === 'stale_preview') return SAYS.stale;
    if (response.status === 409 && code === 'done') {
      done = true;
      return SAYS.done;
    }
    return SAYS.bad;
  };

  const sendComment = async () => {
    if (!canSend()) return;
    const text = cleanText();
    const sentPin = pinned;
    sending = true;
    render();
    try {
      const response = await post('/__feedback/comments', bodyOf(text));
      if (response.status === 201) {
        const id = await response
          .json()
          .then((value) => value?.id)
          .catch(() => undefined);
        ownSent.unshift({
          id: typeof id === 'string' ? id : `sent-${String(Date.now())}`,
          text,
          pin: sentPin?.pin ?? null,
          seen: false,
          reply: null,
        });
        box.value = '';
        // A pin made while it was sending is for the next comment.
        if (pinned === sentPin) pinned = null;
        error = '';
        sending = false;
        render();
        renderList();
        box.focus();
        return;
      }
      if (response.status === 410) ended = true;
      else error = await refusalOf(response);
    } catch {
      error = SAYS.unreachable;
    }
    sending = false;
    render();
  };

  const finishReview = async () => {
    finishing = true;
    finishFailure = '';
    render();
    try {
      const response = await post('/__feedback/done', '{}');
      if (response.status === 204) sentDone = true;
      else if (response.status === 410) ended = true;
      else finishFailure = await refusalOf(response);
    } catch {
      finishFailure = SAYS.unreachable;
    }
    finishing = false;
    if (closed()) {
      confirming = false;
      finishFailure = '';
      error = '';
      render();
      live.textContent = OPENING;
      opening.focus();
      return;
    }
    render();
  };

  const isStatus = (value) =>
    typeof value === 'object' &&
    value !== null &&
    typeof value.preview === 'string' &&
    typeof value.done === 'boolean' &&
    Array.isArray(value.comments) &&
    value.comments.every(
      (each) =>
        typeof each === 'object' &&
        each !== null &&
        typeof each.id === 'string' &&
        typeof each.text === 'string' &&
        typeof each.seen === 'boolean' &&
        (each.reply === null || typeof each.reply === 'string') &&
        (each.pin === null ||
          (typeof each.pin === 'object' &&
            typeof each.pin.tag === 'string' &&
            typeof each.pin.text === 'string')),
    );
  const take = (status) => {
    const before = new Map([...ownSent, ...comments].map((each) => [each.id, each]));
    const news = [];
    comments = status.comments.map(({ id, text, pin, seen, reply }) => {
      const was = before.get(id);
      if (was !== undefined && was.reply === null && reply !== null) {
        news.push(`The session replied: ${cut(reply, 200)}`);
      } else if (was !== undefined && !was.seen && seen) {
        news.push('The session has seen your comment.');
      }
      return { id, text, pin: pin === null ? null : { tag: pin.tag, text: pin.text }, seen, reply };
    });
    ownSent = ownSent.filter((own) => !comments.some((each) => each.id === own.id));
    done = status.done;
    stale = status.preview !== preview;
    known = true;
    if (news.length > 0) {
      live.textContent = news.join(' ');
      if (!panelOpen || picking) dotOn = true;
    }
  };
  const poll = async () => {
    let good = false;
    let gone = false;
    try {
      const response = await pageFetch.call(window, '/__feedback/status', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal:
          typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(POLL_TIMEOUT_MS)
            : undefined,
      });
      gone = response.status === 410;
      if (response.status === 200 && isJson(response)) {
        const status = await response.json();
        if (isStatus(status)) {
          take(status);
          good = true;
        }
      }
    } catch {
      good = false;
    }
    failedPolls = good ? 0 : failedPolls + 1;
    ended = gone || failedPolls >= FAILED_POLLS;
    render();
    renderList();
    setTimeout(() => void poll(), ended ? ENDED_POLL_MS : POLL_MS);
  };

  const act = (event) => {
    const target = event
      .composedPath()
      .find(
        (node) =>
          node instanceof HTMLElement && node.dataset.act !== undefined && shadow.contains(node),
      );
    if (target === undefined || target.disabled) return;
    const guarded = ['done', 'not-yet'].includes(target.dataset.act);
    if (guarded && performance.now() - confirmAt < CONFIRM_GUARD_MS) return;
    switch (target.dataset.act) {
      case 'open':
        if (panelOpen) fold();
        else openPanel(!coarse());
        break;
      case 'fold':
        fold();
        break;
      case 'pick':
        startPicking();
        break;
      case 'cancel':
        stopPicking();
        openPanel(!coarse());
        break;
      case 'unpin':
        pinned = null;
        render();
        box.focus();
        break;
      case 'send':
        void sendComment();
        break;
      case 'confirm':
        confirming = true;
        confirmAt = performance.now();
        finishFailure = '';
        render();
        notYet.focus();
        break;
      case 'not-yet':
        confirming = false;
        render();
        looksGood.focus();
        break;
      case 'done':
        void finishReview();
        break;
      default:
        break;
    }
  };

  const isOwn = (event) => event.composedPath().includes(host);
  const composing = (event) => event.isComposing || event.keyCode === 229;
  const onKey = (event) => {
    const escape = event.key === 'Escape' && !composing(event);
    if (!isOwn(event) && !(picking && escape)) return;
    event.stopImmediatePropagation();
    if (event.type !== 'keydown') return;
    // A held key must not press the button that a press of it just showed.
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      if (event.composedPath()[0] instanceof HTMLButtonElement) event.preventDefault();
      return;
    }
    if (escape && picking) {
      event.preventDefault();
      stopPicking();
      openPanel(!coarse());
      return;
    }
    if (escape && panelOpen) {
      event.preventDefault();
      fold();
      return;
    }
    if (
      event.key === 'Enter' &&
      (event.ctrlKey || event.metaKey) &&
      !composing(event) &&
      event.composedPath()[0] === box
    ) {
      event.preventDefault();
      void sendComment();
    }
  };
  const pickWith = (event) => {
    const target = event.composedPath()[0];
    const far = (from) => Math.hypot(event.clientX - from.x, event.clientY - from.y) > TAP_PX;
    if (event.type === 'pointerdown') {
      pressed =
        event.button === 0 && target instanceof Element
          ? { id: event.pointerId, x: event.clientX, y: event.clientY, target, moved: false }
          : null;
    } else if (event.type === 'pointermove') {
      if (event.pointerType !== 'touch' && target instanceof Element) hoverOn(pinTarget(target));
      if (pressed?.id === event.pointerId && far(pressed)) pressed.moved = true;
    } else if (event.type === 'pointercancel') {
      pressed = null;
    } else if (event.type === 'pointerup') {
      const press = pressed;
      pressed = null;
      if (press?.id === event.pointerId && !press.moved && !far(press)) {
        pinOn(pinTarget(press.target));
      }
    }
  };
  const onPointer = (event) => {
    if (isOwn(event)) {
      event.stopImmediatePropagation();
      if (event.type === 'click') act(event);
      return;
    }
    if (!picking && !swallowing) return;
    event.stopImmediatePropagation();
    if (event.cancelable && event.type !== 'touchstart' && event.type !== 'touchmove') {
      event.preventDefault();
    }
    if (picking) pickWith(event);
    else if (event.type === 'click') swallowing = false;
  };
  // Focus moving into the overlay must not close the app's menus that close on blur.
  const onFocus = (event) => {
    const into =
      event.type === 'focusout' || event.type === 'blur'
        ? event.relatedTarget === host
        : isOwn(event);
    if (into) event.stopImmediatePropagation();
  };
  for (const type of ['focusout', 'blur', 'focusin', 'focus']) {
    window.addEventListener(type, onFocus, true);
  }
  for (const type of KEY_EVENTS) window.addEventListener(type, onKey, true);
  for (const type of POINTER_EVENTS) {
    window.addEventListener(type, onPointer, {
      capture: true,
      passive: type === 'touchstart' || type === 'touchmove',
    });
  }
  box.addEventListener('input', render);

  let trackFrame = 0;
  const trackSoon = () => {
    if (trackFrame === 0) {
      trackFrame = requestAnimationFrame(() => {
        trackFrame = 0;
        track();
      });
    }
  };
  window.addEventListener('scroll', trackSoon, { capture: true, passive: true });
  window.addEventListener('resize', trackSoon, { passive: true });
  setInterval(() => {
    if (pinned !== null) track();
  }, 1_000);

  // Inside the topmost modal dialog, since the page around one is inert.
  const modals = [];
  const isModal = (dialog) => {
    try {
      return dialog.matches(':modal');
    } catch {
      return dialog.open;
    }
  };
  const placeHost = () => {
    for (let at = modals.length - 1; at >= 0; at -= 1) {
      if (!modals[at].isConnected || !isModal(modals[at])) modals.splice(at, 1);
    }
    for (const dialog of document.querySelectorAll('dialog')) {
      if (!modals.includes(dialog) && isModal(dialog)) modals.push(dialog);
    }
    const parent = modals.at(-1) ?? document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
  };
  new MutationObserver(placeHost).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  document.addEventListener('close', placeHost, true);
  placeHost();

  render();
  renderList();
  void styleSheet();
  void poll();
}

// In px, since the app's root font size is not the overlay's.
const OVERLAY_CSS = `:host {
  all: initial;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2147483647;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
[hidden] {
  display: none !important;
}
.root {
  --bg: #ffffff;
  --fg: #1c1c1a;
  --muted: #5c5c57;
  --line: #cbcbc2;
  --soft: #efefea;
  --accent: #1f5fbf;
  --accent-soft: #e4edfb;
  --bad: #b3261e;
  --good: #1a7f37;
  color: var(--fg);
  font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .root {
    --bg: #222220;
    --fg: #ecece6;
    --muted: #a9a9a2;
    --line: #4a4a45;
    --soft: #31312e;
    --accent: #7aa7f0;
    --accent-soft: #23344f;
    --bad: #f2867f;
    --good: #5cc27a;
  }
}
button {
  min-height: 32px;
  margin: 0;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  cursor: pointer;
}
button:disabled {
  border-style: dashed;
  background: var(--soft);
  color: var(--muted);
  cursor: default;
}
button:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.primary {
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}
.primary:disabled {
  border-color: var(--line);
  background: var(--soft);
}
.icon {
  width: 32px;
  padding: 0;
  border: none;
  background: none;
  font-size: 18px;
  line-height: 1;
}
.wide {
  width: 100%;
}
.pill {
  position: fixed;
  right: 16px;
  bottom: 80px;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-weight: 600;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--accent);
}
.hint {
  position: fixed;
  right: 16px;
  bottom: 80px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 32px);
  padding: 4px 4px 4px 14px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.panel {
  position: fixed;
  right: 16px;
  bottom: 124px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 340px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 140px);
  max-height: calc(100dvh - 140px);
  padding: 12px 16px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
}
@media (max-width: 479.98px) {
  .panel {
    right: 0;
    bottom: 0;
    left: 0;
    width: auto;
    max-width: none;
    max-height: 60vh;
    max-height: 60dvh;
    border-radius: 12px 12px 0 0;
  }
  .panel .list-area {
    flex: none;
    min-height: 0;
    overflow: visible;
  }
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
p {
  margin: 0;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 2px 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--soft);
  font-size: 13px;
}
.chip-text,
.text,
.reply,
.muted,
.message,
.opening {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chip-text {
  flex: 1;
}
textarea {
  display: block;
  width: 100%;
  min-height: 84px;
  margin: 0;
  padding: 8px 10px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
textarea.closed {
  border-style: dashed;
  background: var(--soft);
  color: var(--muted);
}
/* Under 16px, iOS zooms the page when the box takes focus. */
@media (pointer: coarse), (max-width: 479.98px) {
  textarea {
    font-size: 16px;
  }
}
.count {
  margin-top: -4px;
  color: var(--muted);
  font-size: 12px;
  text-align: right;
}
.count.over,
.message {
  color: var(--bad);
}
.message {
  font-size: 13px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--soft);
}
.confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.opening::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 4px;
  background: var(--good);
}
.list-area {
  flex: 1 1 auto;
  min-height: 72px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.list .row {
  align-items: flex-start;
}
.state {
  flex: none;
  color: var(--muted);
  font-size: 12px;
}
.reply {
  margin: 2px 0 0 12px;
  color: var(--muted);
}
.outline {
  position: fixed;
  border: 2px solid var(--accent);
  border-radius: 4px;
  pointer-events: none;
}
.hover {
  border-style: dashed;
}
.label {
  position: fixed;
  max-width: 300px;
  padding: 1px 6px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--fg);
  color: var(--bg);
  font: 12px/1.6 ui-monospace, Menlo, Consolas, monospace;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;

const NOSNIFF = { 'x-content-type-options': 'nosniff' };

const asset = (type, text) => ({
  status: 200,
  headers: { 'content-type': type, ...NOSNIFF },
  body: Buffer.from(text),
});

const jsonAnswer = (status, value) => ({
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...NOSNIFF,
    'content-security-policy': "default-src 'none'",
  },
  body: Buffer.from(JSON.stringify(value)),
});

const refusal = (status, error) => jsonAnswer(status, { error });

// Slashes collapsed and dot segments resolved, so no spelling of a feedback path reaches the app.
function feedbackRouteOf(path) {
  const raw = path.split('?', 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return /__feedback/i.test(raw.replace(/%5f/gi, '_')) ? '/__feedback' : null;
  }
  const segments = [];
  for (const segment of decoded.replace(/\/+/g, '/').split('/').slice(1)) {
    if (segment === '..') segments.pop();
    else if (segment !== '.') segments.push(segment);
  }
  return segments[0]?.toLowerCase() === '__feedback' ? `/${segments.join('/')}` : null;
}

function feedbackStatus() {
  const comments = storedComments()
    .reverse()
    .map(({ comment, seen }) => {
      const reply = readStoredJson(`${comment.id}.reply.json`)?.text;
      return {
        id: comment.id,
        at: comment.at,
        text: comment.text,
        pin: comment.element?.pin ?? null,
        seen,
        reply: typeof reply === 'string' ? reply : null,
      };
    });
  return jsonAnswer(200, { preview: previewValue, done: isDone(), comments });
}

function postOf(request) {
  if (request.headers['sec-fetch-site'] !== 'same-origin') {
    return { refused: refusal(403, 'not_same_origin') };
  }
  if (request.headers['x-feedback-preview'] !== previewValue) {
    return { refused: refusal(409, 'stale_preview') };
  }
  const type = String(request.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (type !== 'application/json' || request.body.length > POST_MAX) return { body: undefined };
  try {
    return { body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(request.body)) };
  } catch {
    return { body: undefined };
  }
}

function postComment(request) {
  const { refused, body } = postOf(request);
  if (refused !== undefined) return refused;
  if (isDone()) return refusal(409, 'done');
  if (!isComment(body)) return refusal(400, 'bad_comment');
  const stored = readdirSync(FEEDBACK_DIR).filter((name) => COMMENT_FILE.test(name)).length;
  if (stored >= COMMENTS_MAX) return refusal(429, 'full');
  const id = randomHex();
  writeStored(`${id}.json`, JSON.stringify({ id, at: new Date().toISOString(), ...body }));
  return jsonAnswer(201, { id });
}

function postDone(request) {
  const { refused, body } = postOf(request);
  if (refused !== undefined) return refused;
  if (!isShape(body, [])) return refusal(400, 'bad_request');
  writeStored('done', new Date().toISOString());
  return { status: 204, headers: { ...NOSNIFF }, body: Buffer.alloc(0) };
}

function feedbackAnswer(request, route) {
  try {
    switch (`${request.method} ${route}`) {
      case 'GET /__feedback/overlay.js':
        return asset('text/javascript; charset=utf-8', `(${String(overlay)})();\n`);
      case 'GET /__feedback/overlay.css':
        return asset('text/css; charset=utf-8', OVERLAY_CSS);
      case 'GET /__feedback/status':
        return feedbackStatus();
      case 'POST /__feedback/comments':
        return postComment(request);
      case 'POST /__feedback/done':
        return postDone(request);
      default:
        return refusal(404, 'not_found');
    }
  } catch {
    return refusal(500, 'failed');
  }
}

async function call(path, init) {
  return await fetch(`${preview.base}${path}`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    ...init,
    headers: { ...auth, ...init.headers },
  });
}

async function reply(id, answer) {
  try {
    const response = await call('/preview/reply', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        status: answer.status,
        headers: answer.headers,
        body: answer.body.toString('base64'),
      }),
    });
    await response.arrayBuffer();
  } catch {
    counts.failed += 1;
  }
}

async function pollLoop() {
  for (;;) {
    let response;
    try {
      response = await call('/preview/poll', { headers: {} });
    } catch {
      await sleep(RETRY_MS);
      continue;
    }
    if (response.status === 410) finish('the preview ended');
    noteEnd(response.headers.get('x-thistlewick-ends-at'));
    if (response.status === 200 || response.status === 204) lastAnswer = Date.now();
    if (response.status !== 200) {
      await response.arrayBuffer().catch(() => undefined);
      if (response.status !== 204) await sleep(RETRY_MS);
      continue;
    }
    const origin = response.headers.get('x-thistlewick-preview-origin');
    let request = null;
    try {
      request = pageRequestOf(await response.json());
    } catch {
      request = null;
    }
    if (request === null) continue;
    counts.requests += 1;
    if (request.method === 'CONNECT' || request.method === 'TRACE') {
      await reply(request.id, failed(405));
      continue;
    }
    const route = feedbackRouteOf(request.path);
    if (route !== null) {
      await reply(request.id, feedbackAnswer(request, route));
      continue;
    }
    await reply(
      request.id,
      await forward(request, origin !== null && isOrigin(origin) ? origin : null),
    );
  }
}

setInterval(() => {
  const now = Date.now();
  if (latestEnd > 0 && now >= latestEnd) finish('its deadline passed');
  if (now - lastAnswer >= SILENCE_MS) finish('the relay did not answer for 2 minutes');
}, 1_000);

console.log('Preview client started.');
for (let i = 0; i < POLLS; i += 1) void pollLoop();
