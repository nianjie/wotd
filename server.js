const HTTP = require('q-io/http');
const APPS = require('q-io/http-apps');

const fireAdmin = require('firebase-admin');

import feedReader from './readfeed.js'; // eslint-disable-line import/order,import/first

const firebaseApp = fireAdmin.initializeApp({
  databaseURL: 'https://newwotd.firebaseio.com/',
  credential: fireAdmin.credential.cert(require(process.env.DEV ? './.env/serviceAccount.json' : './firebase.account')), // eslint-disable-line
});
const root = firebaseApp.database().ref();

const port = process.env.PORT || 0;

function isWordOfTheDay(e, today) {
  const updatedday = new Date(e.updated[0]);
  return updatedday.getUTCFullYear() === today.getUTCFullYear()
    && updatedday.getUTCMonth() === today.getUTCMonth()
    && updatedday.getUTCDate() === today.getUTCDate();
}

function getRandomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min; // The maximum is inclusive and the minimum is inclusive
}

//
// schema B
// WOTD
//    |
//    |-chronological
//    |  |
//    |  |-2017
//    |  |    |
//    |  |    |-0
//    |  |    | |
//    |  |    | |-1
//    |  |    | | |-word A
//    |  |    | |
//    |  |    | |-2
//    |  |    | | |-word B
//    |  |    | |
//    |  |    | |-...
//    |  |    |   |-word C
//    |  |    |
//    |  |    |-1
//    |  |    | |
//    |  |    | |-1
//    |  |    | | |-word D
//    |  |    | |
//    |  |    | |-...
//    |  |    |    |-word E
//    |  |    |
//    |  |    |-+...
//    |  |
//    |  |-+2016
//    |  |
//    |  |-+20...
//    |
//    |-word
//       |-word A
//       |  |-definition:
//       |  |-link:
//       |  |-updated:
//       |-word B
//       |  |-definition:
//       |  |-link:
//       |  |-updated:
//       |-word ...
//          |-definition:
//          |-link:
//          |-updated:
//
// advantange/disadvantage of this structure:
// +) easy to track down words by dates
// +) give no chance to ignore word that has previously been appeared
// -) need efforts to implement
function readFeedFrom(feedurl) {
  return feedReader.readFrom(feedurl)
    .then((xmlobj) => {
      // save to firebase under location of ROOT/year/month/date
      const today = new Date();
      const location = `${today.getUTCFullYear()}/${today.getUTCMonth()}/${today.getUTCDate()}`; // eslint-disable-line
      xmlobj.feed.entry.forEach((e) => {
        if (isWordOfTheDay(e, today)) {
          // save the word under chronological
          root.child(`chronological/${location}/`).set(`${e.title[0]}`);
          // then save other detail attributes under word
          root.child(`word/${e.title[0]}`).once('value')
            .then((snap) => {
              if (!snap.exists()) {
                const updated = e.updated[0];
                const link = e['feedburner:origLink'][0];
                const definition = e.title[0];
                const detail = {
                  updated,
                  link,
                  definition,
                };
                snap.ref.set(detail);
              }
            });
        }
      });
    })
    .catch((reason) => {
      console.log(`Reading rss feed faild. Because ${reason}`);
    });
}

/**
 * Fetch word of the day based on the strcture of Schema B.
 * if no specific date is given, defual to today.
 */
function wordOfTheDay(today = new Date()) {
  // construct location upon date, where word is saved.
  // however more details are saved under the location in which constructure the word self is part of.
  const location = `${today.getUTCFullYear()}/${today.getUTCMonth()}/${today.getUTCDate()}`; // eslint-disable-line
  return root.child(`chronological/${location}`)
    .once('value')
    .then(latestsnap => latestsnap.val())
    .then((latest) => {
      if (!latest) {
        // deal with the case the latest word not exist yet,
        // and if so null instead of exception is returned.
        console.log(`No value saved under :${location}.`);
        return null;
      }
      return root.child('word')
        .child(latest)
        .once('value')
        .then(wordsnap => wordsnap.val());
    })
    .then(word => APPS.json(word));
}

function wotd() {
  return wordOfTheDay();
}

function wotdAll() {
  return APPS.ok('all is awesome.');
}

// complete date specified by URI if incompleted with default value,
// then return it as a Date object.
// dateURI always starts with '/'.
function normaliseDate(dateURI) {
  let segs = dateURI.split('/');
  console.log(`segs with value ${segs}`);
  switch (segs.length) {
    case 2:
      segs = [...segs, '1', '1']; // complete both of month and date
      break;
    case 3:
      segs = [...segs, '1']; // complete date
      break;
    default:
      break;
  }
  segs[2] = (parseInt(segs[2], 10) - 1) % 12; // month value is between 0 and 11.
  segs[3] = parseInt(segs[3], 10) % 31; // date value is an integer between 1 and 31.
  [, ...segs] = segs; // reduce the segs[0]( equal '').
  return new Date(...segs);
}

function wotdChronological(req) {
  const today = normaliseDate(req.pathInfo);
  return wordOfTheDay(today);
}

function wotdAlphabetical(req) {
  let words = req.pathInfo.split('/');
  words = words.reduce((acc, w) => {
    if (w.length > 0) { // exclude empty elements.
      acc.push(w);
    }
    return acc;
  }, []);
  console.log(`requested words ${words}`);
  const all = words.map(w => root.child('word')
    .child(w)
    .once('value')
    .then(wordsnap => wordsnap.val()));
  return Promise.all(all)
    .then(definitions => APPS.json(definitions));
}

function wotdCount() {
  return root.child('word')
    .once('value')
    .then(snap => snap.numChildren())
    .then(num => APPS.json(num))
    .catch(reason => APPS.ok(`Opps! Something is wrong : ${reason}`));
}

function randomWOTD(counter = 0) {
  console.log(`randomWOTD start[${counter}].`);
  if (counter > 10) {
    throw new Error('random too many times.');
  }
  const today = new Date();
  const year = getRandomIntInclusive(2017, today.getUTCFullYear());
  const month = getRandomIntInclusive(0, today.getUTCMonth());
  const day = getRandomIntInclusive(1, today.getUTCDate());
  const location = `${year}/${month}/${day}`;
  console.log(`random access to ${location}.`);
  return root.child(`chronological/${location}`)
    .once('value')
    .then((snap) => {
      if (snap.exists()) {
        return snap.val();
      }
      return randomWOTD(counter + 1); // recursively call randomWOTD till either exceed maximum rounds or find a location word being available
    });
}

function wotdRandom() {
  return randomWOTD()
    .then(word => root.child(`word/${word}`).once('value'))
    .then(wordsnap => wordsnap.val())
    .then(word => APPS.json(word))
    .catch(reason => APPS.ok(`Opps! Something is wrong : ${reason}`));
}

// By applying combination of Chain and Branch together,
// it's nicely easy to build a lightweight API that can be deployed or attached to any path route.
// The following code snippet constructs an API that has a following structure:
// WOTD API
//        |_/.
//        |__/all
//        |__/chronological
//        |__/alphabetical
//        |__/count
//        |__/random
const wotdAPI = APPS.Chain()
  .use(APPS.Cap, APPS.Branch({
    all: wotdAll,
    chronological: APPS.Chain()
      .use(APPS.Cap, wotdChronological)
      .end(() => APPS.ok('specify the date in URL.')),
    alphabetical: APPS.Chain()
      .use(APPS.Cap, wotdAlphabetical)
      .end(() => APPS.ok('specify the words(separating with forward slashs) in URL')), // eslint-disable-line
    count: wotdCount,
    random: wotdRandom,
  }))
  .end(wotd);

const app = APPS.Chain()
  .use(APPS.Log)
  .use(next => APPS.Branch({
    wotd: wotdAPI,
  }, next))
  .end(APPS.notFound);

const server = HTTP.Server(app);

server.listen(port).then((lserver) => {
  console.log(`Application is listening on port:${lserver.address().port}.`);
  // Oxford Learner's Dictionaries Feed
  const OLDFeed = 'http://feeds.feedburner.com/OLD-WordOfTheDay';
  readFeedFrom(OLDFeed);
}).catch((reason) => {
  // all un-caught error should come here
  console.log(`error[system] : ${reason}`);
});
