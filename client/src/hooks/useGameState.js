import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import { useNakama } from './useNakama.js'

const MAX_TIMELINE_ITEMS = 10

function makeTimelineEntry(kind, message, matchId) {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    matchId,
    message,
    time: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

function decodePayload(data) {
  if (!data) {
    return null
  }

  const parsed = new TextDecoder().decode(data)

  try {
    return JSON.parse(parsed)
  } catch {
    return null
  }
}

function resolveLocalSymbol(gameState, userId) {
  if (gameState?.players?.X?.userId === userId) {
    return 'X'
  }

  if (gameState?.players?.O?.userId === userId) {
    return 'O'
  }

  return null
}

export function useGameState() {
  const {
    activeMatch,
    loadLeaderboard,
    sendMatchMove,
    session,
    subscribeMatchData,
    subscribeMatchPresence,
    syncActiveMatch,
  } = useNakama()
  const [gameState, setGameState] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [lastError, setLastError] = useState({
    matchId: '',
    message: '',
  })

  const handleMatchData = useEffectEvent((message) => {
    if (!activeMatch || message.match_id !== activeMatch.matchId) {
      return
    }

    const payload = decodePayload(message.data)

    if (!payload) {
      return
    }

    if (message.op_code === 2) {
      startTransition(() => {
        setGameState(payload)
      })

      if (payload.roomCode || payload.mode) {
        syncActiveMatch({
          roomCode: payload.roomCode ?? activeMatch.roomCode,
          mode: payload.mode ?? activeMatch.mode,
        })
      }

      if (payload.status && payload.status !== 'active') {
        void loadLeaderboard(10, true)
      }

      return
    }

    if (message.op_code === 3) {
      const note = payload.message ?? payload.reason ?? 'Server event'

      startTransition(() => {
        setTimeline((current) => [
          makeTimelineEntry(payload.type ?? 'system', note, message.match_id),
          ...current,
        ].slice(0, MAX_TIMELINE_ITEMS))
      })

      if (payload.type === 'validation_error') {
        setLastError({
          matchId: message.match_id,
          message: note,
        })
      }

      if (payload.type === 'match_end') {
        void loadLeaderboard(10, true)
      }
    }
  })

  const handlePresence = useEffectEvent((event) => {
    if (!activeMatch || event.match_id !== activeMatch.matchId) {
      return
    }

    const entries = []

    event.joins.forEach((presence) => {
      entries.push(
        makeTimelineEntry('presence', `${presence.username} joined the match.`, event.match_id),
      )
    })

    event.leaves.forEach((presence) => {
      entries.push(
        makeTimelineEntry('presence', `${presence.username} disconnected.`, event.match_id),
      )
    })

    if (!entries.length) {
      return
    }

    startTransition(() => {
      setTimeline((current) => [...entries.reverse(), ...current].slice(0, MAX_TIMELINE_ITEMS))
    })
  })

  useEffect(() => {
    if (!activeMatch) {
      return undefined
    }

    const unsubscribeMatchData = subscribeMatchData(handleMatchData)
    const unsubscribePresence = subscribeMatchPresence(handlePresence)

    return () => {
      unsubscribeMatchData()
      unsubscribePresence()
    }
  }, [activeMatch, subscribeMatchData, subscribeMatchPresence])

  const visibleGameState =
    activeMatch && gameState?.matchId === activeMatch.matchId ? gameState : null
  const visibleTimeline = activeMatch
    ? timeline.filter((entry) => entry.matchId === activeMatch.matchId)
    : []
  const visibleLastError =
    activeMatch && lastError.matchId === activeMatch.matchId ? lastError.message : ''

  const localPlayerSymbol = resolveLocalSymbol(visibleGameState, session?.user_id)
  const opponentSymbol = localPlayerSymbol === 'X' ? 'O' : localPlayerSymbol === 'O' ? 'X' : null
  const isLocalTurn = Boolean(
    localPlayerSymbol && visibleGameState?.turn === localPlayerSymbol,
  )
  const canMove = Boolean(
    localPlayerSymbol &&
      visibleGameState?.status === 'active' &&
      visibleGameState?.players?.X &&
      visibleGameState?.players?.O &&
      isLocalTurn,
  )

  async function submitMove(index) {
    if (!canMove) {
      return
    }

    setLastError({
      matchId: activeMatch?.matchId ?? '',
      message: '',
    })

    try {
      await sendMatchMove(index)
    } catch (moveError) {
      setLastError({
        matchId: activeMatch?.matchId ?? '',
        message: moveError instanceof Error ? moveError.message : 'Move failed.',
      })
    }
  }

  return {
    canMove,
    gameState: visibleGameState,
    isLocalTurn,
    lastError: visibleLastError,
    localPlayerSymbol,
    opponentSymbol,
    submitMove,
    timeline: visibleTimeline,
  }
}
