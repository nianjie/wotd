
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./lib.cjs.production.min.js')
} else {
  module.exports = require('./lib.cjs.development.js')
}
