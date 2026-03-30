export enum MessageType {
  // Handshake — first message after connect, before any other message
  AUTH = 'auth',

  // Client → Relay
  CHAT_SEND = 'chat.send',
  AGENT_LIST = 'agent.list',
  HISTORY_REQUEST = 'history.request',

  // Relay → Client
  CHAT_RECEIVE = 'chat.receive',
  CHAT_STREAM = 'chat.stream',
  CHAT_STREAM_END = 'chat.stream.end',
  AGENT_LIST_RESPONSE = 'agent.list.response',
  AGENT_STATUS = 'agent.status',
  HISTORY_RESPONSE = 'history.response',
  ERROR = 'error',

  // Bridge → Relay
  AGENT_REGISTER = 'agent.register',
  AGENT_UNREGISTER = 'agent.unregister',
  AGENT_HEARTBEAT = 'agent.heartbeat',

  // Relay → Bridge
  CHAT_FORWARD = 'chat.forward',
}

export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
}

export enum ClientType {
  APP = 'app',
  BRIDGE = 'bridge',
}
