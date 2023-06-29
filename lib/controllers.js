var bodyJson = require('body/json')
var sendJson = require('send-data/json')
var redis = require('./redis')
module.exports = {
  createTarget
}

function createTarget (req, res, opt, cbk) {
  bodyJson(req, res, function (err, data) {
    if (err) {
      return cbk({ statusCode: 400, message: 'Something went wrong' })
    }
    validateTarget(data, function (err, data) {
      console.log(data)
      if (err) return cbk(err)
      redis.sadd('targets', `target:${data.id}`, function (err, value) {
        if (err) return cbk(err)
        if (value === 0) {
          return sendJson(req, res, {
            statusCode: 400,
            body: {
              status: `Target with id:${data.id} already exists`
            }
          })
        }
        redis.set(
          `target:${data.id}`,
          JSON.stringify(data),
          function (err, value) {
            if (err) return cbk(err)
            sendJson(req, res, { status: value })
          }
        )
      })
    })
  })
}

function validateTarget (data, cb) {
  if (
    !(
      data.id &&
      data.url &&
      data.value &&
      data.maxAcceptsPerDay &&
      data.accept &&
      data.accept.geoState &&
      data.accept &&
      data.accept.hour
    )
  ) {
    return cb(new Error('Fields are required'), null)
  }
  if (
    !Array.isArray(data.accept.geoState && data.accept.geoState.$in) ||
    !Array.isArray(data.accept.hour && data.accept.hour.$in)
  ) {
    return cb(new Error('hour and geoState must be arrays'), null)
  }
  return cb(null, data)
}
