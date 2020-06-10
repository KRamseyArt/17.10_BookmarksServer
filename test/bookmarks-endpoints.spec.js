const { expect } = require('chai');
const knex = require('knex');
const app = require('../src/app');
const { makeBookmarksArray, makeMaliciousBookmark } = require('./bookmarks.fixtures');

const apiToken = process.env.API_TOKEN;

describe('Bookmarks Endpoints', function() {
  let db;

  before('make knex instance', () => {
    db = knex({
      client: 'pg',
      connection: process.env.TEST_DB_URL,
    })
    app.set('db', db);
  })

  after('disconnect from db', () => db.destroy());

  before('clean the table', () => db('bookmarks').truncate());
  
  afterEach('cleanup', () => db('bookmarks').truncate());

  describe(`Unauthorized requests`, () => {
    const testBookmarks = makeBookmarksArray();

    beforeEach('insert bookmarks', () => {
      return db
        .into('bookmarks')
        .insert(testBookmarks)
    })

    it(`responds with 401 Unauthorized for GET /bookmarks`, () => {
      return supertest(app)
        .get('/bookmarks')
        .expect(401, { error: 'Unauthorized request' })
    })

    it(`responds with 401 Unauthorized for POST /bookmarks`, () => {
      return supertest(app)
        .post('/bookmarks')
        .send({ title: 'test-title', url: 'http://some.thing.com', rating: 1 })
        .expect(401, { error: 'Unauthorized request' })
    })

    it(`responds with 401 Unauthorized for GET /bookmarks/:id`, () => {
      const secondBookmark = testBookmarks[1]
      return supertest(app)
        .get(`/bookmarks/${secondBookmark.id}`)
        .expect(401, { error: 'Unauthorized request' })
    })

    it(`responds with 401 Unauthorized for DELETE /bookmarks/:id`, () => {
      const aBookmark = testBookmarks[1]
      return supertest(app)
        .delete(`/bookmarks/${aBookmark.id}`)
        .expect(401, { error: 'Unauthorized request' })
    })
  })


  describe(`GET /bookmarks`, () => {
    context(`Given no bookmarks`, () => {
      it('responds with 200 and an empty list', () => {
        return supertest(app)
          .get('/bookmarks')
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(200, [])
      })
    })
    context('Given there are bookmarks in the database', () => {
      const testBookmarks = makeBookmarksArray();
  
      beforeEach('insert bookmarks', () => {
        return db
          .into('bookmarks')
          .insert(testBookmarks)
      })
  
      it('responds with 200 and all of the bookmarks', () => {
        return supertest(app)
          .get('/bookmarks')
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(200, testBookmarks)
      })
    })
    context(`Given an XSS attack bookmark`, () => {
      const { maliciousBookmark, expectedBookmark } = makeMaliciousBookmark();
        
      beforeEach('insert malicious bookmark', () => {
        return db
        .into('bookmarks')
        .insert([maliciousBookmark])
      })
        
      it('removes XSS attack content', () => {
        return supertest(app)
          .get('/bookmarks')
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(200)
          .expect(res => {
            expect(res.body[0].title).to.eql(expectedBookmark.title)
            expect(res.body[0].description).to.eql(expectedBookmark.description)
          })
      })
    })
  })

  describe(`GET /bookmarks/:bookmark_id`, () => {
    context('Given no bookmarks', () => {
      it(`responds with 404 when bookmark doesn't exist`, () => {
        const bookmarkId = 123456;
        return supertest(app)
          .get(`/bookmarks/${bookmarkId}`)
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(404, { error: { message: `Bookmark doesn't exist` } })
      })
    })
    context('Given there are bookmarks in the database', () => {
      const testBookmarks = makeBookmarksArray();

      beforeEach('insert bookmarks', () => {
        return db
          .into('bookmarks')
          .insert(testBookmarks)
      })

      it('responds with 200 and the specified bookmark', () => {
        const bookmarkId = 2;
        const expectedBookmark = testBookmarks[bookmarkId - 1];
  
        return supertest(app)
          .get(`/bookmarks/${bookmarkId}`)
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(200, expectedBookmark);
      })
    })
    context(`Given an XSS attack bookmark`, () => {
      const { maliciousBookmark, expectedBookmark } = makeMaliciousBookmark();
        
      beforeEach('insert malicious bookmark', () => {
        return db
        .into('bookmarks')
        .insert([maliciousBookmark])
      })
        
      it('removes XSS attack content', () => {
        return supertest(app)
          .get(`/bookmarks/${expectedBookmark.id}`)
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(200)
          .expect(res => {
            expect(res.body.title).to.eql(expectedBookmark.title)
            expect(res.body.description).to.eql(expectedBookmark.description)
            expect(res.body.bookmarkurl).to.eql(expectedBookmark.bookmarkurl)
            expect(res.body.rating).to.eql(expectedBookmark.rating)
          })
      })
    })
  })

  describe(`POST /bookmarks`, () => {
    it(`creates a bookmark, responding with 201 and the new bookmark`, function() {
      const newBookmark = {
        title: 'Test new bookmark',
        bookmarkurl: 'http://www.test.com',
        description: 'Test description',
        rating: 3
      }

      return supertest(app)
        .post('/bookmarks')
        .send(newBookmark)
        .set("Authorization", `Bearer ${apiToken}`)
        .expect(201)
        .expect(res => {
          expect(res.body.title).to.eql(newBookmark.title)
          expect(res.body.bookmarkurl).to.eql(newBookmark.bookmarkurl)
          expect(res.body.description).to.eql(newBookmark.description)
          expect(res.body.rating).to.eql(newBookmark.rating)
          expect(res.body).to.have.property('id')
          expect(res.headers.location).to.eql(`/bookmarks/${res.body.id}`)
        })
        .then(postRes =>
          supertest(app)
            .get(`/bookmarks/${postRes.body.id}`)
            .set("Authorization", `Bearer ${apiToken}`)
            .expect(postRes.body)
        )
    })

    const requiredFields = ['title', 'bookmarkurl', 'description', 'rating'];

    requiredFields.forEach(field => {
      const newBookmark = {
        title: 'Test new bookmark',
        bookmarkurl: 'http://www.test.com',
        description: 'Test description',
        rating: '3'
      }

      it(`responds with 400 and an error message when the '${field}' is missing`, () => {
        delete newBookmark[field];

        return supertest(app)
          .post('/bookmarks')
          .send(newBookmark)
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(400, {
            error: { message: `Missing '${field}' in request body` }
          })
      })
    })

    it(`removes XSS attack content from response`, () => {
      const { maliciousBookmark, expectedBookmark } = makeMaliciousBookmark();

      return supertest(app)
        .post('/bookmarks')
        .send(maliciousBookmark)
        .set("Authorization", `Bearer ${apiToken}`)
        .expect(201)
        .expect(res => {
          expect(res.body.title).to.eql(expectedBookmark.title)
          expect(res.body.bookmarkurl).to.eql(expectedBookmark.bookmarkurl)
          expect(res.body.description).to.eql(expectedBookmark.description)
          expect(res.body.rating).to.eql(expectedBookmark.rating)
        })
    })
  })

  describe(`DELETE /bookmarks/:id`, () => {
    context(`Given no bookmarks`, () => {
      it(`responds with 404 when bookmark doesn't exist`, () => {
        const bookmarkId = 123456;
        return supertest(app)
          .delete(`/bookmarks/${bookmarkId}`)
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(404, { error: { message: `Bookmark doesn't exist` } })
      })
    })

    context(`Given there are bookmarks in the database`, () => {
      const testBookmarks = makeBookmarksArray();

      beforeEach('insert bookmarks', () => {
        return db 
          .into('bookmarks')
          .insert(testBookmarks)
      })

      it('responds with 204 and removes the bookmark', () => {
        const idToRemove = 2;
        const expectedBookmarks = testBookmarks.filter(bookmark => bookmark.id !== idToRemove)
        return supertest(app)
          .delete(`/bookmarks/${idToRemove}`)
          .set("Authorization", `Bearer ${apiToken}`)
          .expect(204)
          .then(res =>
            supertest(app)
              .get('/bookmarks')
              .set("Authorization", `Bearer ${apiToken}`)
              .expect(expectedBookmarks)
          )
      })
    })
  })
})