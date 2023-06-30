var parseJsonBody = require('body/json')
var sendJson = require('send-data/json')
var redis = require('./redis')
module.exports = {
  getAllTargets,
  createTarget,
  getTargetById,
  updateTargetById
}

function getAllTargets (req, res, opt, cb) {
  getTargetsFromDB(function (err, data) {
    if (err) return cb(err)
    sendJson(req, res, { status: 'OK', data })
  })
}

function createTarget (req, res, opt, cbk) {
  parseJsonBody(req, res, function (err, data) {
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

function getTargetById (req, res, opt, cbk) {
  validateIdParam(opt.params, function (err, id) {
    if (err) return cbk(err)
    redis.get(`target:${id}`, function (err, target) {
      if (err) return cbk(err)
      if (target === null) {
        return cbk({
          statusCode: 404,
          message: 'Target not found'
        })
      }
      sendJson(req, res, { status: 'OK', target: JSON.parse(target) })
    })
  })
}

function updateTargetById (req, res, opt, cbk) {
  validateIdParam(opt.params, function (err, id) {
    if (err) return cbk(err)
    parseJsonBody(req, res, function (err, data) {
      if (err) return cbk(err)
      validateTargetUpdateData(data, function (err, data) {
        if (err) return cbk(err)
        redis.get(`target:${id}`, function (err, target) {
          if (err) return cbk(err)
          if (target === null) {
            return cbk({
              statusCode: 404,
              message: 'Target not found'
            })
          }

          data.id = id
          target = JSON.parse(target)
          target = Object.assign(target, data)

          redis.set(`target:${id}`, JSON.stringify(data), function (err, value) {
            if (err) return cbk(err)
            sendJson(req, res, { status: value })
          })
        })
      })
    })
  })
}

function getTargetsFromDB (cb) {
  redis.SMEMBERS('targets', function (err, targets) {
    if (err) return cb(err, null)
    if (!targets.length) return cb(null, [])

    redis.mget(targets, function (err, values) {
      if (err) return cb(err)

      var data = []
      values.forEach(function (val) {
        if (val !== null) data.push(JSON.parse(val))
      })

      cb(null, data)
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

function validateIdParam (params, cb) {
  if (!params || !params.id || isNaN(parseInt(params.id))) {
    return cb(new Error('Id parameter is required'), null)
  }
  return cb(null, params.id)
}

function validateTargetUpdateData (data, cb) {
  if (
    !(
      data.id ||
      data.url ||
      data.value ||
      data.maxAcceptsPerDay ||
      data.accept ||
      (data.accept && data.accept.geoState) ||
      (data.accept && data.accept.hour)
    )
  ) {
    return cb(new Error('Atleast one field is required'), null)
  }
  if (
    (data.accept.geoState && !Array.isArray(data.accept.geoState.$in)) ||
    (data.accept.hour && !Array.isArray(data.accept.hour.$in))
  ) {
    return cb(new Error('hour and geoState must be arrays'), null)
  }
  return cb(null, data)
}
