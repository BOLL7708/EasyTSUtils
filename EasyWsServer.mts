export default class EasyWsServer {
   private readonly _port: number = 0
   private readonly _verboseLogging: boolean
   private readonly _onServerEvent: TEasyWsServerEventCallback
   private readonly _onMessageReceived: TEasyWsServerMessageCallback
   private _server?: Deno.HttpServer
   private _sessions: { [key: string]: WebSocket } = {}

   constructor(
      port: number,
      onServerEvent: TEasyWsServerEventCallback,
      onMessageReceived: TEasyWsServerMessageCallback,
      verboseLogging: boolean = false,
   ) {
      this._port = port
      this._onServerEvent = onServerEvent
      this._onMessageReceived = onMessageReceived
      this._verboseLogging = verboseLogging
      this.start().then()
   }

   // region Lifecycle
   private async start() {
      if (this._server) await this._server.shutdown()
      try {
         this._server = Deno.serve({
            port: this._port,
            handler: (req) => {
               let sessionId: string = ''
               const upgrade = req.headers.get('upgrade')
               if (upgrade != 'websocket') {
                  this.log('Connection failed to upgrade', { upgrade })
                  return new Response(null, { status: 501 })
               }

               const { socket, response } = Deno.upgradeWebSocket(req)
               this.log('Connection was upgraded', { upgrade })

               socket.onopen = (open) => {
                  sessionId = crypto.randomUUID()
                  this._sessions[sessionId] = socket
                  this._onServerEvent(EEasyWsServerState.Connected, sessionId)
                  this.log('Client connected, session registered', { sessionId, type: open.type })
               }
               socket.onclose = (close) => {
                  delete this._sessions[sessionId]
                  this._onServerEvent(EEasyWsServerState.Disconnected, sessionId)
                  this.log('Client disconnected, session removed', { sessionId, type: close.type, code: close.code })
               }
               socket.onerror = (error) => {
                  this._onServerEvent(EEasyWsServerState.Error, error.type)
                  console.error(`Server error`, { sessionId, type: error.type })
               }
               socket.onmessage = (message) => {
                  this._onMessageReceived(message.data, sessionId)
                  this.log('Message received', { sessionId, type: message.type, message: message.data })
               }
               return response
            },
         })
      } catch (e) {
         this._onServerEvent(EEasyWsServerState.Error, `${e}`)
         console.error('Unable to start server', { port: this._port, error: e })
      }
   }
   async restart() {
      this.log('Restarting server', { port: this._port })
      await this.start()
   }
   async shutdown() {
      this.log('Shutting down server', { port: this._port })
      await this._server?.shutdown()
   }
   // endregion

   // region Callbacks
   onOpen(event: Event) {

   }

   // endregion

   // region Sending
   private _unreadyStates: number[] = [WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED]
   sendMessage(message: string, toSessionId: string): boolean {
      const session = this._sessions[toSessionId]
      if (session && !this._unreadyStates.includes(session.readyState)) {
         session.send(message)
         this.log('Sent message', { toSessionId, message })
         return true
      }
      return false
   }
   sendMessageToAll(message: string): number {
      let sent = 0
      for (const sessionId of Object.keys(this._sessions)) {
         if (this.sendMessage(message, sessionId)) sent++
      }
      this.log('Message sent to all', { sent, message })
      return sent
   }
   sendMessageToOthers(message: string, mySessionId: string): number {
      let sent = 0
      for (const sessionId of Object.keys(this._sessions)) {
         if (sessionId != mySessionId) {
            if (this.sendMessage(message, sessionId)) sent++
         }
      }
      this.log('Message sent to others', { sent, message, mySessionId })
      return sent
   }
   sendMessageToGroup(message: string, toSessionIds: string[]): number {
      let sent = 0
      for (const sessionId of toSessionIds) {
         if (this.sendMessage(message, sessionId)) sent++
      }
      this.log('Message sent to group', { sent, message, sessionIds: toSessionIds })
      return sent
   }
   // endregion

   // region Utils
   log(message: string, ...values: any[]) {
      if (this._verboseLogging) console.log(message, ...values)
   }
   // endregion
}

// region Types
export enum EEasyWsServerState {
   Connected,
   Disconnected,
   Error,
}

export type TEasyWsServerEventCallback = (state: EEasyWsServerState, value: string | number) => void
export type TEasyWsServerMessageCallback = (message: string, sessionId: string) => void
// endregion
