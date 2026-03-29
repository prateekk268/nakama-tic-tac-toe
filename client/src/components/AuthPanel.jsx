import { useState } from 'react'

export function AuthPanel({ busyAction, error, onAuthenticate, serverLabel }) {
  const [username, setUsername] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    void onAuthenticate(username)
  }

  return (
    <section className="panel auth-panel">
      <div className="eyebrow">Server-authoritative Nakama client</div>
      <h1 className="hero-title">Realtime Tic-Tac-Toe without trusting the browser.</h1>
      <p className="hero-copy">
        Authenticate with a device identity, open a room or enter the queue,
        and let the Nakama runtime own every turn, timer tick, and leaderboard write.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="username">
          Pilot name
        </label>
        <input
          id="username"
          className="text-input"
          maxLength={24}
          placeholder="arcade-ace"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <button className="primary-button" disabled={busyAction === 'authenticate'} type="submit">
          {busyAction === 'authenticate' ? 'Connecting...' : 'Enter lobby'}
        </button>
      </form>

      <div className="hero-meta">
        <span className="hero-meta-label">Backend</span>
        <strong className="hero-meta-value">{serverLabel}</strong>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  )
}
