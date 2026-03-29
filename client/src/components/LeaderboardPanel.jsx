import { useDeferredValue } from 'react'

export function LeaderboardPanel({ currentUserId, leaderboard, onRefresh }) {
  const deferredRecords = useDeferredValue(leaderboard.records)

  return (
    <section className="panel leaderboard-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Leaderboard</div>
          <h2 className="section-title">Wins first. Streak breaks ties.</h2>
        </div>
        <button
          className="ghost-button"
          disabled={leaderboard.loading}
          type="button"
          onClick={() => void onRefresh()}
        >
          {leaderboard.loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="leaderboard-list">
        {deferredRecords.length ? (
          deferredRecords.map((record) => (
            <div
              key={record.userId}
              className={`leaderboard-row ${record.userId === currentUserId ? 'leaderboard-row-active' : ''}`}
            >
              <div className="leaderboard-rank">#{record.rank}</div>
              <div className="leaderboard-name">
                <strong>{record.username || 'anonymous'}</strong>
                <span>
                  {record.wins}W / {record.losses}L / {record.draws}D
                </span>
              </div>
              <div className="leaderboard-score">
                <strong>{record.score}</strong>
                <span>{record.streak} streak</span>
              </div>
            </div>
          ))
        ) : (
          <div className="leaderboard-empty">No leaderboard rows yet. Finish the first match.</div>
        )}
      </div>

      {leaderboard.error ? <p className="inline-error">{leaderboard.error}</p> : null}
      {leaderboard.lastUpdated ? (
        <div className="panel-footnote">Last synced at {leaderboard.lastUpdated}</div>
      ) : null}
    </section>
  )
}
