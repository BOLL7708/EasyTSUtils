import Log from './Log.mts'

export interface IWebsocketsServerOptions {
    name: string
    port: number
    keepAlive: boolean
    onServerEvent: TEasyWsServerEventCallback
    onMessageReceived: TEasyWsServerMessageCallback
}

export default class WebSocketServer {
    private readonly TAG: string
    private readonly _options: IWebsocketsServerOptions
    private _server?: Deno.HttpServer
    private _sessions: { [key: string]: WebSocket } = {}

    constructor(options: IWebsocketsServerOptions) {
        this._options = options
        this.TAG = `${this.constructor.name}->${this._options.name}`
        this.start().then()
    }

    // region Lifecycle
    private async start() {
        if (this._server) await this._server.shutdown()
        try {
            this._server = Deno.serve({
                port: this._options.port,
                handler: (req) => {
                    let sessionId: string = ''
                    const upgrade = req.headers.get('upgrade')
                    if (upgrade != 'websocket') {
                        Log.w(this.TAG, 'Connection failed to upgrade', {upgrade})
                        return new Response(null, {status: 501})
                    }

                    const {socket, response} = Deno.upgradeWebSocket(req)
                    Log.v(this.TAG, 'Connection was upgraded', {upgrade})

                    socket.onopen = (open) => {
                        sessionId = crypto.randomUUID()
                        this._sessions[sessionId] = socket
                        this._options.onServerEvent(EEasyWsServerState.Connected, sessionId)
                        Log.i(this.TAG, 'Client connected, session registered', {sessionId, type: open.type})
                    }
                    socket.onclose = (close) => {
                        delete this._sessions[sessionId]
                        this._options.onServerEvent(EEasyWsServerState.Disconnected, sessionId)
                        Log.i(this.TAG, 'Client disconnected, session removed', {sessionId, type: close.type, code: close.code})
                    }
                    socket.onerror = (error) => {
                        this._options.onServerEvent(EEasyWsServerState.Error, error.type)
                        Log.e(this.TAG, `Server error`, {sessionId, type: error.type})
                    }
                    socket.onmessage = (message) => {
                        this._options.onMessageReceived(message.data, sessionId)
                        Log.v(this.TAG, 'Message received', {sessionId, type: message.type, message: message.data})
                    }
                    return response
                }
            })
            this._server.finished.then(() => {
                this._options.onServerEvent(EEasyWsServerState.Error, 'Server finished unexpectedly')
                Log.w(this.TAG, 'Server finished unexpectedly')
                if (this._options.keepAlive) this.restart()
            })
        } catch (e) {
            this._options.onServerEvent(EEasyWsServerState.Error, `${e}`)
            Log.e(this.TAG, 'Unable to start server', {port: this._options.port, error: e})
        }
    }

    async restart() {
        Log.i(this.TAG, 'Restarting server', {port: this._options.port})
        await this.start()
    }

    async shutdown() {
        Log.i(this.TAG, 'Shutting down server', {port: this._options.port})
        await this._server?.shutdown()
    }

    // endregion

    // region Sending
    private _unreadyStates: number[] = [WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED]

    sendMessage(message: string, toSessionId: string): boolean {
        const session = this._sessions[toSessionId]
        if (session && !this._unreadyStates.includes(session.readyState)) {
            session.send(message)
            Log.v(this.TAG, 'Sent message', {toSessionId, message})
            return true
        }
        return false
    }

    sendMessageToAll(message: string): number {
        let sent = 0
        for (const sessionId of Object.keys(this._sessions)) {
            if (this.sendMessage(message, sessionId)) sent++
        }
        Log.v(this.TAG, 'Message sent to all', {sent, message})
        return sent
    }

    sendMessageToOthers(message: string, mySessionId: string): number {
        let sent = 0
        for (const sessionId of Object.keys(this._sessions)) {
            if (sessionId != mySessionId) {
                if (this.sendMessage(message, sessionId)) sent++
            }
        }
        Log.v(this.TAG, 'Message sent to others', {sent, message, mySessionId})
        return sent
    }

    sendMessageToGroup(message: string, toSessionIds: string[]): number {
        let sent = 0
        for (const sessionId of toSessionIds) {
            if (this.sendMessage(message, sessionId)) sent++
        }
        Log.v(this.TAG, 'Message sent to group', {sent, message, sessionIds: toSessionIds})
        return sent
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
