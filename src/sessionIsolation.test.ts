import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSessionScope,
  LatestScopedRequestGate,
  sessionMatchesScope,
} from './services/requestScope'
import { createSerializedAsyncValue } from './storage/serializedAsyncValue'

type TestSession = {
  serverUrl: string
  user: string
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

test('a slower service A result cannot replace the newer service B snapshot', () => {
  const gate = new LatestScopedRequestGate()
  const serviceA = gate.begin('https://service-a.example/api')
  const serviceB = gate.begin('https://service-b.example/api/')
  let committedServer = ''

  if (gate.accepts(serviceB, 'https://service-b.example/api')) {
    committedServer = 'service-b'
  }
  if (gate.accepts(serviceA, 'https://service-a.example/api/')) {
    committedServer = 'service-a'
  }

  assert.equal(committedServer, 'service-b')
  assert.equal(gate.accepts(serviceB, 'https://service-a.example/api/'), false)
})

test('a socket session scope rejects a different service and refreshed credentials', () => {
  const serviceA = {
    server_url: 'https://service-a.example/',
    access_token: 'access-a',
    refresh_token: 'refresh-a',
    user: { user_id: 'user-a' },
  }
  const scope = createSessionScope(serviceA)

  assert.equal(sessionMatchesScope(serviceA, scope), true)
  assert.equal(sessionMatchesScope({ ...serviceA, server_url: 'https://service-b.example/' }, scope), false)
  assert.equal(sessionMatchesScope({ ...serviceA, access_token: 'refreshed-access-a' }, scope), false)
})

test('an old me response cannot overwrite a newer service session', async () => {
  const serviceA: TestSession = { serverUrl: 'https://service-a.example/', user: 'a' }
  const refreshedA: TestSession = { serverUrl: 'https://service-a.example/', user: 'a-refreshed' }
  const serviceB: TestSession = { serverUrl: 'https://service-b.example/', user: 'b' }
  const serviceBWriteStarted = deferred()
  const releaseServiceBWrite = deferred()
  let stored: TestSession | null = serviceA

  const store = createSerializedAsyncValue<TestSession>(
    {
      read: async () => stored,
      write: async (value) => {
        if (value === serviceB) {
          serviceBWriteStarted.resolve()
          await releaseServiceBWrite.promise
        }
        stored = value
      },
      clear: async () => {
        stored = null
      },
    },
    (left, right) => JSON.stringify(left) === JSON.stringify(right),
  )

  const newServiceWrite = store.write(serviceB)
  await serviceBWriteStarted.promise
  const staleMeCommit = store.replace(serviceA, refreshedA)
  releaseServiceBWrite.resolve()

  await newServiceWrite
  assert.equal(await staleMeCommit, false)
  assert.deepEqual(await store.read(), serviceB)
})

test('a newer service write remains final when an older storage write is already running', async () => {
  const serviceA: TestSession = { serverUrl: 'https://service-a.example/', user: 'a' }
  const refreshedA: TestSession = { serverUrl: 'https://service-a.example/', user: 'a-refreshed' }
  const serviceB: TestSession = { serverUrl: 'https://service-b.example/', user: 'b' }
  const oldWriteStarted = deferred()
  const releaseOldWrite = deferred()
  let stored: TestSession | null = serviceA

  const store = createSerializedAsyncValue<TestSession>(
    {
      read: async () => stored,
      write: async (value) => {
        if (value === refreshedA) {
          oldWriteStarted.resolve()
          await releaseOldWrite.promise
        }
        stored = value
      },
      clear: async () => {
        stored = null
      },
    },
    (left, right) => JSON.stringify(left) === JSON.stringify(right),
  )

  const oldMeCommit = store.replace(serviceA, refreshedA)
  await oldWriteStarted.promise
  const newServiceWrite = store.write(serviceB)
  releaseOldWrite.resolve()

  assert.equal(await oldMeCommit, true)
  await newServiceWrite
  assert.deepEqual(await store.read(), serviceB)
})
