import { expect } from 'chai';
import supertest from 'supertest';
import ServerService from '../src/services/ServerService';
import { AppRole } from '../src/types';
import userService from '../src/services/UserService';
import userRepository from '../src/repositories/UserRepository';
import MongoDBService from '../src/services/MongoDBService';
import dealRepository from '../src/repositories/DealRepository';
import { constants } from 'ethers';

describe('test', async () => {
  const appService = await new ServerService(3005);
  const requestWithSupertest = await supertest(appService.getApp);

  const managerLogin = 'test_manager_super_long_login';
  const managerPass = '123456qwerty';

  let refreshToken;
  let accessToken;

  const staffLogin = 'test_staff_super_long_login';
  const staffPass = '123456qwerty';
  const staffUpdatePass = 'qwerty123456';

  let staffAccessToken;
  let staffUserId;

  const anotherUserForTest = 'test_staff_for_tests';

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it('make manager', async () => {
    await userService.createUser(managerLogin, managerPass, [AppRole.MANAGER]);

    const user = await userRepository.getUserByLogin(managerLogin);
    expect(user._id?.toString()).to.be.an('string');
  });

  it('manager can login', async () => {
    const res = await requestWithSupertest
      .post('/api/user/login')
      .send({ login: managerLogin, password: managerPass })
      .set('Accept', 'application/json');

    refreshToken = res.headers['set-cookie'][0];
    accessToken = res.body.accessToken;
    refreshToken = refreshToken.split('=')[1].split(';')[0];

    expect(refreshToken).to.be.an('string');
    expect(accessToken).to.be.an('string');
  });

  it('check auth', async () => {
    const res = await requestWithSupertest
      .get('/api/user/get-all')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.users).to.be.an('array');
  });

  it('refresh token', async () => {
    //without sleep script is very fast and refreshed access token is equal with old
    await sleep(1000);

    const res = await requestWithSupertest
      .post('/api/user/refresh')
      .set('Accept', 'application/json')
      .set('Cookie', [`refreshToken=${refreshToken}`]);
    const oldAccessToken = accessToken;
    accessToken = res.body.accessToken;
    expect(accessToken).to.be.an('string');
    expect(accessToken).to.not.equal(oldAccessToken);
  });

  it('should throw err when try refresh token with revoked token', async () => {
    //without sleep script is very fast and refreshed access token is equal with old
    await sleep(1000);

    await requestWithSupertest
      .post('/api/user/refresh')
      .set('Accept', 'application/json')
      .set('Cookie', [`refreshToken=${refreshToken}`])
      .expect(401);
  });

  it('create new user with refreshed access token', async () => {
    const res = await requestWithSupertest
      .post('/api/user/create')
      .send({
        login: staffLogin,
        password: staffPass,
        roles: [AppRole.STAFF]
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(res.status).to.equal(200);
  });

  it('staff can login', async () => {
    const res = await requestWithSupertest
      .post('/api/user/login')
      .send({ login: staffLogin, password: staffPass })
      .set('Accept', 'application/json');

    staffAccessToken = res.body.accessToken;
    staffUserId = res.body.id;
    expect(staffAccessToken).to.be.an('string');
  });

  it(`staff can't create user`, async () => {
    const res = await requestWithSupertest
      .post('/api/user/create')
      .send({
        login: 'some_login_for_test',
        password: staffPass,
        roles: [AppRole.STAFF]
      })
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .set('Accept', 'application/json');

    expect(res.status).to.equal(403);
  });

  it(`staff can't delete users`, async () => {
    await requestWithSupertest
      .delete('/api/user')
      .send({
        userId: staffUserId
      })
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .set('Accept', 'application/json')
      .expect(403);
  });

  it(`staff can get auth APIs`, async () => {
    const res = await requestWithSupertest
      .get('/api/user/get-all')
      .set('Authorization', `Bearer ${staffAccessToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.users).to.be.an('array');
  });

  it(`manager can update staff password`, async () => {
    const res = await requestWithSupertest
      .put('/api/user/update-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: staffUserId, password: staffUpdatePass });

    expect(res.status).to.equal(200);
  });

  it(`manager can update staff role to manager`, async () => {
    const res = await requestWithSupertest
      .put('/api/user/update-roles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userId: staffUserId, roles: [AppRole.MANAGER] });

    expect(res.status).to.equal(200);
  });

  it('staff can login with new pass', async () => {
    const res = await requestWithSupertest
      .post('/api/user/login')
      .send({ login: staffLogin, password: staffUpdatePass })
      .set('Accept', 'application/json');

    staffAccessToken = res.body.accessToken;
    expect(staffAccessToken).to.be.an('string');
  });

  it(`staff can create user after change role to manager`, async () => {
    const res = await requestWithSupertest
      .post('/api/user/create')
      .send({
        login: anotherUserForTest,
        password: staffPass,
        roles: [AppRole.STAFF]
      })
      .set('Authorization', `Bearer ${staffAccessToken}`)
      .set('Accept', 'application/json');

    expect(res.status).to.equal(200);
  });

  it(`manager can delete users`, async () => {
    await requestWithSupertest
      .delete('/api/user')
      .send({
        userId: staffUserId
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json')
      .expect(200);
  });

  it('should throw error when deleted user login', async () => {
    await requestWithSupertest
      .post('/api/user/login')
      .send({ login: staffLogin, password: staffPass })
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('delete users', async () => {
    const manager = await userRepository.getUserByLogin(managerLogin);
    const anotherUser = await userRepository.getUserByLogin(anotherUserForTest);
    await userService.deleteUser(manager._id?.toString() || '');
    await userService.deleteUser(anotherUser._id?.toString() || '');

    await MongoDBService.getInstance().cleanUp();
  });

  describe('proxy', async () => {
    it('get all hotels', async () => {
      const res = await requestWithSupertest
        .get('/api/derby-soft/hotels')
        .set('Accept', 'application/json')
        .expect(200);

      expect(res.body.data).to.be.a('array');
      expect(res.body.status).to.equal('success');
    }).timeout(10000);

    it('get all hotels by rectangle', async () => {
      const getParams = { lon: -77.387982, lat: 34.748995, radius: 2000 };
      const res = await requestWithSupertest
        .get('/api/derby-soft/hotels/search')
        .query({ ...getParams })
        .set('Accept', 'application/json')
        .expect(200);

      expect(res.body.data).to.be.a('array');
    }).timeout(10000);

    let offerId;
    let pricedOfferId;

    it('get all offers by rectangle with wrong data', async () => {
      const body = {
        accommodation: {
          location: {
            lon: -65.387982,
            lat: 34.748995,
            radius: '2 thousand'
          },
          arrival: '2022-08-01T07:19:00.809Z',
          departure: '2022-08-03T07:19:00.809Z',
          roomCount: 1
        },
        passengers: [
          {
            type: 'ADT',
            count: '1'
          },
          {
            type: 'CHD',
            count: '1',
            childrenAges: [13]
          }
        ]
      };

      const res = await requestWithSupertest
        .post('/api/derby-soft/offers/search')
        .send(body)
        .set('Accept', 'application/json')
        .expect(400);
    }).timeout(10000);

    it('get all offers by rectangle', async () => {
      const body = {
        accommodation: {
          location: {
            lon: -65.387982,
            lat: 34.748995,
            radius: 2000
          },
          arrival: '2022-08-01T07:19:00.809Z',
          departure: '2022-08-03T07:19:00.809Z',
          roomCount: 1
        },
        passengers: [
          {
            type: 'ADT',
            count: 1
          },
          {
            type: 'CHD',
            count: 1,
            childrenAges: [13]
          }
        ]
      };

      const res = await requestWithSupertest
        .post('/api/derby-soft/offers/search')
        .send(body)
        .set('Accept', 'application/json')
        .expect(200);

      expect(res.body.data).to.be.a('object');
      expect(res.body.data.derbySoft.status).to.be.equal('success');

      offerId = Object.keys(res.body.data.derbySoft.data.offers)[0];
    }).timeout(10000);

    it('get all offer price', async () => {
      const res = await requestWithSupertest
        .post(`/api/derby-soft/offers/${offerId}/price`)
        .send({})
        .set('Accept', 'application/json')
        .expect(200);

      expect(res.body.data).to.be.a('object');
      pricedOfferId = res.body.data.offerId;
    }).timeout(10000);

    it('set users and get error with wrong data', async () => {
      const passengers = [
        {
          type: 'ADT',
          civility: 'MR',
          lastnames: ['Marley'],
          firstnames: ['Bob'],
          gender: 'Male',
          birthdate: '1980-03-21T00:00:00Z',
          contactInformation: [32123456789, 'contact@org.co.uk']
        }
      ];
      const res = await requestWithSupertest
        .post(`/api/booking/${pricedOfferId}/set-passengers`)
        .send(passengers)
        .set('Accept', 'application/json')
        .expect(400);
    });

    it('set users', async () => {
      const passengers = [
        {
          type: 'ADT',
          civility: 'MR',
          lastnames: ['Marley'],
          firstnames: ['Bob'],
          gender: 'Male',
          birthdate: '1980-03-21T00:00:00Z',
          contactInformation: ['+32123456789', 'contact@org.co.uk']
        }
      ];
      await requestWithSupertest
        .post(`/api/booking/${pricedOfferId}/set-passengers`)
        .send(passengers)
        .set('Accept', 'application/json')
        .expect(200);
      await sleep(10000);
    }).timeout(20000);

    it('check booked with simard api', async () => {
      await sleep(10000);

      const res = await requestWithSupertest
        .get(`/api/booking/${constants.AddressZero}`)
        .set('Accept', 'application/json')
        .expect(200);

      const deals = res.body.data;

      const deal = deals.find((v) => v.offerId === pricedOfferId);
      expect(deal.status).to.be.equal('booked');
    }).timeout(20000);

    after(() => {
      process.exit(0);
    });
  });
});
