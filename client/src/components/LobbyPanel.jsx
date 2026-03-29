import { useState } from "react";

const MODES = [
  {
    id: "classic",
    title: "Classic",
    detail: "Server validates moves and win states without countdown pressure.",
  },
  {
    id: "timed",
    title: "Timed",
    detail:
      "Each player gets a 30 second server-side turn clock with auto-forfeit.",
  },
];

export function LobbyPanel({
  busyAction,
  currentUsername,
  matchmaking,
  onCancelMatchmaking,
  onCreateRoom,
  onJoinRoom,
  onQueueMatchmaking,
}) {
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState("classic");

  function handleCreateRoom() {
    void onCreateRoom(mode);
  }

  function handleJoinRoom(event) {
    event.preventDefault();
    void onJoinRoom(roomCode);
  }

  function handleQueue() {
    void onQueueMatchmaking(mode);
  }

  return (
    <section className="panel lobby-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Lobby</div>
          <h2 className="section-title">
            Pair up through queue or a shareable room code.
          </h2>
        </div>
        <div className="profile-chip">
          <span>
            Signed in as{" "}
            <strong>{currentUsername}</strong>
          </span>
        </div>
      </div>

      <div className="mode-grid">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            className={`mode-card ${mode === entry.id ? "mode-card-active" : ""}`}
            type="button"
            onClick={() => setMode(entry.id)}
          >
            <span className="mode-title">{entry.title}</span>
            <span className="mode-detail">{entry.detail}</span>
          </button>
        ))}
      </div>

      <div className="cta-grid">
        <div className="action-card">
          <span className="card-label">Named room</span>
          <h3>Create a private table</h3>
          <p>
            Generate a room code, share it, and join immediately as player X.
          </p>
          <button
            className="primary-button"
            disabled={Boolean(busyAction)}
            type="button"
            onClick={handleCreateRoom}
          >
            {busyAction === "create-room" ? "Creating..." : "Create room"}
          </button>
        </div>

        <form className="action-card" onSubmit={handleJoinRoom}>
          <span className="card-label">Join by code</span>
          <h3>Reconnect or enter a private room</h3>
          <p>
            Use the exact six-character code issued by the backend room RPC.
          </p>
          <input
            className="text-input"
            maxLength={6}
            placeholder="ABC123"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          />
          <button
            className="secondary-button"
            disabled={Boolean(busyAction)}
            type="submit"
          >
            {busyAction === "join-room" ? "Joining..." : "Join room"}
          </button>
        </form>

        <div className="action-card">
          <span className="card-label">Automatic queue</span>
          <h3>Use Nakama matchmaker</h3>
          <p>
            Players only match against others that entered with the same mode
            property.
          </p>

          {matchmaking ? (
            <>
              <div className="queue-banner">
                <span>Searching</span>
                <strong>{matchmaking.mode}</strong>
              </div>
              <button
                className="secondary-button"
                disabled={busyAction === "cancel-matchmaking"}
                type="button"
                onClick={() => void onCancelMatchmaking()}
              >
                {busyAction === "cancel-matchmaking"
                  ? "Cancelling..."
                  : "Cancel queue"}
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              disabled={Boolean(busyAction)}
              type="button"
              onClick={handleQueue}
            >
              {busyAction === "queue-matchmaking"
                ? "Queueing..."
                : "Find opponent"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
