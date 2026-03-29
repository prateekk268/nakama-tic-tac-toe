import './App.css'
import { NakamaProvider } from './context/NakamaProvider.jsx'
import { ActivityPanel } from './components/ActivityPanel.jsx'
import { AuthPanel } from './components/AuthPanel.jsx'
import { GamePanel } from './components/GamePanel.jsx'
import { LeaderboardPanel } from './components/LeaderboardPanel.jsx'
import { LobbyPanel } from './components/LobbyPanel.jsx'
import { useGameState } from './hooks/useGameState.js'
import { useNakama } from './hooks/useNakama.js'

function AppShell() {
  const {
    account,
    activeMatch,
    activity,
    authenticate,
    busyAction,
    cancelMatchmaking,
    clearError,
    connectionState,
    error,
    hydrated,
    createRoom,
    joinRoom,
    leaderboard,
    leaveMatch,
    loadLeaderboard,
    logout,
    matchmaking,
    queueMatchmaking,
    serverLabel,
    session,
  } = useNakama()
  const {
    canMove,
    gameState,
    isLocalTurn,
    lastError,
    localPlayerSymbol,
    submitMove,
    timeline,
  } = useGameState()

  const currentUsername =
    account?.user?.display_name || account?.user?.username || session?.username || 'guest'

  if (!hydrated) {
    return (
      <main className="app-shell">
        <div className="status-hero">
          <div className="eyebrow">Booting client</div>
          <h1 className="hero-title">Restoring Nakama session and socket state.</h1>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="app-header">
        <div>
          <div className="eyebrow">React frontend</div>
          <h1 className="app-title">Tic-Tac-Toe Control Deck</h1>
        </div>

        {session ? (
          <div className="toolbar">
            <span className="profile-chip">
              <span>Operator{" "}</span>
              <strong>{currentUsername}</strong>
            </span>
            <button className="ghost-button" type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      {!session ? (
        <div className="landing-grid">
          <AuthPanel
            busyAction={busyAction}
            error={error}
            onAuthenticate={authenticate}
            serverLabel={serverLabel}
          />

          <section className="panel detail-panel">
            <div className="eyebrow">Flow</div>
            <h2 className="section-title">The browser only requests actions. Nakama decides outcomes.</h2>
            <div className="detail-list">
              <div className="detail-item">
                <strong>Realtime board</strong>
                <span>State snapshots arrive through op-code 2 and drive every render.</span>
              </div>
              <div className="detail-item">
                <strong>Server timer</strong>
                <span>The countdown ring reflects the runtime tick, not local browser time.</span>
              </div>
              <div className="detail-item">
                <strong>Queue and rooms</strong>
                <span>Mode-aware matchmaker and room RPCs map directly to the backend contract.</span>
              </div>
            </div>
          </section>
        </div>
      ) : activeMatch ? (
        <div className="workspace-grid workspace-grid-match">
          <GamePanel
            activeMatch={activeMatch}
            busyAction={busyAction}
            canMove={canMove}
            gameState={gameState}
            isLocalTurn={isLocalTurn}
            lastError={lastError}
            localPlayerSymbol={localPlayerSymbol}
            onLeaveMatch={leaveMatch}
            onMove={submitMove}
            timeline={timeline}
          />

          <div className="rail-stack">
            <LeaderboardPanel
              currentUserId={session.user_id}
              leaderboard={leaderboard}
              onRefresh={loadLeaderboard}
            />
            <ActivityPanel
              activity={activity}
              connectionState={connectionState}
              serverLabel={serverLabel}
            />
          </div>
        </div>
      ) : (
        <div className="workspace-grid">
          <LobbyPanel
            busyAction={busyAction}
            currentUsername={currentUsername}
            matchmaking={matchmaking}
            onCancelMatchmaking={cancelMatchmaking}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            onQueueMatchmaking={queueMatchmaking}
          />

          <div className="rail-stack">
            <LeaderboardPanel
              currentUserId={session.user_id}
              leaderboard={leaderboard}
              onRefresh={loadLeaderboard}
            />
            <ActivityPanel
              activity={activity}
              connectionState={connectionState}
              serverLabel={serverLabel}
            />
          </div>
        </div>
      )}
    </main>
  )
}

export default function App() {
  return (
    <NakamaProvider>
      <AppShell />
    </NakamaProvider>
  )
}
