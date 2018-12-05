const HTTP = require('q-io/http');
const APPS = require('q-io/http-apps');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

const fireAdmin = require('firebase-admin');

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

function getDef(summary) {
  let index = 0;
  if (summary && (index = summary.indexOf('<img src=')) > 0) { // eslint-disable-line
    return summary.substring(0, index);
  }
  return summary;
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
  return HTTP.request(feedurl)
    .then(res => res.body.read())
    // Here the parser, a dependent 3rd lib, makes use of the Node.js callback pattern,
    // where callbacks are in the form of function(err, result).
    // Wrapping as thenable so make it support promise.
    .then(body => Promise.resolve({
      then(onFullfill, onReject) {
        parser.parseString(body, (error, result) => {
          if (error) {
            onReject(error);
          } else {
            onFullfill(result);
          }
        });
      },
    }))
    .done((xmlobj) => {
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
                const detail = {
                  updated: e.updated[0],
                  link: e['feedburner:origLink'][0],
                  definition: getDef(e.summary[0]._),
                };
                snap.ref.set(detail);
              }
            });
        }
      });
    });
}

/**
 * Fetch word of the day based on the strcture of Schema B.
 */
function wotd() {
  const today = new Date();
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
        console.log(`No value saved under the latest:${location}.`);
        return null;
      }
      return root.child('word')
        .child(latest)
        .once('value')
        .then(wordsnap => wordsnap.val());
    })
    .then(word => APPS.json(word));
}

function wotdAll() {
  return APPS.ok('all is awesome.');
}

// complete date specified as URI if incompleted with default value,
// then return it as a Date object.
// dateURI always starts with '/'.
function normaliseDate(dateURI) {
  let segs = dateURI.split('/');
  console.log(`segs with value ${segs}`);
  switch (segs.length) {
    case 2:
      segs = [...segs, '1', '1'];
      break;
    case 3:
      segs = [...segs, '1'];
      break;
    default:
      break;
  }
  segs[2] = parseInt(segs[2], 10) % 12 - 1; // month value is between 0 and 11.
  [, ...segs] = segs;
  return new Date(...segs);
}

function wotdChronological(req) {
  const date = normaliseDate(req.pathInfo);
  return APPS.ok(`request for date of ${date.toLocaleDateString()}`);
}

function wotdAlphabetical() {
  return APPS.ok('alphabetical list will be the result.');
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
    alphabetical: wotdAlphabetical,
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
