const HTTP = require('q-io/http');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

const readFeed = {
  readFrom(feedurl) {
    return new Promise((resolve, reject) => {
      HTTP.request(feedurl)
      .then(res => res.body.read())
      .then(body => {
        parser.parseString(body, (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        })
      })
      .catch(reason => reject(reason))
    });
  },
};

module.exports = readFeed;
