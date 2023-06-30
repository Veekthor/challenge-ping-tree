var parseJsonBody = require('body/json')
var sendJson = require('send-data/json')
var redis = require('./redis')
module.exports = {
  getAllTargets,
  createTarget,
  getTargetById,
  updateTargetById,
  getDecision
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

function getDecision (req, res, opt, cb) {
  parseJsonBody(req, res, function (err, data) {
    if (err) cb(err)
    validateVisitor(data, function (err, data) {
      if (err) return cb(err)
      makeDecision(data, req, res, cb)
    })
  })
}

function makeDecision (data, req, res, cb) {
  getTargetsFromDB(function (err, targets) {
    if (err) return cb(err)

    var hour = new Date(data.timestamp).getUTCHours()
    var filteredTargets = filterTargets(
      targets,
      data.geoState,
      hour.toString()
    )
    if (!filteredTargets.length) {
      return sendJson(req, res, { decision: 'reject' })
    }

    var sortedTargets = sortTargets(filteredTargets)
    redis.mget(
      sortedTargets.map(target => `target:${target.id}:acceptsToday`),
      function (err, acceptsTodayValues) {
        if (err) return cb(err)

        var found = false
        var millisecondsToMidnight =
          (new Date().setUTCHours(24, 0, 0, 0)) - new Date()

        for (var i = 0; i < acceptsTodayValues.length; i++) {
          var acceptsToday = parseInt(acceptsTodayValues[i] || 0)
          var target = sortedTargets[i]
          if (parseInt(target.maxAcceptsPerDay > acceptsToday)) {
            found = true
            redis.setex(
              `target:${target.id}:acceptsToday`,
              Math.round(millisecondsToMidnight / 1000),
              acceptsToday + 1)
            return sendJson(req, res, { decision: target.url })
          }
        }
        if (!found) { return sendJson(req, res, { decision: 'reject' }) }
      }
    )
  })
}

function filterTargets (targets, geoState, hour) {
  return targets.filter(function (target) {
    return target.accept.geoState.$in.includes(geoState) &&
      target.accept.hour.$in.includes(hour)
  })
}

function sortTargets (targets) {
  return targets.sort(
    (a, b) => parseFloat(a.value) < parseFloat(b.value) ? 1 : -1
  )
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

function validateTarget (data, cbk) {
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
    return cbk(badRequestObj('Fields are required'), null)
  }
  if (
    !Array.isArray(data.accept.geoState && data.accept.geoState.$in) ||
    !Array.isArray(data.accept.hour && data.accept.hour.$in)
  ) {
    return cbk(badRequestObj('hour and geoState must be arrays'), null)
  }
  return cbk(null, data)
}

function validateIdParam (params, cb) {
  if (!params || !params.id || isNaN(parseInt(params.id))) {
    return cb(badRequestObj('Id parameter is required'), null)
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
    return cb(badRequestObj('At least one field is required'), null)
  }
  if (
    (data.accept.geoState && !Array.isArray(data.accept.geoState.$in)) ||
    (data.accept.hour && !Array.isArray(data.accept.hour.$in))
  ) {
    return cb(badRequestObj('hour and geoState must be arrays'), null)
  }
  return cb(null, data)
}

function validateVisitor (data, cb) {
  if (!data.geoState || !data.timestamp) {
    return cb(badRequestObj('geoState and timestamp are required'), null)
  }
  if (typeof data.geoState !== 'string' || data.geoState.length !== 2) {
    return cb(badRequestObj('geoState must be a 2 character string'))
  }
  var timestamp = new Date(data.timestamp)
  if (!(timestamp instanceof Date && !isNaN(timestamp))) {
    return cb(badRequestObj('timestamp must be a valid date'))
  }

  return cb(null, data)
}

function badRequestObj (message) {
  return {
    statusCode: 400,
    message
  }
}
