export const nakamaConfig = {
  host: import.meta.env.VITE_NAKAMA_HOST ?? '127.0.0.1',
  port: import.meta.env.VITE_NAKAMA_PORT ?? '7350',
  useSSL: import.meta.env.VITE_NAKAMA_SSL === 'true',
  serverKey: import.meta.env.VITE_NAKAMA_SERVER_KEY ?? 'defaultkey',
}

export const nakamaServerLabel = `${nakamaConfig.host}:${nakamaConfig.port}`
