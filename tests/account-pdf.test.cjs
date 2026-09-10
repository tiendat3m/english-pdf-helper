require('fake-indexeddb/auto');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const db = require('../src/lib/db.ts');
const client = require('../src/lib/accountDataClient.ts');
const { StorageRequestError, isMissingStorageObject } = require('../src/lib/supabaseStorageSync.ts');

global.window = {};
Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
const originalFetch = global.fetch;
let userId;
let auth;
const empty = () => ({ books: [], annotations: [], bookmarks: [], pageStatuses: [], vocabulary: [], activities: [] });
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const pdf = () => new File(['%PDF-1.7\naccount-pdf-test\n%%EOF'], 'listening.pdf', { type: 'application/pdf' });
const metadata = ({ blob, ...book }) => book;

beforeEach(() => {
  userId = randomUUID();
  auth = { isAuthEnabled: true, isSignedIn: true, userId, getToken: async () => 'test-token' };
  db.setActiveDataWorkspace(`user_${userId}`);
  navigator.onLine = true;
});
afterEach(() => { global.fetch = originalFetch; });

test('a missing remote PDF retains the local bytes and queues repair after login', async () => {
  const book = await db.importBook(pdf());
  book.pdfUploadPending = false;
  global.fetch = async (url) => {
    assert.equal(url, '/api/account-data');
    return json({ data: { ...empty(), books: [{ ...metadata(book), downloadUrl: null, fileError: 'missing' }] } });
  };
  const loaded = await client.loadAccountData(auth, { cachedBooks: [book] });
  assert.equal(await loaded.books[0].blob.text(), await book.blob.text());
  assert.equal(loaded.books[0].fileUnavailable, false);
  assert.equal(loaded.books[0].pdfUploadPending, true);
});

test('cached PDFs are not downloaded again on each login', async () => {
  const book = await db.importBook(pdf());
  book.pdfUploadPending = false;
  global.fetch = async (url) => {
    assert.equal(url, '/api/account-data');
    return json({ data: { ...empty(), books: [{ ...metadata(book), downloadUrl: 'https://storage.test/book' }] } });
  };
  const loaded = await client.loadAccountData(auth, { cachedBooks: [book] });
  assert.equal(loaded.books[0].pdfUploadPending, false);
  assert.equal(loaded.books[0].blob.size, book.size);
});

test('one failed download does not hide other books or claim the object is missing', async () => {
  const book = await db.importBook(pdf());
  global.fetch = async (url) => {
    if (url === '/api/account-data') return json({ data: { ...empty(), books: [
      { ...metadata(book), downloadUrl: 'https://storage.test/fail' },
      { ...metadata(book), id: 'second', downloadUrl: 'https://storage.test/ok' }
    ] } });
    if (url.endsWith('/fail')) throw new TypeError('Network error');
    return new Response(book.blob);
  };
  const loaded = await client.loadAccountData(auth);
  assert.equal(loaded.books[0].fileError, 'download-failed');
  assert.equal(loaded.books[1].fileUnavailable, false);
});

test('an incomplete PDF download is not accepted as a saved file', async () => {
  const book = await db.importBook(pdf());
  global.fetch = async (url) => url === '/api/account-data'
    ? json({ data: { ...empty(), books: [{ ...metadata(book), downloadUrl: 'https://storage.test/partial' }] } })
    : new Response('%PDF-');
  const loaded = await client.loadAccountData(auth);
  assert.equal(loaded.books[0].fileUnavailable, true);
  assert.equal(loaded.books[0].fileError, 'download-failed');
});

test('offline writes fail explicitly and preserve the durable PDF queue', async () => {
  const book = await db.importBook(pdf());
  navigator.onLine = false;
  global.fetch = () => assert.fail('offline write must not fetch');
  await assert.rejects(client.upsertAccountBook(auth, book, { uploadPdf: true }), /Offline/);
  assert.equal((await db.loadAppData()).books[0].pdfUploadPending, true);
});

test('missing upload URLs are retried finitely and never reported as saved', async () => {
  const book = await db.importBook(pdf());
  let requests = 0;
  global.fetch = async () => { requests += 1; return json({}); };
  await assert.rejects(client.upsertAccountBook(auth, book, { uploadPdf: true }), /upload URL/);
  assert.equal(requests, 3);
  assert.equal((await db.loadAppData()).books[0].pdfUploadPending, true);
});

test('upload requires server verification; reconnect retries the retained file', async () => {
  const book = await db.importBook(pdf());
  let verify = false;
  global.fetch = async (url, init) => {
    if (url.startsWith('https://')) return json({});
    const body = JSON.parse(init.body);
    assert.equal(init.headers['x-account-user-id'], userId);
    return body.operation === 'confirmBookUpload' ? json({ verified: verify })
      : json({ uploadUrls: [{ uploadUrl: 'https://storage.test/upload', bookId: book.id }] });
  };
  await assert.rejects(client.upsertAccountBook(auth, book, { uploadPdf: true }), /not confirmed/);
  assert.equal((await db.loadAppData()).books[0].pdfUploadPending, true);
  verify = true;
  await client.upsertAccountBook(auth, book, { uploadPdf: true });
  assert.equal((await db.loadAppData()).books[0].pdfUploadPending, false);
  await db.touchBook(book, { lastPage: 8 });
  assert.equal((await db.loadAppData()).books[0].pdfUploadPending, false, 'stale component props must not requeue a confirmed PDF');
});

test('logging out during upload cannot write completion into the next account', async () => {
  const book = await db.importBook(pdf());
  const sourceWorkspace = `user_${userId}`;
  global.fetch = async (url, init) => {
    if (url.startsWith('https://')) { db.setActiveDataWorkspace('user_other'); return json({}); }
    return JSON.parse(init.body).operation === 'confirmBookUpload' ? json({ verified: true })
      : json({ uploadUrls: [{ uploadUrl: 'https://storage.test/upload', bookId: book.id }] });
  };
  await client.upsertAccountBook(auth, book, { uploadPdf: true });
  assert.equal((await db.loadAppData()).books.length, 0);
  await db.mergeAppDataIntoActiveWorkspace({ ...empty(), books: [book] }, sourceWorkspace);
  assert.equal((await db.loadAppData()).books.length, 0, 'late account response must not merge into another account');
  db.setActiveDataWorkspace(sourceWorkspace);
  assert.equal((await db.loadAppData()).books[0].pdfUploadPending, false);
});

test('remote empty bytes cannot overwrite a local PDF or its newer page progress', async () => {
  const book = await db.importBook(pdf());
  await db.touchBook(book, { lastPage: 9 });
  await db.mergeAppDataIntoActiveWorkspace({ ...empty(), books: [{ ...book, updatedAt: '2020-01-01', lastPage: 1,
    blob: new Blob([]), fileUnavailable: true, fileError: 'missing' }] });
  const [saved] = (await db.loadAppData()).books;
  assert.equal(saved.blob.size, book.size);
  assert.equal(saved.fileUnavailable, false);
  assert.equal(saved.pdfUploadPending, true);
  assert.equal(saved.lastPage, 9);
});

test('account PDF recovery does not scan other signed-in accounts', async () => {
  const original = `user_${userId}`;
  const book = await db.importBook(pdf());
  db.setActiveDataWorkspace('user_' + randomUUID());
  await db.mergeAppDataIntoActiveWorkspace({ ...empty(), books: [{ ...book, blob: new Blob([]), fileUnavailable: true }] });
  assert.equal(await db.recoverMissingBookFilesIntoActiveWorkspace(), 0);
  assert.equal((await db.loadAppData()).books[0].blob.size, 0);
  db.setActiveDataWorkspace(original);
  assert.equal((await db.loadAppData()).books[0].blob.size, book.size);
});

test('storage errors distinguish missing objects from permissions and outages', () => {
  assert.equal(isMissingStorageObject(new StorageRequestError('Object not found', 400)), true);
  assert.equal(isMissingStorageObject(new StorageRequestError('Missing', 404, 'NoSuchKey')), true);
  assert.equal(isMissingStorageObject(new StorageRequestError('Unauthorized', 403)), false);
  assert.equal(isMissingStorageObject(new Error('fetch failed')), false);
});

test('upload on device one, login on an empty device, then return home preserves the PDF', async () => {
  const home = `user_${userId}`;
  const book = await db.importBook(pdf());
  let cloudBook;
  let cloudBlob;
  global.fetch = async (url, init = {}) => {
    if (url === 'https://storage.test/upload') {
      cloudBlob = init.body.get('file');
      return json({});
    }
    if (url === 'https://storage.test/download') return new Response(cloudBlob);
    if (init.method === 'GET') return json({ data: { ...empty(), books: [
      { ...cloudBook, downloadUrl: 'https://storage.test/download' }
    ] } });
    const body = JSON.parse(init.body);
    if (body.operation === 'confirmBookUpload') return json({ verified: cloudBlob.size === cloudBook.size });
    cloudBook = body.book;
    return json({ uploadUrls: [{ uploadUrl: 'https://storage.test/upload', bookId: book.id }] });
  };
  await client.upsertAccountBook(auth, book, { uploadPdf: true });
  // A separate IndexedDB namespace models another browser with no local data.
  db.setActiveDataWorkspace('device_two_' + userId);
  assert.equal((await db.loadAppData()).books.length, 0);
  const remote = await client.loadAccountData(auth);
  await db.mergeAppDataIntoActiveWorkspace(remote);
  assert.equal(await (await db.loadAppData()).books[0].blob.text(), await book.blob.text());
  db.setActiveDataWorkspace(home);
  const cached = await db.loadAppData();
  const reloaded = await client.loadAccountData(auth, { cachedBooks: cached.books });
  await db.mergeAppDataIntoActiveWorkspace(reloaded, home);
  const [saved] = (await db.loadAppData()).books;
  assert.equal(saved.fileUnavailable, false);
  assert.equal(saved.pdfUploadPending, false);
  assert.equal(await saved.blob.text(), await book.blob.text());
});
