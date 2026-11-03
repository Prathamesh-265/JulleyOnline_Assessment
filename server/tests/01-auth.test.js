import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { call, http, ok, uid, world } from './helpers/api.js';

describe('auth', () => {
  const email = `qa-auth-${uid()}@kanban-test.dev`;
  const password = 'Password@123';
  let token;

  it('health check is public', async () => {
    assert.deepEqual(ok(await http.get('/health')), { status: 'ok' });
  });

  it('sends security headers', async () => {
    const res = await http.get('/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('registers a user and never returns the password hash', async () => {
    const body = ok(await call('POST', '/auth/register', { body: { name: 'QA Auth', email, password } }), 201);
    assert.equal(body.user.email, email);
    assert.ok(body.token);
    assert.equal(body.user.passwordHash, undefined);
    assert.equal(body.user.password, undefined);
    token = body.token;
  });

  it('rejects a duplicate email with 409', async () => {
    ok(await call('POST', '/auth/register', { body: { name: 'Again', email, password } }), 409);
  });

  it('treats email case-insensitively', async () => {
    ok(await call('POST', '/auth/register', { body: { name: 'Again', email: email.toUpperCase(), password } }), 409);
  });

  it('rejects a short password with field details', async () => {
    const res = await call('POST', '/auth/register', { body: { name: 'X', email: `x-${uid()}@kanban-test.dev`, password: 'short' } });
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.details));
  });

  it('rejects a password over 72 characters', async () => {
    const res = await call('POST', '/auth/register', { body: { name: 'X', email: `y-${uid()}@kanban-test.dev`, password: 'a'.repeat(73) } });
    assert.equal(res.status, 400);
  });

  it('rejects an invalid email and a missing name', async () => {
    assert.equal((await call('POST', '/auth/register', { body: { name: 'X', email: 'nope', password } })).status, 400);
    assert.equal((await call('POST', '/auth/register', { body: { email: `z-${uid()}@kanban-test.dev`, password } })).status, 400);
  });

  it('logs in with the right password', async () => {
    const body = ok(await call('POST', '/auth/login', { body: { email, password } }));
    assert.ok(body.token);
    assert.equal(body.user.email, email);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await call('POST', '/auth/login', { body: { email, password: 'WrongPassword1' } });
    const unknown = await call('POST', '/auth/login', { body: { email: `ghost-${uid()}@kanban-test.dev`, password } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error); // doesn't reveal which emails exist
  });

  it('/auth/me needs a token', async () => {
    assert.equal((await http.get('/auth/me')).status, 401);
  });

  it('/auth/me returns the user for a valid token', async () => {
    const body = ok(await http.get('/auth/me', token));
    assert.equal(body.user.email, email);
  });

  it('rejects garbage, wrong-secret and expired tokens', async () => {
    const { id } = world().users.memberA1;
    const forged = jwt.sign({ sub: id }, 'a-completely-different-secret-value-123456', { algorithm: 'HS256' });
    const expired = jwt.sign({ sub: id, exp: Math.floor(Date.now() / 1000) - 60 }, 'a-completely-different-secret-value-123456');
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id })).toString('base64url')}.`;
    for (const bad of ['abc.def.ghi', forged, expired, noneAlg]) {
      assert.equal((await http.get('/auth/me', bad)).status, 401);
    }
  });

  it('rejects a wrong auth scheme', async () => {
    const res = await call('GET', '/auth/me');
    assert.equal(res.status, 401);
    const raw = await fetch(`${process.env.API_URL || 'http://localhost:5000'}/api/auth/me`, { headers: { Authorization: `Basic ${token}` } });
    assert.equal(raw.status, 401);
  });

  it('every protected route refuses anonymous callers', async () => {
    for (const path of ['/organizations', '/tenants?organizationId=x', '/boards?tenantId=x', '/tasks?boardId=x', '/activity?tenantId=x']) {
      assert.equal((await http.get(path)).status, 401, path);
    }
  });

  it('unknown routes return JSON 404', async () => {
    const res = await http.get('/does-not-exist', token);
    assert.equal(res.status, 404);
  });
});
