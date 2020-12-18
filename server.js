const HTTP = require('q-io/http');
const APPS = require('q-io/http-apps');
const fireAdmin = require('firebase-admin');
const feedReader = require('./readfeed');
const wotdCore = require('./lib/index');

const firebaseConfig = require(process.env.DEV ? './.env/serviceAccount.json' : './firebase.account'); // eslint-disable-line 
const firebaseApp = fireAdmin.initializeApp({
  databaseURL: firebaseConfig.databaseURL,
  credential: fireAdmin.credential.cert(firebaseConfig),
});

const root = firebaseApp.database().ref();
const oxfordDictionary = new wotdCore.Dictionary(root);

function isWordOfTheDay(e, today) {
  const updatedday = new Date(e.updated[0]);
  return updatedday.getUTCFullYear() === today.getUTCFullYear()
    && updatedday.getUTCMonth() === today.getUTCMonth()
    && updatedday.getUTCDate() === today.getUTCDate();
}

function getRandomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min; // The maximum is inclusive and the minimum is inclusive
}

function readFeedFrom(feedurl) {
  return feedReader.readFrom(feedurl)
    .then((xmlobj) => {
      const today = new Date();
      xmlobj.feed.entry.forEach((e) => {
        // save to the dictionary if word of the today
        if (isWordOfTheDay(e, today)) {
          const title = e.title[0];
          const updated = e.updated[0];
          const link = e['feedburner:origLink'][0];
          const definition = title;
          oxfordDictionary.createWordOfTheDay({title, definition, link, updated}); // eslint-disable-line
        }
      });
    })
    .catch((reason) => {
      console.log(`Reading rss feed faild. Because ${reason}`);
    });
}

/**
 * Fetch word of the day.
 * if no specific date is given, defual to today.
 */
function wordOfTheDay(today = new Date()) {
  return oxfordDictionary.getWordOfTheDay(today)
    .then(word => APPS.json(word));
}

function wotd() {
  return wordOfTheDay();
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
  const all = words.map(w => oxfordDictionary.getWord(w));
  return Promise.all(all)
    .then(definitions => APPS.json(definitions));
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
  const randomDay = new Date(year, month, day);
  console.log(`random day: ${randomDay}.`);
  return oxfordDictionary.getWordOfTheDay(randomDay)
    .then((word) => {
      if (word) {
        return word;
      }
      // recursively call randomWOTD till either exceed maximum rounds or find a location word being available
      return randomWOTD(counter + 1);
    });
}

// Response to ROOT/all
function wotdAllBranch() {
  return APPS.ok('all is awesome.');
}

// Response to ROOT/chronological
// If no further path or ending with /,
// APPS.ok is invoked to show usage tips;
// otherwise the rest is processed like below:
// if it starts with today/(including end up with today),
// then wotd is invoked,
// otherwise wotdChronological.
const chronologicalBranch = APPS.Chain()
  .use(APPS.Cap, APPS.Branch({
    today: wotd,
  }, wotdChronological))
  .end(() => APPS.ok('specify the date in URL.'));

// Response to ROOT/alphabetical
const alphabeticalBranch = APPS.Chain()
  .use(APPS.Cap, wotdAlphabetical)
  .end(() => APPS.ok('specify the words(separating with forward slashs) in URL')); // eslint-disable-line

// Response to ROOT/count
function wotdCountBranch() {
  return oxfordDictionary.getWordCount()
    .then(num => APPS.json(num))
    .catch(reason => APPS.ok(`Opps! Something is wrong : ${reason}`));
}

// Response to ROOT/random
function wotdRandomBranch() {
  return randomWOTD()
    .then(word => oxfordDictionary.getWord(word))
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
//            |__/today
//            |__/YYYY/MM/DD
//        |__/alphabetical
//        |__/count
//        |__/random
const wotdAPI = APPS.Chain()
  .use(APPS.Cap, APPS.Branch({
    all: wotdAllBranch,
    chronological: chronologicalBranch,
    alphabetical: alphabeticalBranch,
    count: wotdCountBranch,
    random: wotdRandomBranch,
  }))
  .end(wotd);

const app = APPS.Chain()
  .use(APPS.Log)
  .use(APPS.Branch)
  .end({
    wotd: wotdAPI,
  });

const server = HTTP.Server(app);
const port = process.env.PORT ? 80 : (process.env.DEV ? 8080 : 0); // eslint-disable-line

server.listen(port).then((lserver) => {
  console.log(`Application is listening on port:${lserver.address().port}.`);
  // Oxford Learner's Dictionaries Feed
  const OLDFeed = 'http://feeds.feedburner.com/OLD-WordOfTheDay';
  readFeedFrom(OLDFeed);
}).catch((reason) => {
  // all un-caught error should come here
  console.log(`error[system] : ${reason}`);
});
