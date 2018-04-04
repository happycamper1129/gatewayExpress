const session = require('supertest-session');
const should = require('should');

const app = require('./bootstrap');
const services = require('../../lib/services');
const db = require('../../lib/db');
const checkTokenResponse = require('./checkTokenResponse');

const credentialService = services.credential;
const userService = services.user;
const applicationService = services.application;
const tokenService = services.token;

describe('Functional Test Client Password grant', function () {
  let fromDbUser1, fromDbApp, refreshToken;

  const user1 = {
    username: 'irfanbaqui',
    firstname: 'irfan',
    lastname: 'baqui',
    email: 'irfan@eg.com'
  };

  const user2 = {
    username: 'somejoe',
    firstname: 'joe',
    lastname: 'smith',
    email: 'joe@eg.com'
  };

  before(() =>
    db.flushdb()
      .then(() => Promise.all([userService.insert(user1), userService.insert(user2)]))
      .then(([_fromDbUser1, _fromDbUser2]) => {
        should.exist(_fromDbUser1);
        should.exist(_fromDbUser2);

        fromDbUser1 = _fromDbUser1;

        const app1 = {
          name: 'irfan_app',
          redirectUri: 'https://some.host.com/some/route'
        };

        return applicationService.insert(app1, fromDbUser1.id);
      })
      .then(_fromDbApp => {
        should.exist(_fromDbApp);
        fromDbApp = _fromDbApp;

        return credentialService.insertScopes(['someScope']);
      })
      .then(() => Promise.all([
        credentialService.insertCredential(fromDbUser1.id, 'basic-auth', { password: 'user-secret' }),
        credentialService.insertCredential(fromDbApp.id, 'oauth2', { secret: 'app-secret', scopes: ['someScope'] })
      ]))
      .then(([userRes, appRes]) => {
        should.exist(userRes);
        should.exist(appRes);
      })
  );

  it('should grant access token when no scopes are specified', function (done) {
    const request = session(app);
    const credentials = Buffer.from(fromDbApp.id.concat(':app-secret')).toString('base64');

    request
      .post('/oauth2/token')
      .set('Authorization', `basic ${credentials}`)
      .set('content-type', 'application/x-www-form-urlencoded')
      .type('form')
      .send({
        grant_type: 'password',
        username: 'irfanbaqui',
        password: 'user-secret'
      })
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        checkTokenResponse(res.body);
        done();
      });
  });

  it('should grant access token with authorized scopes', function (done) {
    const request = session(app);
    const credentials = Buffer.from(fromDbApp.id.concat(':app-secret')).toString('base64');

    request
      .post('/oauth2/token')
      .set('Authorization', 'basic ' + credentials)
      .set('content-type', 'application/x-www-form-urlencoded')
      .type('form')
      .send({
        grant_type: 'password',
        username: 'irfanbaqui',
        password: 'user-secret',
        scope: 'someScope'
      })
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        checkTokenResponse(res.body, ['refresh_token']);
        refreshToken = res.body.refresh_token;

        tokenService.get(res.body.access_token)
          .then(fromDbToken => {
            should.exist(fromDbToken);
            fromDbToken.scopes.should.eql(['someScope']);
            [fromDbToken.id, fromDbToken.tokenDecrypted].should.eql(res.body.access_token.split('|'));
            done();
          });
      });
  });

  it('should grant access token in exchange of refresh token', function (done) {
    const request = session(app);

    request
      .post('/oauth2/token')
      .set('Content-Type', 'application/json')
      .send({
        grant_type: 'refresh_token',
        client_id: fromDbApp.id,
        client_secret: 'app-secret',
        refresh_token: refreshToken
      })
      .expect(200)
      .end((err, res) => {
        if (done) return done(err);
        checkTokenResponse(res.body);
        tokenService.get(res.body.access_token)
          .then(token => {
            should.exist(token);
            token.scopes.should.eql(['someScope']);
            [token.id, token.tokenDecrypted].should.eql(res.body.access_token.split('|'));
            done();
          });
      });
  });

  it('should not grant access token with unauthorized scopes', function (done) {
    const request = session(app);
    const credentials = Buffer.from(fromDbApp.id.concat(':app-secret')).toString('base64');

    request
      .post('/oauth2/token')
      .set('Authorization', 'basic ' + credentials)
      .set('content-type', 'application/x-www-form-urlencoded')
      .type('form')
      .send({
        grant_type: 'password',
        username: 'irfanbaqui',
        password: 'user-secret',
        scope: 'someScope unauthorizedScope'
      })
      .expect(401)
      .end(done);
  });
});
