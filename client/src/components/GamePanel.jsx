import { useEffect, useEffectEvent, useState } from 'react'
import { TurnTimer } from './TurnTimer.jsx'

const POST_MATCH_REDIRECT_SECONDS = 10

function playerStatus(player) {
  if (!player) {
    return 'Waiting'
  }

  return player.connected ? 'Connected' : 'Reconnecting'
}

function statusHeadline(gameState) {
  if (!gameState) {
    return 'Waiting for authoritative snapshot'
  }

  if (gameState.status === 'won' && gameState.winningSymbol) {
    return `${gameState.winningSymbol} locked the line`
  }

  if (gameState.status === 'forfeit' && gameState.winningSymbol) {
    return `${gameState.winningSymbol} wins by forfeit`
  }

  if (gameState.status === 'draw') {
    return 'Draw game'
  }

  if (!gameState.players?.O) {
    return 'Waiting for opponent'
  }

  return `${gameState.turn} to play`
}

function resolveOutcome(gameState, localPlayerSymbol) {
  if (!gameState || gameState.status === 'active') {
    return null
  }

  if (gameState.status === 'draw') {
    return {
      title: 'Draw',
      detail: 'Nobody took the final line. Returning to the control deck shortly.',
      tone: 'neutral',
    }
  }

  if (!localPlayerSymbol) {
    return {
      title: 'Match finished',
      detail: 'The arena closed. Returning to the control deck shortly.',
      tone: 'neutral',
    }
  }

  if (gameState.winningSymbol === localPlayerSymbol) {
    return {
      title: gameState.status === 'forfeit' ? 'You win by forfeit' : 'You win',
      detail: 'Authoritative result confirmed. Returning to the control deck shortly.',
      tone: 'success',
    }
  }

  return {
    title: gameState.status === 'forfeit' ? 'You lose by forfeit' : 'You lose',
    detail: 'The other pilot took the round. Returning to the control deck shortly.',
    tone: 'danger',
  }
}

function MatchOutcomeModal({ busyAction, onLeaveMatch, outcome }) {
  const [secondsRemaining, setSecondsRemaining] = useState(POST_MATCH_REDIRECT_SECONDS)
  const leaveMatchLater = useEffectEvent(() => {
    void onLeaveMatch()
  })

  useEffect(() => {
    const countdownIntervalId = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1))
    }, 1000)

    const redirectTimeoutId = window.setTimeout(() => {
      window.clearInterval(countdownIntervalId)
      leaveMatchLater()
    }, POST_MATCH_REDIRECT_SECONDS * 1000)

    return () => {
      window.clearInterval(countdownIntervalId)
      window.clearTimeout(redirectTimeoutId)
    }
  }, [])

  return (
    <div className="outcome-backdrop">
      <div className={`outcome-modal outcome-modal-${outcome.tone}`}>
        <span className="eyebrow">Match result</span>
        <h3>{outcome.title}</h3>
        <p>{outcome.detail}</p>
        <div className="outcome-countdown">
          <strong>{secondsRemaining}s</strong>
          <span>Automatic return to Tic-Tac-Toe Control Deck</span>
        </div>
        <button
          className="primary-button"
          disabled={busyAction === 'leave-match'}
          type="button"
          onClick={() => void onLeaveMatch()}
        >
          {busyAction === 'leave-match' ? 'Returning...' : 'Return now'}
        </button>
      </div>
    </div>
  )
}

export function GamePanel({
  activeMatch,
  busyAction,
  canMove,
  gameState,
  isLocalTurn,
  lastError,
  localPlayerSymbol,
  onLeaveMatch,
  onMove,
  timeline,
}) {
  const board = gameState?.board ?? Array.from({ length: 9 }, () => null)
  const roomCode = gameState?.roomCode ?? activeMatch?.roomCode ?? '------'
  const outcome = resolveOutcome(gameState, localPlayerSymbol)
  const currentTurn = gameState?.turn ?? 'X'
  const activeTurnPlayer = gameState?.players?.[currentTurn]
  const activeTurnDisconnect = activeTurnPlayer?.userId
    ? gameState?.disconnects?.[activeTurnPlayer.userId] ?? null
    : null
  const outcomeKey = [
    activeMatch?.matchId ?? '',
    gameState?.status ?? '',
    gameState?.winner ?? '',
    gameState?.winningSymbol ?? '',
  ].join(':')

  return (
    <section className="panel game-panel">
      {outcome ? (
        <MatchOutcomeModal
          key={outcomeKey}
          busyAction={busyAction}
          onLeaveMatch={onLeaveMatch}
          outcome={outcome}
        />
      ) : null}

      <div className="panel-header">
        <div>
          <div className="eyebrow">Arena</div>
          <h2 className="section-title">{statusHeadline(gameState)}</h2>
        </div>
        <div className="match-meta-grid">
          <span className="meta-pill">Room {roomCode}</span>
          <span className="meta-pill">{gameState?.mode ?? activeMatch?.mode ?? 'classic'}</span>
        </div>
      </div>

      <div className="game-layout">
        <div className="board-wrap">
          <div className="board-grid">
            {board.map((cell, index) => {
              const isPlayable = !cell && canMove && gameState?.status === 'active'

              return (
                <button
                  key={index}
                  className={`board-cell ${cell ? 'board-cell-filled' : ''} ${isPlayable ? 'board-cell-playable' : ''}`}
                  disabled={!isPlayable}
                  type="button"
                  onClick={() => void onMove(index)}
                >
                  {cell ?? <span className="board-hint">{index + 1}</span>}
                </button>
              )
            })}
          </div>

          <div className="board-note">
            <strong>{localPlayerSymbol ? `You are ${localPlayerSymbol}` : 'Spectator view'}</strong>
            <span>
              {isLocalTurn
                ? 'The server is waiting for your move.'
                : 'Your client only renders state pushed from Nakama.'}
            </span>
          </div>
        </div>

        <aside className="game-rail">
          <div className="player-stack">
            {['X', 'O'].map((symbol) => {
              const player = gameState?.players?.[symbol]
              const isTurn = gameState?.turn === symbol && gameState?.status === 'active'

              return (
                <div key={symbol} className={`player-card ${isTurn ? 'player-card-active' : ''}`}>
                  <div className="player-symbol">{symbol}</div>
                  <div>
                    <strong>{player?.username ?? `Player ${symbol}`}</strong>
                    <p>{playerStatus(player)}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <TurnTimer
            mode={gameState?.mode ?? activeMatch?.mode ?? 'classic'}
            graceSecondsRemaining={activeTurnDisconnect?.secondsRemaining ?? 0}
            paused={Boolean(activeTurnDisconnect)}
            pausedUsername={activeTurnDisconnect?.username ?? activeTurnPlayer?.username ?? currentTurn}
            timer={gameState?.timer ?? 30}
            turn={currentTurn}
          />

          <div className="timeline-card">
            <div className="card-row">
              <span className="eyebrow">Match feed</span>
              {lastError ? <strong className="warning-text">{lastError}</strong> : null}
            </div>
            <div className="timeline-list">
              {timeline.length ? (
                timeline.map((entry) => (
                  <div key={entry.id} className="timeline-item">
                    <span>{entry.message}</span>
                    <small>{entry.time}</small>
                  </div>
                ))
              ) : (
                <div className="timeline-item">
                  <span>Realtime events will appear here.</span>
                  <small>Live</small>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="footer-actions">
        <button
          className="ghost-button"
          disabled={busyAction === 'leave-match'}
          type="button"
          onClick={() => void onLeaveMatch()}
        >
          {busyAction === 'leave-match'
            ? 'Leaving...'
            : outcome
              ? 'Return to control deck'
              : 'Leave match'}
        </button>
      </div>
    </section>
  )
}
