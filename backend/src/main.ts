const MATCH_MODULE_NAME = "tic_tac_toe";
const LEADERBOARD_ID = "tic_tac_toe_wins";
const ROOM_COLLECTION = "room_codes";
const STATS_COLLECTION = "player_stats";
const HISTORY_COLLECTION = "match_history";
const MOVE_OPCODE = 1;
const STATE_OPCODE = 2;
const EVENT_OPCODE = 3;
const DEFAULT_MODE = "classic";
const TURN_SECONDS = 30;
const DISCONNECT_GRACE_SECONDS = 30;
const BOARD_SIZE = 9;
const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

type PlayerSymbol = "X" | "O";
type MatchMode = "classic" | "timed";
type MatchStatus = "active" | "won" | "draw" | "forfeit";
type BoardCell = PlayerSymbol | null;

interface MatchPlayer {
  userId: string;
  username: string;
  connected: boolean;
}

interface DisconnectWindow {
  expireTick: number;
  username: string;
}

interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
}

interface MatchState {
  matchId: string;
  roomCode: string | null;
  mode: MatchMode;
  board: BoardCell[];
  turn: PlayerSymbol;
  players: {
    X: MatchPlayer | null;
    O: MatchPlayer | null;
  };
  presences: {
    [userId: string]: nkruntime.Presence;
  };
  status: MatchStatus;
  winner: string | null;
  winningSymbol: PlayerSymbol | null;
  timer: number;
  timers: {
    X: number;
    O: number;
  };
  disconnects: {
    [userId: string]: DisconnectWindow;
  };
  currentTick: number;
  tickRate: number;
  createdAt: number;
  source: "room" | "matchmaker";
}

interface MatchParams {
  roomCode?: string | null;
  mode?: MatchMode;
  source?: "room" | "matchmaker";
  creator?: {
    userId: string;
    username: string;
  };
  expectedUsers?: Array<{
    userId: string;
    username: string;
  }>;
}

interface MoveMessage {
  index: number;
}

interface StatePayload {
  matchId: string;
  roomCode: string | null;
  mode: MatchMode;
  board: BoardCell[];
  turn: PlayerSymbol;
  players: {
    X: MatchPlayer | null;
    O: MatchPlayer | null;
  };
  status: MatchStatus;
  winner: string | null;
  winningSymbol: PlayerSymbol | null;
  timer: number;
  timers: {
    X: number;
    O: number;
  };
  disconnects: {
    [userId: string]: {
      secondsRemaining: number;
      username: string;
    };
  };
}

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerRpc("create_room", rpcCreateRoom);
  initializer.registerRpc("join_room", rpcJoinRoom);
  initializer.registerRpc("list_leaderboard", rpcListLeaderboard);
  initializer.registerMatch(MATCH_MODULE_NAME, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });
  initializer.registerMatchmakerMatched(matchmakerMatched);

  ensureLeaderboard(nk, logger);
  logger.info("TypeScript Nakama runtime initialized.");
}

function ensureLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
): void {
  try {
    const nkAny = nk as any;
    nkAny.leaderboardCreate(
      LEADERBOARD_ID,
      true,
      "desc",
      "best",
      "0 0 * * 1",
      null,
      true,
    );
  } catch (error) {
    logger.debug("Leaderboard create skipped: %s", String(error));
  }
}

function resolveUserLabel(
  nk: nkruntime.Nakama,
  userId: string,
  fallback: string,
): string {
  try {
    const users = nk.usersGetId([userId]);
    if (users && users.length && users[0]) {
      return users[0].displayName || users[0].username || fallback;
    }
  } catch (_error) {
    return fallback;
  }

  return fallback;
}

function resolveUserLabels(
  nk: nkruntime.Nakama,
  userIds: string[],
): { [userId: string]: string } {
  const labels: { [userId: string]: string } = {};
  const uniqueUserIds: string[] = [];
  const seen: { [userId: string]: boolean } = {};

  for (let i = 0; i < userIds.length; i += 1) {
    if (userIds[i] && !seen[userIds[i]]) {
      seen[userIds[i]] = true;
      uniqueUserIds.push(userIds[i]);
    }
  }

  if (!uniqueUserIds.length) {
    return labels;
  }

  try {
    const users = nk.usersGetId(uniqueUserIds);
    for (let i = 0; i < users.length; i += 1) {
      labels[users[i].userId] = users[i].displayName || users[i].username || "";
    }
  } catch (_error) {
    return labels;
  }

  return labels;
}

function rpcCreateRoom(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!ctx.userId) {
    throw new Error("Authentication required.");
  }

  const body = parseJson(payload);
  const mode = normalizeMode(body.mode);
  const matchId = (nk as any).matchCreate(MATCH_MODULE_NAME, {
    mode: mode,
    source: "room",
    creator: {
      userId: ctx.userId,
      username: resolveUserLabel(nk, ctx.userId, ctx.username || "player"),
    },
  });
  const roomCode = makeRoomCode(matchId);

  (nk as any).storageWrite([
    {
      collection: ROOM_COLLECTION,
      key: roomCode,
      value: {
        matchId: matchId,
        mode: mode,
        createdBy: ctx.userId,
        createdAt: new Date().toISOString(),
      },
      permissionRead: 2,
      permissionWrite: 0,
    },
  ]);

  logger.info("Created room %s for user %s.", roomCode, ctx.userId);
  return JSON.stringify({
    matchId: matchId,
    roomCode: roomCode,
    mode: mode,
  });
}

function rpcJoinRoom(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const body = parseJson(payload);
  const roomCode = String(body.roomCode || "").toUpperCase();

  if (!roomCode) {
    throw new Error("roomCode is required.");
  }

  const objects = (nk as any).storageRead([
    {
      collection: ROOM_COLLECTION,
      key: roomCode,
    },
  ]);

  if (!objects || !objects.length || !objects[0]) {
    throw new Error("Room not found.");
  }

  const value = normalizeStorageValue(objects[0].value);
  logger.info("Resolved room code %s to match %s.", roomCode, value.matchId);
  return JSON.stringify({
    matchId: value.matchId,
    roomCode: roomCode,
    mode: normalizeMode(value.mode),
  });
}

function rpcListLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const body = parseJson(payload);
  const limit = normalizePositiveInt(body.limit, 10, 1, 50);
  const fetchLimit = Math.min(limit * 5, 100);
  const nkAny = nk as any;
  const response = nkAny.leaderboardRecordsList(
    LEADERBOARD_ID,
    [],
    fetchLimit,
    null,
    0,
  );
  const records = response.records || [];
  const owners = [];

  for (let i = 0; i < records.length; i += 1) {
    owners.push(records[i].ownerId);
  }

  const statsByUserId = loadPlayerStatsMap(nk, owners);
  const labelsByUserId = resolveUserLabels(nk, owners);
  const deduped = [];
  const seenUsernames: { [usernameKey: string]: boolean } = {};

  for (let i = 0; i < records.length; i += 1) {
    const username = labelsByUserId[records[i].ownerId] || records[i].username || "";
    const usernameKey = normalizeLeaderboardUsername(username, records[i].ownerId);

    if (seenUsernames[usernameKey]) {
      continue;
    }

    seenUsernames[usernameKey] = true;
    deduped.push({
      rank: deduped.length + 1,
      userId: records[i].ownerId,
      username: username,
      score: records[i].score,
      streak: statsByUserId[records[i].ownerId]
        ? statsByUserId[records[i].ownerId].streak
        : 0,
      wins: statsByUserId[records[i].ownerId]
        ? statsByUserId[records[i].ownerId].wins
        : records[i].score,
      losses: statsByUserId[records[i].ownerId]
        ? statsByUserId[records[i].ownerId].losses
        : 0,
      draws: statsByUserId[records[i].ownerId]
        ? statsByUserId[records[i].ownerId].draws
        : 0,
    });

    if (deduped.length >= limit) {
      break;
    }
  }

  logger.debug("Returned %d unique leaderboard rows.", deduped.length);
  return JSON.stringify({
    leaderboardId: LEADERBOARD_ID,
    records: deduped,
  });
}

function normalizeLeaderboardUsername(username: string, fallbackUserId: string): string {
  const normalized = username.trim().toLowerCase();
  return normalized || fallbackUserId;
}

function matchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  entries: any[],
): string {
  let mode = DEFAULT_MODE;
  const users = [];

  for (let i = 0; i < entries.length; i += 1) {
    const properties = entries[i].properties || {};
    if (properties.mode) {
      mode = normalizeMode(properties.mode);
    }
    users.push({
      userId: entries[i].presence.userId,
      username: resolveUserLabel(
        nk,
        entries[i].presence.userId,
        entries[i].presence.username || "player",
      ),
    });
  }

  const matchId = (nk as any).matchCreate(MATCH_MODULE_NAME, {
    mode: mode,
    source: "matchmaker",
    expectedUsers: users,
  });
  logger.info(
    "Matchmaker created authoritative match %s in %s mode.",
    matchId,
    mode,
  );
  return matchId;
}

function matchInit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: MatchParams,
) {
  const matchId = ctx.matchId || "";
  const mode = normalizeMode(params.mode);
  const state: MatchState = {
    matchId: matchId,
    roomCode: params.roomCode || null,
    mode: mode,
    board: [null, null, null, null, null, null, null, null, null],
    turn: "X",
    players: {
      X: null,
      O: null,
    },
    presences: {},
    status: "active",
    winner: null,
    winningSymbol: null,
    timer: TURN_SECONDS,
    timers: {
      X: TURN_SECONDS,
      O: TURN_SECONDS,
    },
    disconnects: {},
    currentTick: 0,
    tickRate: 1,
    createdAt: Date.now(),
    source: params.source || "room",
  };

  if (params.creator) {
    state.players.X = {
      userId: params.creator.userId,
      username: params.creator.username,
      connected: false,
    };
  }

  if (params.expectedUsers && params.expectedUsers.length) {
    state.players.X = {
      userId: params.expectedUsers[0].userId,
      username: params.expectedUsers[0].username,
      connected: false,
    };
    if (params.expectedUsers[1]) {
      state.players.O = {
        userId: params.expectedUsers[1].userId,
        username: params.expectedUsers[1].username,
        connected: false,
      };
    }
  }

  logger.info("Initialized match %s.", matchId);
  return {
    state: state,
    tickRate: state.tickRate,
    label: JSON.stringify({
      mode: state.mode,
      roomCode: state.roomCode,
      source: state.source,
    }),
  };
}

function matchJoinAttempt(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any },
) {
  const symbol = getSymbolForUser(state, presence.userId);

  if (state.status !== "active") {
    return rejectJoin(state, "Match already finished.");
  }

  if (symbol) {
    return acceptJoin(state);
  }

  if (!state.players.X) {
    state.players.X = {
      userId: presence.userId,
      username: resolveUserLabel(
        nk,
        presence.userId,
        presence.username || "player",
      ),
      connected: false,
    };
    return acceptJoin(state);
  }

  if (!state.players.O) {
    state.players.O = {
      userId: presence.userId,
      username: resolveUserLabel(
        nk,
        presence.userId,
        presence.username || "player",
      ),
      connected: false,
    };
    return acceptJoin(state);
  }

  return rejectJoin(state, "Match is full.");
}

function matchJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[],
) {
  state.currentTick = tick;
  for (let i = 0; i < presences.length; i += 1) {
    const presence = presences[i];
    state.presences[presence.userId] = presence;
    markPlayerConnected(
      state,
      presence.userId,
      resolveUserLabel(nk, presence.userId, presence.username || "player"),
    );
    delete state.disconnects[presence.userId];
  }

  if (!state.roomCode) {
    state.roomCode = makeRoomCode(state.matchId);
  }

  broadcastState(dispatcher, state);
  return { state: state };
}

function matchLeave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[],
) {
  state.currentTick = tick;

  for (let i = 0; i < presences.length; i += 1) {
    const presence = presences[i];
    delete state.presences[presence.userId];
    markPlayerDisconnected(state, presence.userId);
    state.disconnects[presence.userId] = {
      expireTick: tick + DISCONNECT_GRACE_SECONDS * state.tickRate,
      username: resolveUserLabel(
        nk,
        presence.userId,
        presence.username || "player",
      ),
    };
  }

  broadcastState(dispatcher, state);
  return { state: state };
}

function matchLoop(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  messages: nkruntime.MatchMessage[],
) {
  state.currentTick = tick;

  if (
    state.status === "active" &&
    playerCount(state) === 2 &&
    state.mode === "timed"
  ) {
    state.timer = Math.max(0, state.timer - 1);
    state.timers[state.turn] = state.timer;

    if (state.timer <= 0) {
      const loserSymbol = state.turn;
      const winnerSymbol = otherSymbol(loserSymbol);
      finalizeMatch(
        ctx,
        logger,
        nk,
        dispatcher,
        state,
        "forfeit",
        winnerSymbol,
        "Timer expired.",
      );
    }
  }

  for (let i = 0; i < messages.length; i += 1) {
    processMatchMessage(ctx, logger, nk, dispatcher, state, messages[i]);
  }

  expireDisconnects(ctx, logger, nk, dispatcher, tick, state);

  if (state.status === "active" && playerCount(state) === 2) {
    broadcastState(dispatcher, state);
  }

  return { state: state };
}

function matchTerminate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  graceSeconds: number,
) {
  broadcastEvent(dispatcher, {
    type: "terminate",
    message: "Match terminated by server.",
  });
  return { state: state };
}

function matchSignal(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  data: string,
) {
  return {
    state: state,
    data: data || "",
  };
}

function processMatchMessage(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState,
  message: nkruntime.MatchMessage,
): void {
  if (message.opCode !== MOVE_OPCODE) {
    return;
  }

  if (state.status !== "active") {
    sendValidationError(dispatcher, message.sender, "Match already finished.");
    return;
  }

  const symbol = getSymbolForUser(state, message.sender.userId);
  if (!symbol) {
    sendValidationError(
      dispatcher,
      message.sender,
      "You are not a participant in this match.",
    );
    return;
  }

  if (playerCount(state) < 2) {
    sendValidationError(dispatcher, message.sender, "Waiting for an opponent.");
    return;
  }

  if (symbol !== state.turn) {
    sendValidationError(dispatcher, message.sender, "It is not your turn.");
    return;
  }

  const payload = parseMatchData(message.data);
  const index = normalizePositiveInt(payload.index, -1, 0, BOARD_SIZE - 1);

  if (index < 0 || index >= BOARD_SIZE) {
    sendValidationError(dispatcher, message.sender, "Move out of bounds.");
    return;
  }

  if (state.board[index] !== null) {
    sendValidationError(dispatcher, message.sender, "Cell already occupied.");
    return;
  }

  state.board[index] = symbol;

  if (hasWinningLine(state.board, symbol)) {
    finalizeMatch(
      ctx,
      logger,
      nk,
      dispatcher,
      state,
      "won",
      symbol,
      "Winning move.",
    );
    return;
  }

  if (isBoardFull(state.board)) {
    finalizeMatch(
      ctx,
      logger,
      nk,
      dispatcher,
      state,
      "draw",
      null,
      "Board full.",
    );
    return;
  }

  state.turn = otherSymbol(symbol);
  state.timer = state.timers[state.turn];
  broadcastState(dispatcher, state);
}

function expireDisconnects(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
): void {
  if (state.status !== "active") {
    return;
  }

  const pendingUserIds = Object.keys(state.disconnects);
  for (let i = 0; i < pendingUserIds.length; i += 1) {
    const userId = pendingUserIds[i];
    if (state.disconnects[userId].expireTick <= tick) {
      const loserSymbol = getSymbolForUser(state, userId);
      if (loserSymbol) {
        finalizeMatch(
          ctx,
          logger,
          nk,
          dispatcher,
          state,
          "forfeit",
          otherSymbol(loserSymbol),
          "Reconnect grace expired.",
        );
        delete state.disconnects[userId];
        return;
      }
    }
  }
}

function finalizeMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState,
  status: MatchStatus,
  winningSymbol: PlayerSymbol | null,
  reason: string,
): void {
  if (state.status !== "active") {
    return;
  }

  state.status = status;
  state.winningSymbol = winningSymbol;
  state.winner =
    winningSymbol && state.players[winningSymbol]
      ? state.players[winningSymbol]!.userId
      : null;

  updateStatsAndLeaderboard(nk, logger, state);
  persistMatchHistory(nk, logger, state, reason);

  broadcastState(dispatcher, state);
  broadcastEvent(dispatcher, {
    type: "match_end",
    status: state.status,
    winner: state.winner,
    winningSymbol: state.winningSymbol,
    reason: reason,
  });
}

function updateStatsAndLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: MatchState,
): void {
  const xPlayer = state.players.X;
  const oPlayer = state.players.O;

  if (!xPlayer || !oPlayer) {
    return;
  }

  const xStats = loadPlayerStats(nk, xPlayer.userId);
  const oStats = loadPlayerStats(nk, oPlayer.userId);

  if (state.status === "draw") {
    xStats.draws += 1;
    oStats.draws += 1;
    xStats.streak = 0;
    oStats.streak = 0;
  } else if (state.winner === xPlayer.userId) {
    xStats.wins += 1;
    xStats.streak += 1;
    oStats.losses += 1;
    oStats.streak = 0;
  } else if (state.winner === oPlayer.userId) {
    oStats.wins += 1;
    oStats.streak += 1;
    xStats.losses += 1;
    xStats.streak = 0;
  }

  writePlayerStats(nk, xPlayer.userId, xStats);
  writePlayerStats(nk, oPlayer.userId, oStats);

  try {
    const nkAny = nk as any;
    const xLabel = resolveUserLabel(nk, xPlayer.userId, xPlayer.username);
    const oLabel = resolveUserLabel(nk, oPlayer.userId, oPlayer.username);
    nkAny.leaderboardRecordWrite(
      LEADERBOARD_ID,
      xPlayer.userId,
      xLabel,
      xStats.wins,
      xStats.streak,
      {
        wins: xStats.wins,
        losses: xStats.losses,
        draws: xStats.draws,
        streak: xStats.streak,
      },
    );
    nkAny.leaderboardRecordWrite(
      LEADERBOARD_ID,
      oPlayer.userId,
      oLabel,
      oStats.wins,
      oStats.streak,
      {
        wins: oStats.wins,
        losses: oStats.losses,
        draws: oStats.draws,
        streak: oStats.streak,
      },
    );
  } catch (error) {
    logger.error("Leaderboard write failed: %s", String(error));
  }
}

function persistMatchHistory(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: MatchState,
  reason: string,
): void {
  try {
    (nk as any).storageWrite([
      {
        collection: HISTORY_COLLECTION,
        key: state.matchId,
        value: {
          matchId: state.matchId,
          roomCode: state.roomCode,
          mode: state.mode,
          board: state.board,
          players: state.players,
          status: state.status,
          winner: state.winner,
          winningSymbol: state.winningSymbol,
          reason: reason,
          finishedAt: new Date().toISOString(),
        },
        permissionRead: 2,
        permissionWrite: 0,
      },
    ]);
  } catch (error) {
    logger.error("Match history write failed: %s", String(error));
  }
}

function loadPlayerStatsMap(
  nk: nkruntime.Nakama,
  userIds: string[],
): { [userId: string]: PlayerStats } {
  const result: { [userId: string]: PlayerStats } = {};
  const reads = [];

  for (let i = 0; i < userIds.length; i += 1) {
    reads.push({
      collection: STATS_COLLECTION,
      key: "summary",
      userId: userIds[i],
    });
  }

  if (!reads.length) {
    return result;
  }

  const objects = (nk as any).storageRead(reads);

  for (let i = 0; i < objects.length; i += 1) {
    if (objects[i] && objects[i].userId) {
      result[objects[i].userId] = normalizeStats(
        normalizeStorageValue(objects[i].value),
      );
    }
  }

  return result;
}

function loadPlayerStats(nk: nkruntime.Nakama, userId: string): PlayerStats {
  const objects = (nk as any).storageRead([
    {
      collection: STATS_COLLECTION,
      key: "summary",
      userId: userId,
    },
  ]);

  if (!objects || !objects.length || !objects[0]) {
    return defaultStats();
  }

  return normalizeStats(normalizeStorageValue(objects[0].value));
}

function writePlayerStats(
  nk: nkruntime.Nakama,
  userId: string,
  stats: PlayerStats,
): void {
  (nk as any).storageWrite([
    {
      collection: STATS_COLLECTION,
      key: "summary",
      userId: userId,
      value: stats,
      permissionRead: 2,
      permissionWrite: 0,
    },
  ]);
}

function broadcastState(
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState,
): void {
  const payload = toStatePayload(state);
  (dispatcher as any).broadcastMessage(
    STATE_OPCODE,
    JSON.stringify(payload),
    null,
    null,
    true,
  );
}

function broadcastEvent(
  dispatcher: nkruntime.MatchDispatcher,
  payload: any,
): void {
  (dispatcher as any).broadcastMessage(
    EVENT_OPCODE,
    JSON.stringify(payload),
    null,
    null,
    true,
  );
}

function sendValidationError(
  dispatcher: nkruntime.MatchDispatcher,
  presence: nkruntime.Presence,
  message: string,
): void {
  (dispatcher as any).broadcastMessage(
    EVENT_OPCODE,
    JSON.stringify({
      type: "validation_error",
      message: message,
    }),
    [presence],
    null,
    true,
  );
}

function toStatePayload(state: MatchState): StatePayload {
  const disconnects: {
    [userId: string]: { secondsRemaining: number; username: string };
  } = {};
  const userIds = Object.keys(state.disconnects);

  for (let i = 0; i < userIds.length; i += 1) {
    disconnects[userIds[i]] = {
      secondsRemaining: Math.max(
        0,
        Math.ceil(
          (state.disconnects[userIds[i]].expireTick - state.currentTick) /
            state.tickRate,
        ),
      ),
      username: state.disconnects[userIds[i]].username,
    };
  }

  return {
    matchId: state.matchId,
    roomCode: state.roomCode,
    mode: state.mode,
    board: state.board.slice(0),
    turn: state.turn,
    players: {
      X: clonePlayer(state.players.X),
      O: clonePlayer(state.players.O),
    },
    status: state.status,
    winner: state.winner,
    winningSymbol: state.winningSymbol,
    timer: state.timer,
    timers: {
      X: state.timers.X,
      O: state.timers.O,
    },
    disconnects: disconnects,
  };
}

function clonePlayer(player: MatchPlayer | null): MatchPlayer | null {
  if (!player) {
    return null;
  }

  return {
    userId: player.userId,
    username: player.username,
    connected: player.connected,
  };
}

function markPlayerConnected(
  state: MatchState,
  userId: string,
  username: string,
): void {
  if (state.players.X && state.players.X.userId === userId) {
    state.players.X.connected = true;
    state.players.X.username = username;
    return;
  }

  if (state.players.O && state.players.O.userId === userId) {
    state.players.O.connected = true;
    state.players.O.username = username;
  }
}

function markPlayerDisconnected(state: MatchState, userId: string): void {
  if (state.players.X && state.players.X.userId === userId) {
    state.players.X.connected = false;
    return;
  }

  if (state.players.O && state.players.O.userId === userId) {
    state.players.O.connected = false;
  }
}

function getSymbolForUser(
  state: MatchState,
  userId: string,
): PlayerSymbol | null {
  if (state.players.X && state.players.X.userId === userId) {
    return "X";
  }

  if (state.players.O && state.players.O.userId === userId) {
    return "O";
  }

  return null;
}

function playerCount(state: MatchState): number {
  let count = 0;
  if (state.players.X) {
    count += 1;
  }
  if (state.players.O) {
    count += 1;
  }
  return count;
}

function hasWinningLine(board: BoardCell[], symbol: PlayerSymbol): boolean {
  for (let i = 0; i < WINNING_LINES.length; i += 1) {
    const line = WINNING_LINES[i];
    if (
      board[line[0]] === symbol &&
      board[line[1]] === symbol &&
      board[line[2]] === symbol
    ) {
      return true;
    }
  }
  return false;
}

function isBoardFull(board: BoardCell[]): boolean {
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === null) {
      return false;
    }
  }
  return true;
}

function otherSymbol(symbol: PlayerSymbol): PlayerSymbol {
  return symbol === "X" ? "O" : "X";
}

function defaultStats(): PlayerStats {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
  };
}

function normalizeStats(value: any): PlayerStats {
  return {
    wins: normalizePositiveInt(value.wins, 0, 0, 1000000),
    losses: normalizePositiveInt(value.losses, 0, 0, 1000000),
    draws: normalizePositiveInt(value.draws, 0, 0, 1000000),
    streak: normalizePositiveInt(value.streak, 0, 0, 1000000),
  };
}

function normalizeMode(value: any): MatchMode {
  return value === "timed" ? "timed" : "classic";
}

function normalizePositiveInt(
  value: any,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function parseJson(payload: string): any {
  if (!payload) {
    return {};
  }

  return JSON.parse(payload);
}

function parseMatchData(data: any): MoveMessage {
  if (typeof data === "string") {
    return parseJson(data);
  }

  if (isArrayBufferLike(data)) {
    return parseJson(bytesToString(new Uint8Array(data)));
  }

  if (isTypedArrayLike(data)) {
    return parseJson(bytesToString(data));
  }

  return data || {};
}

function bytesToString(bytes: {
  [index: number]: number;
  length: number;
}): string {
  const chars = [];
  for (let i = 0; i < bytes.length; i += 1) {
    chars.push(String.fromCharCode(bytes[i]));
  }
  return chars.join("");
}

function isArrayBufferLike(value: any): value is ArrayBuffer {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function isTypedArrayLike(
  value: any,
): value is { [index: number]: number; length: number } {
  return Boolean(
    value && typeof value === "object" && typeof value.length === "number",
  );
}

function normalizeStorageValue(value: any): any {
  if (typeof value === "string") {
    return parseJson(value);
  }
  return value || {};
}

function makeRoomCode(matchId: string): string {
  const raw = matchId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (raw.length >= 6) {
    return raw.substring(0, 6);
  }
  return (raw + "ROOM01").substring(0, 6);
}

function acceptJoin(state: MatchState) {
  return {
    state: state,
    accept: true,
    rejectMessage: "",
  };
}

function rejectJoin(state: MatchState, rejectMessage: string) {
  return {
    state: state,
    accept: false,
    rejectMessage: rejectMessage,
  };
}
