import { Client, Session } from '@heroiclabs/nakama-js'
import {
  createContext,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react'
import { nakamaConfig, nakamaServerLabel } from '../lib/nakamaConfig.js'

const NakamaContext = createContext(null)

const STORAGE_KEYS = {
  deviceId: 't3.device.id',
  sessionToken: 't3.session.token',
  refreshToken: 't3.session.refresh',
  activeMatch: 't3.active.match',
}

const MAX_ACTIVITY_ITEMS = 12

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeTimeLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function createDeviceIdentifier() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4)
    globalThis.crypto.getRandomValues(values)

    return Array.from(values)
      .map((value) => value.toString(16).padStart(8, '0'))
      .join('-')
  }

  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

function getStoredMatch() {
  const raw = localStorage.getItem(STORAGE_KEYS.activeMatch)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem(STORAGE_KEYS.activeMatch)
    return null
  }
}

function persistMatch(match) {
  if (!match) {
    localStorage.removeItem(STORAGE_KEYS.activeMatch)
    return
  }

  localStorage.setItem(STORAGE_KEYS.activeMatch, JSON.stringify(match))
}

function persistSession(session) {
  localStorage.setItem(STORAGE_KEYS.sessionToken, session.token)
  localStorage.setItem(STORAGE_KEYS.refreshToken, session.refresh_token)
}

function clearPersistedSession() {
  localStorage.removeItem(STORAGE_KEYS.sessionToken)
  localStorage.removeItem(STORAGE_KEYS.refreshToken)
}

function restoreStoredSession() {
  const token = localStorage.getItem(STORAGE_KEYS.sessionToken)
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken)

  if (!token || !refreshToken) {
    return null
  }

  try {
    return Session.restore(token, refreshToken)
  } catch {
    clearPersistedSession()
    return null
  }
}

function getDeviceId() {
  const existing = localStorage.getItem(STORAGE_KEYS.deviceId)

  if (existing) {
    return existing
  }

  const created = createDeviceIdentifier()
  localStorage.setItem(STORAGE_KEYS.deviceId, created)
  return created
}

function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

function parsePayload(value) {
  if (!value) {
    return null
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  return value
}

function parseRpcPayload(response) {
  return parsePayload(response?.payload)
}

function decodeMatchData(data) {
  if (!data) {
    return null
  }

  if (typeof data === 'string') {
    return parsePayload(data)
  }

  return parsePayload(new TextDecoder().decode(data))
}

function eventMessage(payload) {
  if (!payload) {
    return 'Server update received.'
  }

  if (payload.message) {
    return payload.message
  }

  if (payload.reason) {
    return payload.reason
  }

  return 'Server update received.'
}

async function syncDisplayName(client, session, displayName) {
  if (!displayName) {
    return
  }

  await client.updateAccount(session, {
    display_name: displayName,
  })
}

export function NakamaProvider({ children }) {
  const initialMatch = getStoredMatch()
  const clientRef = useRef(
    new Client(
      nakamaConfig.serverKey,
      nakamaConfig.host,
      nakamaConfig.port,
      nakamaConfig.useSSL,
    ),
  )
  const socketRef = useRef(null)
  const sessionRef = useRef(null)
  const activeMatchRef = useRef(initialMatch)
  const listenerBucketsRef = useRef({
    matchData: new Set(),
    matchPresence: new Set(),
  })

  const [session, setSession] = useState(null)
  const [account, setAccount] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [connectionState, setConnectionState] = useState('offline')
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [activeMatch, setActiveMatch] = useState(initialMatch)
  const [matchmaking, setMatchmaking] = useState(null)
  const [leaderboard, setLeaderboard] = useState({
    records: [],
    loading: false,
    error: '',
    lastUpdated: '',
  })
  const [activity, setActivity] = useState([])

  function addActivity(message, tone = 'neutral') {
    startTransition(() => {
      setActivity((current) => [
        {
          id: makeId('activity'),
          message,
          tone,
          time: makeTimeLabel(),
        },
        ...current,
      ].slice(0, MAX_ACTIVITY_ITEMS))
    })
  }

  function updateActiveMatch(nextMatch) {
    activeMatchRef.current = nextMatch
    persistMatch(nextMatch)
    setActiveMatch(nextMatch)
  }

  function clearActiveMatch() {
    activeMatchRef.current = null
    persistMatch(null)
    setActiveMatch(null)
  }

  function subscribe(bucket, handler) {
    listenerBucketsRef.current[bucket].add(handler)

    return () => {
      listenerBucketsRef.current[bucket].delete(handler)
    }
  }

  function subscribeMatchData(handler) {
    return subscribe('matchData', handler)
  }

  function subscribeMatchPresence(handler) {
    return subscribe('matchPresence', handler)
  }

  function forwardMatchData(message) {
    listenerBucketsRef.current.matchData.forEach((handler) => {
      handler(message)
    })
  }

  function forwardMatchPresence(event) {
    listenerBucketsRef.current.matchPresence.forEach((handler) => {
      handler(event)
    })
  }

  async function ensureSocket(nextSession = sessionRef.current) {
    if (!nextSession) {
      throw new Error('Authenticate before opening the realtime socket.')
    }

    if (socketRef.current) {
      return socketRef.current
    }

    const nextSocket = clientRef.current.createSocket(nakamaConfig.useSSL, false)

    nextSocket.ondisconnect = () => {
      socketRef.current = null
      setConnectionState('offline')
      addActivity('Realtime socket disconnected.', 'warning')
    }

    nextSocket.onerror = () => {
      addActivity('Socket error reported by Nakama.', 'danger')
    }

    nextSocket.onmatchdata = (message) => {
      if (message.op_code === 3) {
        const payload = decodeMatchData(message.data)
        const tone = payload?.type === 'validation_error' ? 'warning' : 'accent'
        addActivity(eventMessage(payload), tone)
      }

      forwardMatchData(message)
    }

    nextSocket.onmatchpresence = (event) => {
      event.joins.forEach((presence) => {
        addActivity(`${presence.username} connected to the arena.`, 'accent')
      })

      event.leaves.forEach((presence) => {
        addActivity(`${presence.username} left the arena.`, 'warning')
      })

      forwardMatchPresence(event)
    }

    nextSocket.onmatchmakermatched = async (matched) => {
      const mode = matched.self?.string_properties?.mode ?? 'classic'

      setMatchmaking(null)
      addActivity(`Match found in ${mode} mode. Joining match.`, 'accent')

      try {
        await joinMatchInternal({
          matchId: matched.match_id,
          token: matched.token,
          mode,
          source: 'matchmaker',
        })
      } catch (joinError) {
        setError(normalizeError(joinError, 'Unable to join the matched game.'))
      }
    }

    setConnectionState('connecting')
    await nextSocket.connect(nextSession, true)
    socketRef.current = nextSocket
    setConnectionState('online')

    return nextSocket
  }

  async function loadAccount(nextSession = sessionRef.current) {
    if (!nextSession) {
      return null
    }

    const nextAccount = await clientRef.current.getAccount(nextSession)
    setAccount(nextAccount)
    return nextAccount
  }

  async function loadLeaderboard(limit = 10, silent = false, nextSession = sessionRef.current) {
    if (!nextSession) {
      return null
    }

    if (!silent) {
      setLeaderboard((current) => ({
        ...current,
        loading: true,
        error: '',
      }))
    }

    try {
      const response = await clientRef.current.rpc(nextSession, 'list_leaderboard', {
        limit,
      })
      const payload = parseRpcPayload(response) ?? {}

      startTransition(() => {
        setLeaderboard({
          records: payload.records ?? [],
          loading: false,
          error: '',
          lastUpdated: makeTimeLabel(),
        })
      })

      return payload
    } catch (loadError) {
      const message = normalizeError(loadError, 'Unable to load leaderboard.')

      startTransition(() => {
        setLeaderboard((current) => ({
          ...current,
          loading: false,
          error: message,
        }))
      })

      return null
    }
  }

  async function joinMatchInternal(details) {
    const nextSocket = await ensureSocket()
    const joinedMatch = await nextSocket.joinMatch(details.matchId, details.token)
    const nextMatch = {
      matchId: joinedMatch.match_id,
      roomCode: details.roomCode ?? null,
      mode: details.mode ?? 'classic',
      source: details.source ?? 'room',
    }

    updateActiveMatch(nextMatch)
    addActivity(`Joined match ${joinedMatch.match_id.slice(0, 8)}.`, 'accent')

    return joinedMatch
  }

  async function bootstrapSession(nextSession, message) {
    sessionRef.current = nextSession
    persistSession(nextSession)
    setSession(nextSession)
    setError('')

    try {
      await ensureSocket(nextSession)
      await loadAccount(nextSession)
      await loadLeaderboard(10, true, nextSession)

      const savedMatch = getStoredMatch()

      if (savedMatch?.matchId) {
        try {
          await joinMatchInternal(savedMatch)
          addActivity('Rejoined the saved match state.', 'accent')
        } catch {
          clearActiveMatch()
        }
      }

      if (message) {
        addActivity(message, 'accent')
      }
    } catch (bootstrapError) {
      clearPersistedSession()
      clearActiveMatch()
      sessionRef.current = null
      socketRef.current = null
      setSession(null)
      setAccount(null)
      setConnectionState('offline')
      setError(normalizeError(bootstrapError, 'Unable to connect to Nakama.'))
    }
  }

  async function authenticate(username) {
    setBusyAction('authenticate')
    setError('')

    try {
      const preferredName = username.trim()
      const nextSession = await clientRef.current.authenticateDevice(getDeviceId(), true)

      await syncDisplayName(clientRef.current, nextSession, preferredName)

      await bootstrapSession(
        nextSession,
        preferredName ? `Authenticated as ${preferredName}.` : 'Authenticated and ready.',
      )
    } catch (authError) {
      setError(normalizeError(authError, 'Authentication failed.'))
    } finally {
      setBusyAction('')
      setHydrated(true)
    }
  }

  async function createRoom(mode) {
    setBusyAction('create-room')
    setError('')

    try {
      const response = await clientRef.current.rpc(sessionRef.current, 'create_room', {
        mode,
      })
      const payload = parseRpcPayload(response)

      if (!payload?.matchId) {
        throw new Error('Room creation did not return a match id.')
      }

      await joinMatchInternal({
        matchId: payload.matchId,
        roomCode: payload.roomCode,
        mode: payload.mode,
        source: 'room',
      })

      addActivity(`Created room ${payload.roomCode}.`, 'accent')
      return payload
    } catch (createError) {
      setError(normalizeError(createError, 'Unable to create a room.'))
      return null
    } finally {
      setBusyAction('')
    }
  }

  async function joinRoom(roomCode) {
    setBusyAction('join-room')
    setError('')

    try {
      const response = await clientRef.current.rpc(sessionRef.current, 'join_room', {
        roomCode: roomCode.trim().toUpperCase(),
      })
      const payload = parseRpcPayload(response)

      if (!payload?.matchId) {
        throw new Error('Room lookup did not return a match id.')
      }

      await joinMatchInternal({
        matchId: payload.matchId,
        roomCode: payload.roomCode,
        mode: payload.mode,
        source: 'room',
      })

      addActivity(`Joined room ${payload.roomCode}.`, 'accent')
      return payload
    } catch (joinError) {
      setError(normalizeError(joinError, 'Unable to join that room code.'))
      return null
    } finally {
      setBusyAction('')
    }
  }

  async function queueMatchmaking(mode) {
    setBusyAction('queue-matchmaking')
    setError('')

    try {
      const nextSocket = await ensureSocket()
      const query = `+properties.mode:${mode}`
      const ticket = await nextSocket.addMatchmaker(query, 2, 2, { mode })

      setMatchmaking({
        ticket: ticket.ticket,
        mode,
      })

      addActivity(`Searching for a ${mode} opponent.`, 'neutral')
      return ticket
    } catch (queueError) {
      setError(normalizeError(queueError, 'Unable to enter matchmaking.'))
      return null
    } finally {
      setBusyAction('')
    }
  }

  async function cancelMatchmaking() {
    if (!matchmaking?.ticket || !socketRef.current) {
      return
    }

    setBusyAction('cancel-matchmaking')

    try {
      await socketRef.current.removeMatchmaker(matchmaking.ticket)
      setMatchmaking(null)
      addActivity('Cancelled matchmaking queue.', 'neutral')
    } catch (cancelError) {
      setError(normalizeError(cancelError, 'Unable to cancel matchmaking.'))
    } finally {
      setBusyAction('')
    }
  }

  async function sendMatchMove(index) {
    if (!socketRef.current || !activeMatchRef.current?.matchId) {
      return
    }

    await socketRef.current.sendMatchState(
      activeMatchRef.current.matchId,
      1,
      JSON.stringify({ index }),
    )
  }

  async function leaveMatch() {
    const currentMatch = activeMatchRef.current

    if (!currentMatch?.matchId) {
      return
    }

    setBusyAction('leave-match')

    try {
      if (socketRef.current) {
        await socketRef.current.leaveMatch(currentMatch.matchId)
      }
    } catch {
      // The socket may already be gone. Clearing local state is still correct.
    } finally {
      clearActiveMatch()
      setBusyAction('')
      addActivity('Left the current match.', 'neutral')
      await loadLeaderboard(10, true)
    }
  }

  function syncActiveMatch(patch) {
    if (!patch || !activeMatchRef.current) {
      return
    }

    const nextMatch = {
      ...activeMatchRef.current,
      ...patch,
    }

    updateActiveMatch(nextMatch)
  }

  function clearError() {
    setError('')
  }

  function logout() {
    clearPersistedSession()
    clearActiveMatch()
    sessionRef.current = null
    setSession(null)
    setAccount(null)
    setMatchmaking(null)
    setConnectionState('offline')
    setError('')

    if (socketRef.current) {
      socketRef.current.disconnect(false)
      socketRef.current = null
    }

    addActivity('Local session cleared.', 'neutral')
  }

  useEffect(() => {
    const restored = restoreStoredSession()

    if (!restored) {
      setHydrated(true)
      return
    }

    if (restored.isexpired(Math.floor(Date.now() / 1000))) {
      clearPersistedSession()
      clearActiveMatch()
      setHydrated(true)
      return
    }

    void (async () => {
      sessionRef.current = restored
      persistSession(restored)
      setSession(restored)
      setError('')

      try {
        const restoredSocket = clientRef.current.createSocket(nakamaConfig.useSSL, false)

        restoredSocket.ondisconnect = () => {
          socketRef.current = null
          setConnectionState('offline')
          addActivity('Realtime socket disconnected.', 'warning')
        }

        restoredSocket.onerror = () => {
          addActivity('Socket error reported by Nakama.', 'danger')
        }

        restoredSocket.onmatchdata = (message) => {
          if (message.op_code === 3) {
            const payload = decodeMatchData(message.data)
            const tone = payload?.type === 'validation_error' ? 'warning' : 'accent'
            addActivity(eventMessage(payload), tone)
          }

          forwardMatchData(message)
        }

        restoredSocket.onmatchpresence = (event) => {
          event.joins.forEach((presence) => {
            addActivity(`${presence.username} connected to the arena.`, 'accent')
          })

          event.leaves.forEach((presence) => {
            addActivity(`${presence.username} left the arena.`, 'warning')
          })

          forwardMatchPresence(event)
        }

        restoredSocket.onmatchmakermatched = async (matched) => {
          const mode = matched.self?.string_properties?.mode ?? 'classic'

          setMatchmaking(null)
          addActivity(`Match found in ${mode} mode. Joining match.`, 'accent')

          try {
            const joinedMatch = await restoredSocket.joinMatch(matched.match_id, matched.token)
            updateActiveMatch({
              matchId: joinedMatch.match_id,
              roomCode: null,
              mode,
              source: 'matchmaker',
            })
          } catch (joinError) {
            setError(normalizeError(joinError, 'Unable to join the matched game.'))
          }
        }

        setConnectionState('connecting')
        await restoredSocket.connect(restored, true)
        socketRef.current = restoredSocket
        setConnectionState('online')

        const restoredAccount = await clientRef.current.getAccount(restored)
        setAccount(restoredAccount)

        const leaderboardResponse = await clientRef.current.rpc(restored, 'list_leaderboard', {
          limit: 10,
        })
        const leaderboardPayload = parseRpcPayload(leaderboardResponse) ?? {}

        startTransition(() => {
          setLeaderboard({
            records: leaderboardPayload.records ?? [],
            loading: false,
            error: '',
            lastUpdated: makeTimeLabel(),
          })
        })

        const savedMatch = getStoredMatch()

        if (savedMatch?.matchId) {
          try {
            const joinedMatch = await restoredSocket.joinMatch(savedMatch.matchId, savedMatch.token)
            updateActiveMatch({
              matchId: joinedMatch.match_id,
              roomCode: savedMatch.roomCode ?? null,
              mode: savedMatch.mode ?? 'classic',
              source: savedMatch.source ?? 'room',
            })
            addActivity('Rejoined the saved match state.', 'accent')
          } catch {
            clearActiveMatch()
          }
        }

        addActivity('Restored saved session.', 'accent')
      } catch (bootstrapError) {
        clearPersistedSession()
        clearActiveMatch()
        sessionRef.current = null
        socketRef.current = null
        setSession(null)
        setAccount(null)
        setConnectionState('offline')
        setError(normalizeError(bootstrapError, 'Unable to connect to Nakama.'))
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  const value = {
    account,
    activeMatch,
    activity,
    authenticate,
    busyAction,
    cancelMatchmaking,
    clearError,
    connectionState,
    createRoom,
    error,
    hydrated,
    joinRoom,
    leaderboard,
    leaveMatch,
    loadLeaderboard,
    matchmaking,
    queueMatchmaking,
    sendMatchMove,
    serverLabel: nakamaServerLabel,
    session,
    subscribeMatchData,
    subscribeMatchPresence,
    syncActiveMatch,
    logout,
  }

  return (
    <NakamaContext.Provider value={value}>
      {children}
    </NakamaContext.Provider>
  )
}

export { NakamaContext }
