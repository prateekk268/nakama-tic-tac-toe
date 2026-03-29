export function ActivityPanel({ activity, connectionState, serverLabel }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Connection</div>
          <h2 className="section-title">Client activity</h2>
        </div>
        <span className={`status-pill status-pill-${connectionState}`}>
          {connectionState}
        </span>
      </div>

      <p className="panel-footnote">Connected target: {serverLabel}</p>

      <div className="timeline-list">
        {activity.length ? (
          activity.map((entry) => (
            <div key={entry.id} className={`timeline-item timeline-item-${entry.tone}`}>
              <span>{entry.message}</span>
              <small>{entry.time}</small>
            </div>
          ))
        ) : (
          <div className="timeline-item">
            <span>Socket and RPC events will show here.</span>
            <small>Idle</small>
          </div>
        )}
      </div>
    </section>
  )
}
