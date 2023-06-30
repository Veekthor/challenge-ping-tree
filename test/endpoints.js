process.env.NODE_ENV = 'test'

var test = require('ava')
var servertest = require('servertest')

var server = require('../lib/server')
var redis = require('../lib/redis')

test.serial.cb('healthcheck', function (t) {
  var url = '/health'
  servertest(server(), url, { encoding: 'json' }, function (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.status, 'OK', 'status is ok')
    t.end()
  })
})

test.serial.cb('should successfully add new target', function (t) {
  redis.FLUSHDB()
  var url = '/api/targets'
  var opt = { method: 'POST', encoding: 'json' }
  var newTarget = getTestTarget()

  servertest(server(), url, opt, onResponse).end(JSON.stringify(newTarget))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.status, 'OK', 'status is ok')

    redis.get(`target:${newTarget.id}`, function (err, value) {
      t.falsy(err, 'no error')
      t.deepEqual(JSON.parse(value), newTarget, 'values should match')
      t.end()
    })
  }
})

test.serial.cb('should prevent adding new target if duplicate', function (t) {
  redis.FLUSHDB()
  var url = '/api/targets'
  var opt = { method: 'POST', encoding: 'json' }
  var newTarget = getTestTarget()

  seedRedis([newTarget])

  servertest(server(), url, opt, onResponse).end(JSON.stringify(newTarget))

  function onResponse (err, res) {
    t.falsy(err, 'no error')
    t.is(res.statusCode, 400, 'correct statusCode')
    t.is(res.body.status, 'Target with id:1 already exists', 'status is ok')
    t.end()
  }
})

test.serial.cb('should prevent adding new target if required fields are missing', function (t) {
  redis.FLUSHDB()
  var url = '/api/targets'
  var opt = { method: 'POST', encoding: 'json' }
  var newTarget = getTestTarget()

  delete newTarget.id

  servertest(server(), url, opt, onResponse).end(JSON.stringify(newTarget))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 400, 'correct statusCode')
    t.is(res.body.error, 'Fields are required', 'status is ok')
    t.end()
  }
})

test.serial.cb('should prevent adding new target if field has wrong type', function (t) {
  redis.FLUSHDB()
  var url = '/api/targets'
  var opt = { method: 'POST', encoding: 'json' }
  var newTarget = getTestTarget()

  newTarget.accept.geoState = 'ca'

  servertest(server(), url, opt, onResponse).end(JSON.stringify(newTarget))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 400, 'correct statusCode')
    t.is(res.body.error, 'hour and geoState must be arrays', 'status is ok')
    t.end()
  }
})

test.serial.cb('should get all targets', function (t) {
  redis.FLUSHDB()
  var url = '/api/targets'
  var opt = { method: 'GET', encoding: 'json' }
  var dummyTargets = [getTestTarget(), getTestTarget({ id: 2 })]

  seedRedis(dummyTargets)

  servertest(server(), url, opt, onResponse)

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.status, 'OK', 'status is ok')
    t.truthy(res.body.data)
    t.truthy(res.body.data.length === 2)
    t.deepEqual(res.body.data, dummyTargets)
    t.end()
  }
})

test.serial.cb('should successfully get target by id', function (t) {
  redis.FLUSHDB()
  var url = '/api/target/1'
  var opt = { method: 'GET', encoding: 'json' }
  var dummyTarget = getTestTarget()
  seedRedis([dummyTarget])

  servertest(server(), url, opt, onResponse)

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.status, 'OK', 'status is ok')
    t.deepEqual(res.body.target, dummyTarget)
    t.end()
  }
})

test.serial.cb('should fail getTarget if id does not exist', function (t) {
  redis.FLUSHDB()
  var url = '/api/target/2'
  var opt = { method: 'GET', encoding: 'json' }

  seedRedis([getTestTarget()])

  servertest(server(), url, opt, onResponse)

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 404, 'correct statusCode')
    t.is(res.body.error, 'Target not found', 'status is ok')

    t.end()
  }
})

test.serial.cb('should not get target if id is not a number', function (t) {
  redis.FLUSHDB()
  var url = '/api/target/id'
  var opt = { method: 'GET', encoding: 'json' }

  seedRedis([getTestTarget()])

  servertest(server(), url, opt, onResponse)

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 400, 'correct statusCode')
    t.is(res.body.error, 'Id parameter is required', 'status is ok')

    t.end()
  }
})

test.serial.cb('should successfully update target by id', function (t) {
  redis.FLUSHDB()
  var url = '/api/target/1'
  var opt = { method: 'POST', encoding: 'json' }
  var dummyTarget = getTestTarget()

  seedRedis([dummyTarget])

  // Update target properties
  dummyTarget.value = '1'
  dummyTarget.maxAcceptsPerDay = '30'

  servertest(server(), url, opt, onResponse).end(JSON.stringify(dummyTarget))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.status, 'OK', 'status is ok')

    redis.get(`target:${dummyTarget.id}`, function (err, value) {
      t.falsy(err, 'no error')
      t.deepEqual(JSON.parse(value), dummyTarget, 'values should match')
      t.end()
    })
  }
})

test.serial.cb('should not update target if body is empty', function (t) {
  redis.FLUSHDB()
  var url = '/api/target/1'
  var opt = { method: 'POST', encoding: 'json' }
  var dummyTarget = getTestTarget()

  seedRedis([dummyTarget])

  servertest(server(), url, opt, onResponse).end('{}')

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 400, 'correct statusCode')
    t.is(res.body.error, 'At least one field is required', 'status is ok')

    t.end()
  }
})

test.serial.cb('should fail updating target by id when geoState is invalid',
  function (t) {
    redis.FLUSHDB()
    var url = '/api/target/1'
    var opt = { method: 'POST', encoding: 'json' }
    var dummyTarget = getTestTarget()

    seedRedis([dummyTarget])

    // Update target properties
    dummyTarget.accept = {
      geoState: 'ny',
      hour: {
        $in: ['13', '14', '15']
      }
    }

    servertest(server(), url, opt, onResponse).end(JSON.stringify(dummyTarget))

    function onResponse (err, res) {
      t.falsy(err, 'no error')

      t.is(res.statusCode, 400, 'correct statusCode')
      t.is(res.body.error, 'hour and geoState must be arrays', 'status is ok')

      t.end()
    }
  })

test.serial.cb('should fail update if id does not exist', function (t) {
  redis.FLUSHDB()
  var url = '/api/target/1232'
  var opt = { method: 'POST', encoding: 'json' }
  var dummyTarget = getTestTarget()

  seedRedis([dummyTarget])

  // Update target properties
  dummyTarget.value = '1'
  dummyTarget.maxAcceptsPerDay = '50'

  servertest(server(), url, opt, onResponse).end(JSON.stringify(dummyTarget))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 404, 'correct statusCode')
    t.is(res.body.error, 'Target not found', 'status is ok')

    t.end()
  }
})

test.serial.cb('should get target url in decision', function (t) {
  redis.FLUSHDB()
  var url = '/route'
  var opt = { method: 'POST', encoding: 'json' }
  var visitor = getTestVisitor()
  var dummyTarget = getTestTarget()

  seedRedis([dummyTarget])

  servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.decision, dummyTarget.url, 'found target')
    t.end()
  }
})

test.serial.cb('should reject visitor if no target accepts its state',
  function (t) {
    redis.FLUSHDB()
    var url = '/route'
    var opt = { method: 'POST', encoding: 'json' }
    var visitor = getTestVisitor({ geoState: 'kk' })
    var dummyTarget = getTestTarget()

    seedRedis([dummyTarget])

    servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

    function onResponse (err, res) {
      t.falsy(err, 'no error')

      t.is(res.statusCode, 200, 'correct statusCode')
      t.is(res.body.decision, 'reject', 'target rejected')
      t.end()
    }
  })

test.serial.cb('should reject visitor is no target accepts timestamp', function (t) {
  redis.FLUSHDB()
  var url = '/route'
  var opt = { method: 'POST', encoding: 'json' }
  var visitor = getTestVisitor({ timestamp: '2018-07-19T23:28:59.513Z' })
  var dummyTarget = getTestTarget()

  seedRedis([dummyTarget])

  servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

  function onResponse (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.decision, 'reject', 'target rejected')
    t.end()
  }
})

test.serial.cb('should reject visitor all targets are past maxAcceptsPerDay',
  function (t) {
    redis.FLUSHDB()
    var url = '/route'
    var opt = { method: 'POST', encoding: 'json' }
    var visitor = getTestVisitor()
    var dummyTarget = getTestTarget({ maxAcceptsPerDay: 0 })

    seedRedis([dummyTarget])

    servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

    function onResponse (err, res) {
      t.falsy(err, 'no error')

      t.is(res.statusCode, 200, 'correct statusCode')
      t.is(res.body.decision, 'reject', 'target rejected')
      t.end()
    }
  })

test.serial.cb('should fail visitor decision if required visitor field is missing',
  function (t) {
    redis.FLUSHDB()
    var url = '/route'
    var opt = { method: 'POST', encoding: 'json' }
    var visitor = getTestVisitor()
    var dummyTarget = getTestTarget()

    seedRedis([dummyTarget])

    delete visitor.timestamp

    servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

    function onResponse (err, res) {
      t.falsy(err, 'no error')

      t.is(res.statusCode, 400, 'correct statusCode')
      t.is(res.body.error, 'geoState and timestamp are required', 'status is ok')
      t.end()
    }
  })

test.serial.cb('should fail visitor decision if geoState is invalid',
  function (t) {
    redis.FLUSHDB()
    var url = '/route'
    var opt = { method: 'POST', encoding: 'json' }
    var visitor = getTestVisitor({ geoState: 'AAA' })
    var dummyTarget = getTestTarget()

    seedRedis([dummyTarget])

    servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

    function onResponse (err, res) {
      t.falsy(err, 'no error')

      t.is(res.statusCode, 400, 'correct statusCode')
      t.is(
        res.body.error, 'geoState must be a 2 character string', 'status is ok'
      )
      t.end()
    }
  })

test.serial.cb('should fail visitor decision if timestamp is invalid',
  function (t) {
    redis.FLUSHDB()
    var url = '/route'
    var opt = { method: 'POST', encoding: 'json' }
    var visitor = getTestVisitor({ timestamp: 'AAA' })
    var dummyTarget = getTestTarget()

    seedRedis([dummyTarget])

    servertest(server(), url, opt, onResponse).end(JSON.stringify(visitor))

    function onResponse (err, res) {
      t.falsy(err, 'no error')

      t.is(res.statusCode, 400, 'correct statusCode')
      t.is(res.body.error, 'timestamp must be a valid date', 'status is ok')
      t.end()
    }
  })

function getTestTarget (override) {
  return {
    id: '1',
    url: 'http://example.com',
    value: '0.50',
    maxAcceptsPerDay: '10',
    accept: {
      geoState: {
        $in: ['ca', 'ny']
      },
      hour: {
        $in: ['13', '14', '15']
      }
    },
    ...override
  }
}

function getTestVisitor (overrides) {
  return {
    geoState: 'ca',
    publisher: 'abc',
    timestamp: '2018-07-19T13:28:59.513Z',
    ...overrides
  }
}

function seedRedis (targets) {
  for (var i = 0; i < targets.length; i++) {
    var target = targets[i]
    redis.set(`target:${target.id}`, JSON.stringify(targets[i]))
    redis.sadd('targets', `target:${target.id}`)
  }
}
